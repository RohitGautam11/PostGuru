import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Comment, Conversation, Provider, SocialAccount } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { AuthUser, CurrentUser, MinRole, ROLE_RANK } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from '../social/accounts.service';
import { classifySentiment } from '../social/sentiment';

type ThreadType = 'dm' | 'page_message' | 'comment' | 'mention' | 'reply';
type ThreadStatus = 'open' | 'assigned' | 'resolved';

class ReplyDto {
  @IsString() @MinLength(1) @MaxLength(2000) text: string;
  /** Comment threads: the specific comment being replied to (defaults to the thread root). */
  @IsOptional() @IsString() replyToId?: string;
}

class NoteDto {
  @IsString() @MinLength(1) @MaxLength(2000) text: string;
}

class MuteDto {
  @IsBoolean() muted: boolean;
}

class UpdateThreadDto {
  @IsOptional() @IsBoolean() resolved?: boolean;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() assigneeId?: string | null;
  @IsOptional() @IsBoolean() flagged?: boolean;
  @IsOptional() @IsBoolean() read?: boolean;
}

const ACCOUNT_SELECT = { id: true, provider: true, name: true, username: true, avatarUrl: true } as const;
type AccountRef = Pick<SocialAccount, 'id' | 'provider' | 'name' | 'username' | 'avatarUrl'>;
type CommentWithAccount = Comment & { socialAccount: AccountRef };

const statusOf = (r: { resolvedAt: Date | null; assigneeId: string | null }): ThreadStatus =>
  r.resolvedAt ? 'resolved' : r.assigneeId ? 'assigned' : 'open';

/**
 * Unified inbox: direct-message conversations and comment threads (comments, mentions, replies)
 * from every connected platform, in one list with a shared resolve / assign / flag workflow.
 */
@Controller('inbox/threads')
export class ThreadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('filter') filter = 'all',
    @Query('provider') provider?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const wid = user.workspaceId;
    const providerFilter = provider && provider !== 'all' ? (provider.toUpperCase() as Provider) : undefined;

    const [conversations, comments, members, muted] = await Promise.all([
      this.prisma.conversation.findMany({
        where: { workspaceId: wid, ...(providerFilter ? { socialAccount: { provider: providerFilter } } : {}) },
        orderBy: { lastMessageAt: 'desc' },
        take: 200,
        include: { socialAccount: { select: ACCOUNT_SELECT } },
      }),
      this.prisma.comment.findMany({
        where: { workspaceId: wid, ...(providerFilter ? { socialAccount: { provider: providerFilter } } : {}) },
        orderBy: { postedAt: 'desc' },
        take: 600,
        include: { socialAccount: { select: ACCOUNT_SELECT } },
      }),
      this.memberMap(wid),
      this.mutedSet(wid),
    ]);

    const dmThreads = conversations.map((c) => this.dmSummary(c, members, muted));
    const commentThreads = groupCommentThreads(comments).map((g) => this.commentSummary(g, members, muted));
    const everything = [...dmThreads, ...commentThreads];
    // Muted contacts are kept out of the inbox; they are listed under the "muted" filter.
    let threads = filter === 'muted' ? everything.filter((t) => t.muted) : everything.filter((t) => !t.muted);

    const counts = {
      muted: everything.filter((t) => t.muted).length,
      all: threads.length,
      unread: threads.filter((t) => t.unread).length,
      comments: threads.filter((t) => t.type === 'comment').length,
      dms: threads.filter((t) => t.type === 'dm' || t.type === 'page_message').length,
      mentions: threads.filter((t) => t.type === 'mention' || t.type === 'reply').length,
    };

    if (status === 'open' || status === 'assigned' || status === 'resolved') threads = threads.filter((t) => t.status === status);
    if (filter === 'unread') threads = threads.filter((t) => t.unread);
    if (filter === 'comments') threads = threads.filter((t) => t.type === 'comment');
    if (filter === 'dms') threads = threads.filter((t) => t.type === 'dm' || t.type === 'page_message');
    if (filter === 'mentions') threads = threads.filter((t) => t.type === 'mention' || t.type === 'reply');
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      threads = threads.filter((t) => t.author.name.toLowerCase().includes(q) || (t.preview ?? '').toLowerCase().includes(q));
    }
    threads.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
    return { items: threads.slice(0, 150), counts };
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const thread = await this.loadThread(user, id);
    const notes = await this.prisma.threadNote.findMany({
      where: { workspaceId: user.workspaceId, threadId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, text: true, authorId: true, authorName: true, createdAt: true },
    });
    return { ...thread, notes };
  }

  // ─── Internal notes (visible to the team only) ───────────────────────────
  @MinRole('EDITOR')
  @Post(':id/notes')
  async addNote(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    await this.assertThread(user, id);
    return this.prisma.threadNote.create({
      data: { workspaceId: user.workspaceId, threadId: id, authorId: user.id, authorName: user.name, text: dto.text.trim() },
      select: { id: true, text: true, authorId: true, authorName: true, createdAt: true },
    });
  }

  @MinRole('EDITOR')
  @Delete(':id/notes/:noteId')
  async deleteNote(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('noteId') noteId: string) {
    const note = await this.prisma.threadNote.findFirst({ where: { id: noteId, threadId: id, workspaceId: user.workspaceId } });
    if (!note) throw new NotFoundException('Note not found');
    if (note.authorId !== user.id && ROLE_RANK[user.role] < ROLE_RANK.ADMIN) throw new ForbiddenException('You can only delete your own notes');
    await this.prisma.threadNote.delete({ where: { id: note.id } });
    return { ok: true };
  }

  // ─── Mute contact ────────────────────────────────────────────────────────
  /** Mutes (or unmutes) the thread's contact: their conversations and comments leave the inbox. */
  @MinRole('EDITOR')
  @HttpCode(200)
  @Post(':id/mute')
  async mute(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MuteDto) {
    const contact = await this.contactOf(user, id);
    if (!contact.externalId) throw new BadRequestException('This contact cannot be muted');
    const where = { socialAccountId_externalId: { socialAccountId: contact.socialAccountId, externalId: contact.externalId } };
    if (dto.muted) {
      await this.prisma.mutedContact.upsert({
        where,
        create: { workspaceId: user.workspaceId, socialAccountId: contact.socialAccountId, externalId: contact.externalId, name: contact.name, mutedById: user.id },
        update: {},
      });
    } else {
      await this.prisma.mutedContact.deleteMany({ where: { workspaceId: user.workspaceId, socialAccountId: contact.socialAccountId, externalId: contact.externalId } });
    }
    return { muted: dto.muted };
  }

  private async contactOf(user: AuthUser, id: string) {
    const [kind, recordId] = this.parseId(id);
    if (kind === 'dm') {
      const c = await this.prisma.conversation.findFirst({ where: { id: recordId, workspaceId: user.workspaceId } });
      if (!c) throw new NotFoundException('Conversation not found');
      return { socialAccountId: c.socialAccountId, externalId: c.participantExternalId, name: c.participantName };
    }
    const root = await this.prisma.comment.findFirst({ where: { id: recordId, workspaceId: user.workspaceId } });
    if (!root) throw new NotFoundException('Thread not found');
    const first = root.isOwn
      ? await this.prisma.comment.findFirst({
          where: { socialAccountId: root.socialAccountId, externalPostId: root.externalPostId, isOwn: false, parentExternalId: root.externalId },
          orderBy: { postedAt: 'asc' },
        })
      : root;
    return { socialAccountId: root.socialAccountId, externalId: first?.authorExternalId ?? null, name: first?.authorName ?? root.authorName };
  }

  private async assertThread(user: AuthUser, id: string) {
    const [kind, recordId] = this.parseId(id);
    const exists =
      kind === 'dm'
        ? await this.prisma.conversation.count({ where: { id: recordId, workspaceId: user.workspaceId } })
        : await this.prisma.comment.count({ where: { id: recordId, workspaceId: user.workspaceId } });
    if (!exists) throw new NotFoundException('Thread not found');
  }

  private async mutedSet(workspaceId: string) {
    const rows = await this.prisma.mutedContact.findMany({ where: { workspaceId }, select: { socialAccountId: true, externalId: true } });
    return new Set(rows.map((r) => `${r.socialAccountId}:${r.externalId}`));
  }

  private async loadThread(user: AuthUser, id: string) {
    const [members, muted] = await Promise.all([this.memberMap(user.workspaceId), this.mutedSet(user.workspaceId)]);
    const [kind, recordId] = this.parseId(id);

    if (kind === 'dm') {
      const conv = await this.prisma.conversation.findFirst({
        where: { id: recordId, workspaceId: user.workspaceId },
        include: { socialAccount: { select: ACCOUNT_SELECT }, messages: { orderBy: { sentAt: 'asc' }, take: 500 } },
      });
      if (!conv) throw new NotFoundException('Conversation not found');
      if (conv.unreadCount > 0) await this.prisma.conversation.update({ where: { id: conv.id }, data: { unreadCount: 0 } });
      return {
        ...this.dmSummary({ ...conv, unreadCount: 0 }, members, muted),
        messages: conv.messages.map((m) => ({
          id: m.id,
          from: m.direction === 'OUTBOUND' ? 'us' : 'them',
          author: m.direction === 'OUTBOUND' ? conv.socialAccount.name : m.senderName ?? conv.participantName,
          avatar: m.direction === 'OUTBOUND' ? conv.socialAccount.avatarUrl : conv.participantAvatar,
          text: m.text,
          attachments: m.attachments,
          sentAt: m.sentAt,
          delivered: m.direction === 'OUTBOUND',
        })),
      };
    }

    const root = await this.prisma.comment.findFirst({
      where: { id: recordId, workspaceId: user.workspaceId },
      include: { socialAccount: { select: ACCOUNT_SELECT } },
    });
    if (!root) throw new NotFoundException('Thread not found');
    const all = await this.prisma.comment.findMany({
      where: { socialAccountId: root.socialAccountId, externalPostId: root.externalPostId },
      orderBy: { postedAt: 'asc' },
      include: { socialAccount: { select: ACCOUNT_SELECT } },
    });
    const group = groupCommentThreads(all).find((g) => g.root.id === root.id) ?? { root, items: [root] };
    // Opening a thread marks its new comments as reviewed.
    await this.prisma.comment.updateMany({
      where: { id: { in: group.items.filter((c) => !c.isOwn && c.status === 'NEW').map((c) => c.id) } },
      data: { status: 'REVIEWED' },
    });
    return {
      ...this.commentSummary({ ...group, items: group.items.map((c) => ({ ...c, status: c.status === 'NEW' ? 'REVIEWED' : c.status })) }, members, muted),
      messages: group.items.map((c) => ({
        id: c.id,
        from: c.isOwn ? 'us' : 'them',
        author: c.isOwn ? c.socialAccount.name : c.authorName,
        handle: c.authorHandle,
        avatar: c.isOwn ? c.socialAccount.avatarUrl : c.authorAvatar,
        text: c.text,
        sentAt: c.postedAt,
        likes: c.likeCount,
        hidden: c.hidden,
        isNested: c.id !== group.root.id,
        // X posts have a stable public URL (used for “Quote tweet”).
        permalink: c.socialAccount.provider === 'X' && c.authorHandle ? `https://x.com/${c.authorHandle.replace(/^@/, '')}/status/${c.externalId}` : null,
      })),
    };
  }

  @MinRole('EDITOR')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/reply')
  async reply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReplyDto) {
    const [kind, recordId] = this.parseId(id);

    if (kind === 'dm') {
      const conv = await this.prisma.conversation.findFirst({
        where: { id: recordId, workspaceId: user.workspaceId },
        include: { socialAccount: true },
      });
      if (!conv) throw new NotFoundException('Conversation not found');
      const result = await this.accounts.withProvider(conv.socialAccount, async (ctx, provider) => {
        if (!provider.sendMessage) throw new BadRequestException(`${provider.displayName} does not support direct messages`);
        return provider.sendMessage(ctx, { externalId: conv.externalId, participantExternalId: conv.participantExternalId }, dto.text);
      });
      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.message.create({
          data: { conversationId: conv.id, externalId: result.externalId, direction: 'OUTBOUND', text: dto.text, senderName: user.name, sentAt: now },
        }),
        this.prisma.conversation.update({
          where: { id: conv.id },
          data: { lastMessageAt: now, lastMessagePreview: dto.text.slice(0, 200), unreadCount: 0 },
        }),
      ]);
      return { ok: true };
    }

    const target = await this.prisma.comment.findFirst({
      where: { id: dto.replyToId ?? recordId, workspaceId: user.workspaceId },
      include: { socialAccount: true },
    });
    if (!target) throw new NotFoundException('Comment not found');
    const result = await this.accounts.withProvider(target.socialAccount, async (ctx, provider) => {
      if (!provider.replyToComment) throw new BadRequestException(`${provider.displayName} does not support replies`);
      return provider.replyToComment(ctx, { externalId: target.externalId, externalPostId: target.externalPostId }, dto.text);
    });
    await this.prisma.$transaction([
      this.prisma.comment.upsert({
        where: { socialAccountId_externalId: { socialAccountId: target.socialAccountId, externalId: result.externalId } },
        create: {
          workspaceId: user.workspaceId,
          socialAccountId: target.socialAccountId,
          externalId: result.externalId,
          externalPostId: target.externalPostId,
          parentExternalId: target.externalId,
          postPermalink: target.postPermalink,
          postPreview: target.postPreview,
          authorName: target.socialAccount.name,
          authorHandle: target.socialAccount.username,
          authorAvatar: target.socialAccount.avatarUrl,
          text: dto.text,
          isOwn: true,
          status: 'REPLIED',
          sentiment: classifySentiment(dto.text),
          postedAt: new Date(),
        },
        update: {},
      }),
      this.prisma.comment.update({ where: { id: target.id }, data: { status: 'REPLIED' } }),
    ]);
    return { ok: true };
  }

  @MinRole('EDITOR')
  @HttpCode(200)
  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateThreadDto) {
    const [kind, recordId] = this.parseId(id);
    if (dto.assigneeId) {
      const member = await this.prisma.membership.findFirst({ where: { workspaceId: user.workspaceId, userId: dto.assigneeId } });
      if (!member) throw new BadRequestException('Assignee must be a member of this workspace');
    }
    const data = {
      ...(dto.resolved !== undefined ? { resolvedAt: dto.resolved ? new Date() : null } : {}),
      ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
      ...(dto.flagged !== undefined ? { flagged: dto.flagged } : {}),
    };

    if (kind === 'dm') {
      const { count } = await this.prisma.conversation.updateMany({
        where: { id: recordId, workspaceId: user.workspaceId },
        data: { ...data, ...(dto.read === false ? { unreadCount: 1 } : dto.read === true ? { unreadCount: 0 } : {}) },
      });
      if (!count) throw new NotFoundException('Conversation not found');
      return { ok: true };
    }

    const root = await this.prisma.comment.findFirst({ where: { id: recordId, workspaceId: user.workspaceId } });
    if (!root) throw new NotFoundException('Thread not found');
    await this.prisma.comment.update({
      where: { id: root.id },
      data: { ...data, ...(dto.read === false ? { status: 'NEW' } : dto.read === true && root.status === 'NEW' ? { status: 'REVIEWED' } : {}) },
    });
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────────────────

  private parseId(id: string): ['dm' | 'cm', string] {
    const [kind, recordId] = id.split('_');
    if ((kind !== 'dm' && kind !== 'cm') || !recordId) throw new BadRequestException('Invalid thread id');
    return [kind, recordId];
  }

  private async memberMap(workspaceId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { workspaceId },
      select: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });
    return new Map(memberships.map((m) => [m.user.id, m.user]));
  }

  private dmSummary(
    c: Conversation & { socialAccount: AccountRef },
    members: Map<string, { id: string; name: string; avatarUrl: string | null }>,
    muted: Set<string>,
  ) {
    const type: ThreadType = c.socialAccount.provider === 'FACEBOOK' ? 'page_message' : 'dm';
    return {
      id: `dm_${c.id}`,
      type,
      provider: c.socialAccount.provider,
      account: c.socialAccount,
      author: { name: c.participantName, handle: c.participantHandle, avatar: c.participantAvatar },
      preview: c.lastMessagePreview,
      lastActivityAt: c.lastMessageAt,
      unread: c.unreadCount > 0,
      status: statusOf(c),
      assignee: c.assigneeId ? members.get(c.assigneeId) ?? null : null,
      flagged: c.flagged,
      sentiment: classifySentiment(c.lastMessagePreview ?? '').toLowerCase(),
      sourcePost: null,
      muted: !!c.participantExternalId && muted.has(`${c.socialAccountId}:${c.participantExternalId}`),
    };
  }

  private commentSummary(
    g: { root: CommentWithAccount; items: CommentWithAccount[] },
    members: Map<string, { id: string; name: string; avatarUrl: string | null }>,
    muted: Set<string>,
  ) {
    const { root, items } = g;
    const latest = items.reduce((a, b) => (a.postedAt > b.postedAt ? a : b));
    const firstExternal = items.find((c) => !c.isOwn) ?? root;
    const type: ThreadType = root.socialAccount.provider === 'X' ? (root.parentExternalId ? 'reply' : 'mention') : 'comment';
    return {
      id: `cm_${root.id}`,
      type,
      provider: root.socialAccount.provider,
      account: root.socialAccount,
      author: { name: firstExternal.authorName, handle: firstExternal.authorHandle, avatar: firstExternal.authorAvatar },
      preview: latest.text,
      lastActivityAt: latest.postedAt,
      unread: items.some((c) => !c.isOwn && c.status === 'NEW'),
      status: statusOf(root),
      assignee: root.assigneeId ? members.get(root.assigneeId) ?? null : null,
      flagged: root.flagged,
      sentiment: root.sentiment.toLowerCase(),
      hidden: root.hidden,
      sourcePost: root.postPreview || root.postPermalink ? { title: root.postPreview ?? 'View post', permalink: root.postPermalink } : null,
      muted: !!firstExternal.authorExternalId && muted.has(`${root.socialAccountId}:${firstExternal.authorExternalId}`),
    };
  }
}

/** Groups comments into threads: each root (a comment whose parent we don't have) plus all its descendants. */
function groupCommentThreads(comments: CommentWithAccount[]) {
  const byExternal = new Map(comments.map((c) => [`${c.socialAccountId}:${c.externalId}`, c]));
  const rootOf = (c: CommentWithAccount): CommentWithAccount => {
    let cur = c;
    for (let i = 0; i < 20 && cur.parentExternalId; i++) {
      const parent = byExternal.get(`${cur.socialAccountId}:${cur.parentExternalId}`);
      if (!parent) break;
      cur = parent;
    }
    return cur;
  };
  const groups = new Map<string, { root: CommentWithAccount; items: CommentWithAccount[] }>();
  for (const c of comments) {
    const root = rootOf(c);
    const g = groups.get(root.id) ?? { root, items: [] };
    g.items.push(c);
    groups.set(root.id, g);
  }
  // A thread must contain at least one message from someone other than us.
  return [...groups.values()]
    .filter((g) => g.items.some((c) => !c.isOwn))
    .map((g) => ({ ...g, items: g.items.sort((a, b) => a.postedAt.getTime() - b.postedAt.getTime()) }));
}



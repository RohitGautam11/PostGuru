import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PostStatus, Prisma, Provider } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { PLAN_LIMITS } from '../../common/plans';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from '../social/accounts.service';
import { ProviderRegistry } from '../social/provider.registry';
import { ListPostsQuery, UpsertPostDto } from './posts.dto';
import { PublisherService, StoredMedia } from './publisher.service';

const POST_INCLUDE = {
  author: { select: { id: true, name: true, avatarUrl: true } },
  targets: {
    select: {
      id: true,
      status: true,
      externalId: true,
      permalink: true,
      error: true,
      attempts: true,
      publishedAt: true,
      likes: true,
      comments: true,
      shares: true,
      impressions: true,
      socialAccount: { select: { id: true, provider: true, name: true, username: true, avatarUrl: true } },
    },
  },
} satisfies Prisma.PostInclude;

const LOCKED: PostStatus[] = ['PUBLISHING', 'PUBLISHED', 'PARTIAL'];

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    private readonly accounts: AccountsService,
    private readonly publisher: PublisherService,
  ) {}

  async list(workspaceId: string, q: ListPostsQuery) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const statuses = q.status
      ?.split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s): s is PostStatus => Object.values(PostStatus).includes(s as PostStatus));

    const where: Prisma.PostWhereInput = {
      workspaceId,
      ...(statuses?.length ? { status: { in: statuses } } : {}),
      ...(q.accountId ? { targets: { some: { socialAccountId: q.accountId } } } : {}),
      ...(q.search ? { content: { contains: q.search, mode: 'insensitive' } } : {}),
      ...(q.from || q.to
        ? {
            OR: [
              { scheduledAt: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } },
              { publishedAt: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: POST_INCLUDE,
        orderBy: [{ scheduledAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.post.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(workspaceId: string, id: string) {
    const post = await this.prisma.post.findFirst({ where: { id, workspaceId }, include: POST_INCLUDE });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async create(user: AuthUser, dto: UpsertPostDto) {
    const prepared = await this.prepare(user.workspaceId, dto);
    if (dto.action !== 'draft') await this.assertScheduleQuota(user.workspaceId);

    const post = await this.prisma.post.create({
      data: {
        workspaceId: user.workspaceId,
        authorId: user.id,
        content: dto.content,
        media: prepared.media as unknown as Prisma.InputJsonValue,
        link: dto.link ?? null,
        overrides: (prepared.overrides ?? undefined) as Prisma.InputJsonValue | undefined,
        status: dto.action === 'draft' ? 'DRAFT' : 'SCHEDULED',
        scheduledAt: prepared.scheduledAt,
        targets: { create: prepared.accountIds.map((socialAccountId) => ({ socialAccountId })) },
      },
    });

    if (dto.action === 'publish') await this.publisher.processPost(post.id);
    return this.get(user.workspaceId, post.id);
  }

  async update(user: AuthUser, id: string, dto: UpsertPostDto) {
    const existing = await this.get(user.workspaceId, id);
    if (LOCKED.includes(existing.status)) throw new ConflictException('Published posts cannot be edited');
    const prepared = await this.prepare(user.workspaceId, dto);
    if (dto.action !== 'draft' && existing.status === 'DRAFT') await this.assertScheduleQuota(user.workspaceId);

    await this.prisma.$transaction([
      this.prisma.postTarget.deleteMany({ where: { postId: id } }),
      this.prisma.post.update({
        where: { id },
        data: {
          content: dto.content,
          media: prepared.media as unknown as Prisma.InputJsonValue,
          link: dto.link ?? null,
          overrides: (prepared.overrides ?? Prisma.DbNull) as Prisma.InputJsonValue,
          status: dto.action === 'draft' ? 'DRAFT' : 'SCHEDULED',
          scheduledAt: prepared.scheduledAt,
          lockedAt: null,
          targets: { create: prepared.accountIds.map((socialAccountId) => ({ socialAccountId })) },
        },
      }),
    ]);

    if (dto.action === 'publish') await this.publisher.processPost(id);
    return this.get(user.workspaceId, id);
  }

  async remove(user: AuthUser, id: string, deleteRemote: boolean) {
    const post = await this.prisma.post.findFirst({
      where: { id, workspaceId: user.workspaceId },
      include: { targets: { include: { socialAccount: true } } },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.status === 'PUBLISHING') throw new ConflictException('Post is being published right now. Try again in a minute.');

    const remoteErrors: string[] = [];
    if (deleteRemote) {
      for (const t of post.targets.filter((t) => t.status === 'PUBLISHED' && t.externalId)) {
        try {
          await this.accounts.withProvider(t.socialAccount, async (ctx, provider) => {
            if (!provider.deletePost) throw new Error(`${provider.displayName} does not support deleting posts via API`);
            await provider.deletePost(ctx, t.externalId!);
          });
        } catch (err) {
          remoteErrors.push(`${t.socialAccount.name}: ${(err as Error).message}`);
        }
      }
    }
    await this.prisma.post.delete({ where: { id } });
    return { ok: true, remoteErrors };
  }

  async duplicate(user: AuthUser, id: string) {
    const src = await this.get(user.workspaceId, id);
    const copy = await this.prisma.post.create({
      data: {
        workspaceId: user.workspaceId,
        authorId: user.id,
        content: src.content,
        media: src.media as Prisma.InputJsonValue,
        link: src.link,
        overrides: (src.overrides ?? undefined) as Prisma.InputJsonValue | undefined,
        status: 'DRAFT',
        targets: { create: src.targets.map((t) => ({ socialAccountId: t.socialAccount.id })) },
      },
    });
    return this.get(user.workspaceId, copy.id);
  }

  /** Publish immediately (drafts, scheduled posts) or retry failed targets. */
  async publishNow(user: AuthUser, id: string) {
    const post = await this.get(user.workspaceId, id);
    if (post.status === 'PUBLISHING') throw new ConflictException('Post is already being published');
    if (post.status === 'PUBLISHED') throw new ConflictException('Post is already published');
    if (!post.targets.length) throw new BadRequestException('Select at least one account');
    if (post.status === 'DRAFT') await this.assertScheduleQuota(user.workspaceId);

    await this.prisma.$transaction([
      this.prisma.postTarget.updateMany({
        where: { postId: id, status: { in: ['FAILED', 'PENDING'] } },
        data: { status: 'PENDING', attempts: 0, error: null },
      }),
      this.prisma.post.update({ where: { id }, data: { status: 'SCHEDULED', scheduledAt: new Date() } }),
    ]);
    await this.publisher.processPost(id);
    return this.get(user.workspaceId, id);
  }

  /** Move a scheduled post on the calendar (drag & drop). */
  async reschedule(user: AuthUser, id: string, scheduledAt: string) {
    const post = await this.get(user.workspaceId, id);
    if (post.status !== 'SCHEDULED' && post.status !== 'DRAFT') {
      throw new ConflictException('Only drafts and scheduled posts can be rescheduled');
    }
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('Pick a time in the future');
    }
    await this.prisma.post.update({ where: { id }, data: { scheduledAt: when } });
    return this.get(user.workspaceId, id);
  }

  // ───────────────────────────────────────────────────────────────────────────

  private async prepare(workspaceId: string, dto: UpsertPostDto) {
    const accountIds = [...new Set(dto.accountIds)];
    const accounts = accountIds.length
      ? await this.prisma.socialAccount.findMany({ where: { id: { in: accountIds }, workspaceId } })
      : [];
    if (accounts.length !== accountIds.length) throw new BadRequestException('One or more selected accounts were not found');

    const mediaIds = dto.mediaIds ?? [];
    const assets = mediaIds.length
      ? await this.prisma.mediaAsset.findMany({ where: { id: { in: mediaIds }, workspaceId } })
      : [];
    if (assets.length !== new Set(mediaIds).size) throw new BadRequestException('One or more media files were not found');
    const byId = new Map(assets.map((a) => [a.id, a]));
    const media: StoredMedia[] = mediaIds.map((id) => {
      const a = byId.get(id)!;
      return { id: a.id, url: a.url, type: a.type, mimeType: a.mimeType, size: a.size };
    });

    const overrides = this.sanitizeOverrides(dto.overrides);

    let scheduledAt: Date | null = null;
    if (dto.action === 'schedule') {
      if (!dto.scheduledAt) throw new BadRequestException('Choose a date and time to schedule this post');
      scheduledAt = new Date(dto.scheduledAt);
      if (scheduledAt.getTime() < Date.now() - 60_000) throw new BadRequestException('Scheduled time must be in the future');
    } else if (dto.action === 'publish') {
      scheduledAt = new Date();
    } else if (dto.scheduledAt) {
      scheduledAt = new Date(dto.scheduledAt); // drafts may keep a tentative date for the calendar
    }

    if (dto.action !== 'draft') {
      if (!accounts.length) throw new BadRequestException('Select at least one account');
      if (!dto.content.trim() && !media.length) throw new BadRequestException('Write something or attach media');
      const errors: string[] = [];
      for (const account of accounts) {
        if (account.status === 'EXPIRED') errors.push(`${account.name}: reconnect this account before publishing`);
        const caps = this.registry.get(account.provider).capabilities;
        const text = overrides?.[account.provider]?.content?.trim() ? overrides[account.provider]!.content! : dto.content;
        const full = dto.link && !text.includes(dto.link) ? `${text} ${dto.link}` : text;
        const images = media.filter((m) => m.type === 'IMAGE').length;
        const videos = media.filter((m) => m.type === 'VIDEO').length;
        const label = `${this.registry.get(account.provider).displayName} (${account.name})`;
        if (charLength(full, account.provider) > caps.maxChars) errors.push(`${label}: text exceeds ${caps.maxChars} characters`);
        if (caps.requiresVideo && !videos) errors.push(`${label}: a video is required`);
        else if (caps.requiresMedia && !media.length) errors.push(`${label}: an image or video is required`);
        if (videos && !caps.video) errors.push(`${label}: videos are not supported`);
        if (images > caps.maxImages && !caps.requiresVideo) errors.push(`${label}: at most ${caps.maxImages} images`);
        if (videos > 1 && account.provider !== 'INSTAGRAM') errors.push(`${label}: only one video per post`);
        if (videos && images && account.provider !== 'INSTAGRAM') errors.push(`${label}: cannot mix images and video`);
      }
      if (errors.length) throw new BadRequestException(errors);
    }

    return { accountIds, media, overrides, scheduledAt };
  }

  private sanitizeOverrides(raw?: Record<string, { content?: string; title?: string; tags?: string[] }>) {
    if (!raw) return null;
    const out: Partial<Record<Provider, { content?: string; title?: string; tags?: string[] }>> = {};
    for (const key of Object.values(Provider)) {
      const v = raw[key];
      if (!v || typeof v !== 'object') continue;
      const content = typeof v.content === 'string' ? v.content.slice(0, 63206) : undefined;
      const title = typeof v.title === 'string' ? v.title.slice(0, 100) : undefined;
      // YouTube allows up to 500 characters of tags in total.
      let tags: string[] | undefined;
      if (Array.isArray(v.tags)) {
        tags = [];
        let total = 0;
        for (const t of v.tags) {
          if (typeof t !== 'string') continue;
          const clean = t.replace(/^#/, '').replace(/[<>]/g, '').trim().slice(0, 100);
          if (!clean || tags.includes(clean) || total + clean.length > 500) continue;
          tags.push(clean);
          total += clean.length;
        }
        if (!tags.length) tags = undefined;
      }
      if (content || title || tags) out[key] = { content, title, tags };
    }
    return Object.keys(out).length ? out : null;
  }

  private async assertScheduleQuota(workspaceId: string) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const limit = PLAN_LIMITS[ws.plan].scheduledPostsPerMonth;
    if (limit < 0) return;
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const used = await this.prisma.post.count({
      where: { workspaceId, status: { not: 'DRAFT' }, createdAt: { gte: monthStart } },
    });
    if (used >= limit) {
      throw new ForbiddenException(`You've used all ${limit} posts included in the ${PLAN_LIMITS[ws.plan].name} plan this month. Upgrade for unlimited posts.`);
    }
  }
}

/** X counts every URL as 23 characters; other platforms count raw characters. */
function charLength(text: string, provider: Provider) {
  if (provider !== 'X') return [...text].length;
  return [...text.replace(/https?:\/\/\S+/g, 'x'.repeat(23))].length;
}

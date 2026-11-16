import { Injectable, Logger } from '@nestjs/common';
import { SocialAccount } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccountsService } from './accounts.service';
import { AccountContext, RemoteComment, RemoteConversation, SocialProvider } from './provider.types';
import { classifySentiment } from './sentiment';

export interface SyncOptions {
  comments?: boolean;
  inbox?: boolean;
  metrics?: boolean;
}

export interface SyncResult {
  accountId: string;
  newComments: number;
  newMessages: number;
  errors: string[];
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly notifications: NotificationsService,
  ) {}

  async syncWorkspace(workspaceId: string, opts: SyncOptions = { comments: true, inbox: true, metrics: true }) {
    const accounts = await this.prisma.socialAccount.findMany({ where: { workspaceId, status: { not: 'EXPIRED' } } });
    const results: SyncResult[] = [];
    for (const account of accounts) results.push(await this.syncAccount(account, opts));
    return results;
  }

  async syncAccount(account: SocialAccount, opts: SyncOptions = { comments: true, inbox: true, metrics: true }): Promise<SyncResult> {
    const result: SyncResult = { accountId: account.id, newComments: 0, newMessages: 0, errors: [] };

    await this.accounts
      .withProvider(account, async (ctx, provider) => {
        if (opts.comments && provider.fetchComments) {
          try {
            const known = await this.prisma.postTarget.findMany({
              where: { socialAccountId: account.id, status: 'PUBLISHED', externalId: { not: null } },
              orderBy: { publishedAt: 'desc' },
              take: 20,
              select: { externalId: true },
            });
            const remote = await provider.fetchComments(ctx, known.map((k) => k.externalId!));
            result.newComments = await this.storeComments(account, remote);
          } catch (err) {
            result.errors.push(`comments: ${(err as Error).message}`);
          }
        }

        if (opts.inbox && provider.fetchConversations) {
          try {
            const remote = await provider.fetchConversations(ctx);
            result.newMessages = await this.storeConversations(account, remote);
          } catch (err) {
            result.errors.push(`inbox: ${(err as Error).message}`);
          }
        }

        if (opts.metrics) {
          try {
            await this.storeMetrics(account, ctx, provider);
          } catch (err) {
            result.errors.push(`metrics: ${(err as Error).message}`);
          }
        }
      })
      .catch((err) => result.errors.push((err as Error).message));

    await this.prisma.socialAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date() },
    });

    if (result.newMessages > 0) {
      await this.notifications.notifyWorkspace(account.workspaceId, 'newMessages', {
        title: `${result.newMessages} new message${result.newMessages > 1 ? 's' : ''} on ${account.name}`,
        link: '/inbox',
      });
    }
    if (result.newComments > 0) {
      await this.notifications.notifyWorkspace(account.workspaceId, 'newComments', {
        title: `${result.newComments} new comment${result.newComments > 1 ? 's' : ''} on ${account.name}`,
        link: '/inbox?filter=comments',
      });
    }
    if (result.errors.length) this.logger.warn(`Sync ${account.id}: ${result.errors.join('; ')}`);
    return result;
  }

  private async storeComments(account: SocialAccount, remote: RemoteComment[]): Promise<number> {
    if (!remote.length) return 0;
    const existing = await this.prisma.comment.findMany({
      where: { socialAccountId: account.id, externalId: { in: remote.map((c) => c.externalId) } },
      select: { externalId: true },
    });
    const known = new Set(existing.map((e) => e.externalId));
    let fresh = 0;

    for (const c of remote) {
      const isNew = !known.has(c.externalId);
      if (isNew && !c.isOwn) fresh++;
      await this.prisma.comment.upsert({
        where: { socialAccountId_externalId: { socialAccountId: account.id, externalId: c.externalId } },
        create: {
          workspaceId: account.workspaceId,
          socialAccountId: account.id,
          externalId: c.externalId,
          externalPostId: c.externalPostId,
          parentExternalId: c.parentExternalId ?? null,
          postPermalink: c.postPermalink ?? null,
          postPreview: c.postPreview ?? null,
          authorExternalId: c.authorExternalId ?? null,
          authorName: c.authorName,
          authorHandle: c.authorHandle ?? null,
          authorAvatar: c.authorAvatar ?? null,
          text: c.text,
          likeCount: c.likeCount ?? 0,
          hidden: Boolean(c.hidden),
          isOwn: Boolean(c.isOwn),
          status: c.isOwn ? 'REVIEWED' : c.hidden ? 'HIDDEN' : 'NEW',
          sentiment: classifySentiment(c.text),
          postedAt: c.postedAt,
        },
        update: {
          text: c.text,
          likeCount: c.likeCount ?? 0,
          hidden: Boolean(c.hidden),
          postPreview: c.postPreview ?? undefined,
        },
      });
    }

    // A comment that we've replied to (from any tool) counts as handled.
    const repliedParents = remote.filter((c) => c.isOwn && c.parentExternalId).map((c) => c.parentExternalId!);
    if (repliedParents.length) {
      await this.prisma.comment.updateMany({
        where: { socialAccountId: account.id, externalId: { in: repliedParents }, status: { in: ['NEW', 'REVIEWED'] } },
        data: { status: 'REPLIED' },
      });
    }
    return fresh;
  }

  private async storeConversations(account: SocialAccount, remote: RemoteConversation[]): Promise<number> {
    let fresh = 0;
    for (const conv of remote) {
      const existing = await this.prisma.conversation.findUnique({
        where: { socialAccountId_externalId: { socialAccountId: account.id, externalId: conv.externalId } },
        select: { id: true, unreadCount: true },
      });
      const record = await this.prisma.conversation.upsert({
        where: { socialAccountId_externalId: { socialAccountId: account.id, externalId: conv.externalId } },
        create: {
          workspaceId: account.workspaceId,
          socialAccountId: account.id,
          externalId: conv.externalId,
          participantExternalId: conv.participantExternalId ?? null,
          participantName: conv.participantName,
          participantHandle: conv.participantHandle ?? null,
          participantAvatar: conv.participantAvatar ?? null,
          lastMessageAt: conv.lastMessageAt,
          lastMessagePreview: conv.snippet?.slice(0, 200) ?? null,
          unreadCount: 0,
        },
        update: {
          participantName: conv.participantName,
          participantHandle: conv.participantHandle ?? undefined,
          participantAvatar: conv.participantAvatar ?? undefined,
          participantExternalId: conv.participantExternalId ?? undefined,
          lastMessageAt: conv.lastMessageAt,
          lastMessagePreview: conv.snippet?.slice(0, 200) ?? undefined,
        },
      });

      const ids = conv.messages.map((m) => m.externalId);
      const known = new Set(
        (
          await this.prisma.message.findMany({
            where: { conversationId: record.id, externalId: { in: ids } },
            select: { externalId: true },
          })
        ).map((m) => m.externalId),
      );
      const newMessages = conv.messages.filter((m) => !known.has(m.externalId));
      if (newMessages.length) {
        await this.prisma.message.createMany({
          data: newMessages.map((m) => ({
            conversationId: record.id,
            externalId: m.externalId,
            direction: m.direction,
            text: m.text,
            senderName: m.senderName ?? null,
            attachments: m.attachments?.length ? m.attachments : undefined,
            sentAt: m.sentAt,
          })),
          skipDuplicates: true,
        });
      }
      const inbound = newMessages.filter((m) => m.direction === 'INBOUND').length;
      if (inbound) {
        fresh += inbound;
        await this.prisma.conversation.update({
          where: { id: record.id },
          data: {
            unreadCount: (existing?.unreadCount ?? 0) + inbound,
            status: 'OPEN',
          },
        });
      }
    }
    return fresh;
  }

  private async storeMetrics(account: SocialAccount, ctx: AccountContext, provider: SocialProvider) {
    if (provider.fetchAccountMetrics) {
      const m = await provider.fetchAccountMetrics(ctx);
      const today = new Date(new Date().toISOString().slice(0, 10));
      const followers = m.followers ?? account.followers ?? 0;
      await this.prisma.accountMetric.upsert({
        where: { socialAccountId_date: { socialAccountId: account.id, date: today } },
        create: {
          socialAccountId: account.id,
          date: today,
          followers,
          impressions: m.impressions ?? 0,
          reach: m.reach ?? 0,
          engagement: m.engagement ?? 0,
        },
        update: { followers, impressions: m.impressions ?? 0, reach: m.reach ?? 0, engagement: m.engagement ?? 0 },
      });
      await this.prisma.socialAccount.update({ where: { id: account.id }, data: { followers } });
    }

    if (provider.fetchPostMetrics) {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      const targets = await this.prisma.postTarget.findMany({
        where: { socialAccountId: account.id, status: 'PUBLISHED', externalId: { not: null }, publishedAt: { gte: since } },
        orderBy: { publishedAt: 'desc' },
        take: 20,
      });
      for (const t of targets) {
        const pm = await provider.fetchPostMetrics(ctx, t.externalId!).catch(() => null);
        if (!pm) continue;
        await this.prisma.postTarget.update({
          where: { id: t.id },
          data: {
            likes: pm.likes ?? t.likes,
            comments: pm.comments ?? t.comments,
            shares: pm.shares ?? t.shares,
            impressions: pm.impressions ?? t.impressions,
          },
        });
      }
    }
  }
}

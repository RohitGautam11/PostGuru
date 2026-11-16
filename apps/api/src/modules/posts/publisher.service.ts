import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Provider } from '@prisma/client';
import { ProviderError } from '../../common/http';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccountsService } from '../social/accounts.service';
import { PublishInput, PublishMedia } from '../social/provider.types';

const MAX_ATTEMPTS = 3;
const STALE_LOCK_MS = 15 * 60 * 1000;

export interface StoredMedia extends PublishMedia {
  id: string;
}

@Injectable()
export class PublisherService {
  private readonly logger = new Logger(PublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Publishes every due post. Safe to call concurrently from several instances / cron ticks:
   * each post is claimed with an atomic conditional update, so it is processed exactly once.
   */
  async processDue({ limit = 20, budgetMs = 50_000 } = {}) {
    const started = Date.now();
    await this.recoverStale();
    const due = await this.prisma.post.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    let processed = 0;
    for (const { id } of due) {
      if (Date.now() - started > budgetMs) break;
      if (await this.processPost(id)) processed++;
    }
    return { due: due.length, processed };
  }

  /** Returns false if another worker already claimed the post. */
  async processPost(postId: string): Promise<boolean> {
    const now = new Date();
    const claim = await this.prisma.post.updateMany({
      where: { id: postId, status: 'SCHEDULED', scheduledAt: { lte: now } },
      data: { status: 'PUBLISHING', lockedAt: now },
    });
    if (claim.count === 0) return false;

    const post = await this.prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: { targets: { include: { socialAccount: true } } },
    });
    const media = (post.media as unknown as StoredMedia[]) ?? [];
    const overrides = (post.overrides as Record<string, { content?: string; title?: string }> | null) ?? {};

    const pending = post.targets.filter((t) => t.status === 'PENDING');
    await Promise.allSettled(
      pending.map(async (target) => {
        const account = target.socialAccount;
        await this.prisma.postTarget.update({
          where: { id: target.id },
          data: { status: 'PUBLISHING', attempts: { increment: 1 }, error: null },
        });
        const override = overrides[account.provider] ?? {};
        const input: PublishInput = {
          text: override.content?.trim() ? override.content : post.content,
          media: media.map(({ url, type, mimeType, size }) => ({ url, type, mimeType, size })),
          link: post.link,
          title: override.title ?? null,
        };

        try {
          if (account.status === 'EXPIRED') {
            throw new ProviderError(account.statusMessage ?? 'Account disconnected. Please reconnect.', 401, false, true);
          }
          const result = await this.accounts.withProvider(account, (ctx, provider) => provider.publish(ctx, input));
          await this.prisma.postTarget.update({
            where: { id: target.id },
            data: {
              status: 'PUBLISHED',
              externalId: result.externalId,
              permalink: result.permalink ?? null,
              publishedAt: new Date(),
              error: null,
            },
          });
        } catch (err) {
          const transient = err instanceof ProviderError && err.transient;
          const retry = transient && target.attempts + 1 < MAX_ATTEMPTS;
          const message = (err as Error).message?.slice(0, 1000) ?? 'Unknown error';
          this.logger.warn(`Publish ${post.id} → ${account.provider}/${account.id} failed: ${message}`);
          await this.prisma.postTarget.update({
            where: { id: target.id },
            data: { status: retry ? 'PENDING' : 'FAILED', error: message },
          });
        }
      }),
    );

    await this.finalize(post.id);
    return true;
  }

  private async finalize(postId: string) {
    const post = await this.prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: { targets: { include: { socialAccount: { select: { name: true, provider: true } } } } },
    });
    const statuses = post.targets.map((t) => t.status);
    const published = statuses.filter((s) => s === 'PUBLISHED').length;
    const failed = statuses.filter((s) => s === 'FAILED').length;
    const retrying = statuses.filter((s) => s === 'PENDING').length;

    let data: Prisma.PostUpdateInput;
    if (retrying > 0) {
      const attempts = Math.max(...post.targets.map((t) => t.attempts));
      data = { status: 'SCHEDULED', scheduledAt: new Date(Date.now() + 2 ** attempts * 60_000), lockedAt: null };
    } else if (published === statuses.length) {
      data = { status: 'PUBLISHED', publishedAt: new Date(), lockedAt: null };
    } else if (published === 0) {
      data = { status: 'FAILED', lockedAt: null };
    } else {
      data = { status: 'PARTIAL', publishedAt: new Date(), lockedAt: null };
    }
    await this.prisma.post.update({ where: { id: postId }, data });

    if (retrying) return;
    const preview = post.content.slice(0, 80) || 'Your post';
    if (published) {
      await this.notifications.notifyWorkspace(post.workspaceId, 'publishSuccess', {
        title: `Published to ${published} account${published > 1 ? 's' : ''}`,
        body: preview,
        link: `/posts/${post.id}`,
      });
    }
    if (failed) {
      const names = post.targets
        .filter((t) => t.status === 'FAILED')
        .map((t) => `${providerLabel(t.socialAccount.provider)} (${t.socialAccount.name})`)
        .join(', ');
      await this.notifications.notifyWorkspace(post.workspaceId, 'publishFailure', {
        title: `Publishing failed on ${failed} account${failed > 1 ? 's' : ''}`,
        body: `${names}: ${post.targets.find((t) => t.status === 'FAILED')?.error ?? ''}`.slice(0, 300),
        link: `/posts/${post.id}`,
      });
    }
  }

  /** A worker that crashed mid-publish leaves the post PUBLISHING. We fail those targets rather than
   *  retrying, because the platform may already have accepted the post (avoids duplicates). */
  private async recoverStale() {
    const cutoff = new Date(Date.now() - STALE_LOCK_MS);
    const stale = await this.prisma.post.findMany({
      where: { status: 'PUBLISHING', lockedAt: { lt: cutoff } },
      select: { id: true },
    });
    for (const { id } of stale) {
      await this.prisma.postTarget.updateMany({
        where: { postId: id, status: { in: ['PUBLISHING', 'PENDING'] } },
        data: { status: 'FAILED', error: 'Publishing timed out. Check the platform before retrying.' },
      });
      await this.finalize(id);
    }
  }
}

function providerLabel(p: Provider) {
  return { FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram', X: 'X', LINKEDIN: 'LinkedIn', YOUTUBE: 'YouTube', THREADS: 'Threads', TIKTOK: 'TikTok', PINTEREST: 'Pinterest' }[p];
}

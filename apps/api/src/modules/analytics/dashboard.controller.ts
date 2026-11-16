import { Controller, Get } from '@nestjs/common';
import { PostStatus } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';

const DAY = 24 * 3600 * 1000;
const EXPIRY_WARNING_DAYS = 7;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async dashboard(@CurrentUser() user: AuthUser) {
    const wid = user.workspaceId;
    const now = new Date();
    const today = startOfDay(now);
    const yesterday = new Date(today.getTime() - DAY);
    const weekEnd = new Date(today.getTime() + 7 * DAY);
    const weekAgo = new Date(now.getTime() - 7 * DAY);
    const twoWeeksAgo = new Date(now.getTime() - 14 * DAY);

    const [accounts, statusCounts, scheduledThisWeek, scheduledAddedToday, scheduledAddedYesterday, publishedToday, unreadDms, newComments, recentPosts, failedPosts, engagementNow, engagementPrev] =
      await Promise.all([
        this.prisma.socialAccount.findMany({
          where: { workspaceId: wid },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            provider: true,
            name: true,
            username: true,
            avatarUrl: true,
            followers: true,
            status: true,
            statusMessage: true,
            tokenExpiresAt: true,
            refreshToken: true,
          },
        }),
        this.prisma.post.groupBy({ by: ['status'], where: { workspaceId: wid }, _count: { _all: true } }),
        this.prisma.post.count({ where: { workspaceId: wid, status: 'SCHEDULED', scheduledAt: { gte: now, lt: weekEnd } } }),
        this.prisma.post.count({ where: { workspaceId: wid, status: 'SCHEDULED', createdAt: { gte: today } } }),
        this.prisma.post.count({ where: { workspaceId: wid, status: 'SCHEDULED', createdAt: { gte: yesterday, lt: today } } }),
        this.prisma.post.count({ where: { workspaceId: wid, status: { in: ['PUBLISHED', 'PARTIAL'] }, publishedAt: { gte: today } } }),
        this.prisma.conversation.count({ where: { workspaceId: wid, unreadCount: { gt: 0 }, resolvedAt: null } }),
        this.prisma.comment.count({ where: { workspaceId: wid, status: 'NEW', isOwn: false, parentExternalId: null } }),
        this.prisma.post.findMany({
          where: { workspaceId: wid },
          orderBy: { updatedAt: 'desc' },
          take: 25,
          select: {
            id: true,
            content: true,
            status: true,
            scheduledAt: true,
            publishedAt: true,
            updatedAt: true,
            author: { select: { id: true, name: true, avatarUrl: true } },
            targets: { select: { status: true, error: true, socialAccount: { select: { id: true, provider: true, name: true } } } },
          },
        }),
        this.prisma.post.findMany({
          where: { workspaceId: wid, status: { in: ['FAILED', 'PARTIAL'] }, updatedAt: { gte: weekAgo } },
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            content: true,
            targets: { where: { status: 'FAILED' }, select: { error: true, socialAccount: { select: { provider: true, name: true } } } },
          },
        }),
        this.prisma.postTarget.aggregate({
          where: { post: { workspaceId: wid }, status: 'PUBLISHED', publishedAt: { gte: weekAgo } },
          _sum: { likes: true, comments: true, shares: true, impressions: true },
        }),
        this.prisma.postTarget.aggregate({
          where: { post: { workspaceId: wid }, status: 'PUBLISHED', publishedAt: { gte: twoWeeksAgo, lt: weekAgo } },
          _sum: { likes: true, comments: true, shares: true, impressions: true },
        }),
      ]);

    const rate = (agg: typeof engagementNow) => {
      const s = agg._sum;
      const engagement = (s.likes ?? 0) + (s.comments ?? 0) + (s.shares ?? 0);
      return s.impressions ? Math.round((engagement / s.impressions) * 1000) / 10 : null;
    };
    const engagementRate = rate(engagementNow);
    const prevRate = rate(engagementPrev);

    // Account health: active | expiring | expired.
    const accountHealth = accounts.map(({ refreshToken, ...a }) => {
      const daysLeft = a.tokenExpiresAt ? Math.ceil((a.tokenExpiresAt.getTime() - now.getTime()) / DAY) : null;
      const expiring = !refreshToken && daysLeft !== null && daysLeft <= EXPIRY_WARNING_DAYS && daysLeft > 0;
      const health = a.status !== 'CONNECTED' ? 'expired' : expiring ? 'expiring' : 'active';
      return { ...a, health, daysUntilExpiry: expiring ? daysLeft : null };
    });

    const issues = [
      ...failedPosts.map((p) => ({
        id: `post-${p.id}`,
        type: 'error' as const,
        title: 'Publish Failed',
        provider: p.targets[0]?.socialAccount.provider ?? null,
        description: `Post '${p.content.slice(0, 40)}${p.content.length > 40 ? '…' : ''}' failed — ${p.targets[0]?.error ?? 'see details'}`,
        action: { label: 'Review Post', href: `/posts/${p.id}` },
      })),
      ...accountHealth
        .filter((a) => a.health !== 'active')
        .map((a) => ({
          id: `account-${a.id}`,
          type: a.health === 'expired' ? ('error' as const) : ('warning' as const),
          title: a.health === 'expired' ? 'Token Expired' : 'Token Expiring',
          provider: a.provider,
          description:
            a.health === 'expired'
              ? `${a.name} needs to be reconnected. Posts to this account are paused.`
              : `${a.name} token expires in ${a.daysUntilExpiry} day${a.daysUntilExpiry === 1 ? '' : 's'}. Reconnect to avoid interruptions.`,
          action: { label: 'Reconnect', href: '/connect' },
        })),
    ];

    const counts = Object.fromEntries(statusCounts.map((c) => [c.status, c._count._all])) as Partial<Record<PostStatus, number>>;

    return {
      stats: {
        scheduled: counts.SCHEDULED ?? 0,
        scheduledThisWeek,
        scheduledDelta: scheduledAddedToday - scheduledAddedYesterday,
        scheduledAddedToday,
        publishedToday,
        accounts: accounts.length,
        accountsNeedingAttention: accountHealth.filter((a) => a.health !== 'active').length,
        accountsHealthy: accountHealth.filter((a) => a.health === 'active').length,
        unreadInbox: unreadDms + newComments,
        engagementRate,
        engagementRateChange: engagementRate !== null && prevRate !== null ? Math.round((engagementRate - prevRate) * 10) / 10 : null,
        followers: accounts.reduce((s, a) => s + (a.followers ?? 0), 0),
      },
      postCounts: {
        all: Object.values(counts).reduce((s, n) => s + (n ?? 0), 0),
        scheduled: counts.SCHEDULED ?? 0,
        published: (counts.PUBLISHED ?? 0) + (counts.PARTIAL ?? 0),
        failed: counts.FAILED ?? 0,
        draft: counts.DRAFT ?? 0,
      },
      issues,
      posts: recentPosts,
      accounts: accountHealth,
    };
  }
}

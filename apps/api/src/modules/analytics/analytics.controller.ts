import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Provider } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators';
import { limitsFor } from '../../common/plans';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportsService } from '../notifications/reports.service';

const DAY = 24 * 3600 * 1000;
const dateKey = (d: Date) => d.toISOString().slice(0, 10);

@Controller()
export class AnalyticsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  /** Analytics → Export → Schedule report: email the last 7 days summary to the current user now. */
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(200)
  @Post('analytics/weekly-report/send')
  sendWeeklyReport(@CurrentUser() user: AuthUser) {
    return this.reports.emailWeeklyReportTo(user.id, user.workspaceId);
  }

  @Get('analytics/overview')
  async overview(
    @CurrentUser() user: AuthUser,
    @Query('days') daysRaw?: string,
    @Query('accountId') accountId?: string,
    @Query('providers') providersRaw?: string,
  ) {
    const providers = (providersRaw ?? '')
      .split(',')
      .map((p) => p.trim().toUpperCase())
      .filter((p): p is Provider => (Object.values(Provider) as string[]).includes(p));
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } });
    const maxDays = limitsFor(ws).analyticsDays;
    const days = Math.min(Math.max(Number(daysRaw) || 30, 1), maxDays);
    const to = new Date();
    const from = new Date(to.getTime() - days * DAY);
    const prevFrom = new Date(from.getTime() - days * DAY);

    const accounts = await this.prisma.socialAccount.findMany({
      where: {
        workspaceId: user.workspaceId,
        ...(accountId ? { id: accountId } : {}),
        ...(providers.length ? { provider: { in: providers } } : {}),
      },
      select: { id: true, provider: true, name: true, username: true, avatarUrl: true, followers: true },
    });
    const accountIds = accounts.map((a) => a.id);

    const [metrics, targets, prevTargets] = await Promise.all([
      this.prisma.accountMetric.findMany({
        where: { socialAccountId: { in: accountIds }, date: { gte: new Date(dateKey(prevFrom)) } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.postTarget.findMany({
        where: { socialAccountId: { in: accountIds }, status: 'PUBLISHED', publishedAt: { gte: from } },
        include: {
          post: { select: { id: true, content: true, media: true } },
          socialAccount: { select: { id: true, provider: true, name: true, avatarUrl: true } },
        },
      }),
      this.prisma.postTarget.findMany({
        where: { socialAccountId: { in: accountIds }, status: 'PUBLISHED', publishedAt: { gte: prevFrom, lt: from } },
        select: { likes: true, comments: true, shares: true, impressions: true },
      }),
    ]);

    // Daily series (followers = sum of each account's latest known value on that day).
    const series: { date: string; followers: number; impressions: number; reach: number; engagement: number; posts: number }[] = [];
    const lastFollowers = new Map<string, number>();
    const metricsByDay = new Map<string, typeof metrics>();
    for (const m of metrics) {
      const k = dateKey(m.date);
      metricsByDay.set(k, [...(metricsByDay.get(k) ?? []), m]);
    }
    for (const m of metrics.filter((m) => m.date < from)) lastFollowers.set(m.socialAccountId, m.followers);
    for (let t = from.getTime(); t <= to.getTime(); t += DAY) {
      const k = dateKey(new Date(t));
      const dayMetrics = metricsByDay.get(k) ?? [];
      for (const m of dayMetrics) lastFollowers.set(m.socialAccountId, m.followers);
      const dayTargets = targets.filter((x) => x.publishedAt && dateKey(x.publishedAt) === k);
      series.push({
        date: k,
        followers: [...lastFollowers.values()].reduce((s, v) => s + v, 0),
        impressions:
          dayMetrics.reduce((s, m) => s + m.impressions, 0) || dayTargets.reduce((s, x) => s + x.impressions, 0),
        reach: dayMetrics.reduce((s, m) => s + m.reach, 0),
        engagement:
          dayMetrics.reduce((s, m) => s + m.engagement, 0) ||
          dayTargets.reduce((s, x) => s + x.likes + x.comments + x.shares, 0),
        posts: dayTargets.length,
      });
    }

    const sum = (list: { likes: number; comments: number; shares: number; impressions: number }[]) =>
      list.reduce(
        (acc, x) => ({
          likes: acc.likes + x.likes,
          comments: acc.comments + x.comments,
          shares: acc.shares + x.shares,
          impressions: acc.impressions + x.impressions,
        }),
        { likes: 0, comments: 0, shares: 0, impressions: 0 },
      );
    const cur = sum(targets);
    const prev = sum(prevTargets);
    const engagement = cur.likes + cur.comments + cur.shares;
    const prevEngagement = prev.likes + prev.comments + prev.shares;
    const followers = accounts.reduce((s, a) => s + (a.followers ?? 0), 0);
    const followersStart = series[0]?.followers ?? followers;
    const change = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 1000) / 10 : null);

    // Daily engagement per platform (for the grouped bar chart).
    const seriesByProvider = series.map((d) => {
      const row: Record<string, number | string> = { date: d.date };
      for (const p of Object.values(Provider)) row[p] = 0;
      for (const t of targets) {
        if (t.publishedAt && dateKey(t.publishedAt) === d.date) {
          row[t.socialAccount.provider] = (row[t.socialAccount.provider] as number) + t.likes + t.comments + t.shares;
        }
      }
      return row;
    });
    const reach = series.reduce((s, d) => s + (d.reach || d.impressions), 0);
    const prevReach = metrics
      .filter((m) => m.date < from)
      .reduce((s, m) => s + (m.reach || m.impressions), 0);

    const byProvider = Object.values(Provider)
      .map((p) => {
        const ts = targets.filter((t) => t.socialAccount.provider === p);
        const s = sum(ts);
        return {
          provider: p,
          accounts: accounts.filter((a) => a.provider === p).length,
          followers: accounts.filter((a) => a.provider === p).reduce((acc, a) => acc + (a.followers ?? 0), 0),
          posts: ts.length,
          ...s,
          engagement: s.likes + s.comments + s.shares,
        };
      })
      .filter((p) => p.accounts > 0);

    const topPosts = targets
      .map((t) => ({
        targetId: t.id,
        postId: t.post.id,
        content: t.post.content.slice(0, 200),
        media: t.post.media,
        permalink: t.permalink,
        publishedAt: t.publishedAt,
        account: t.socialAccount,
        likes: t.likes,
        comments: t.comments,
        shares: t.shares,
        impressions: t.impressions,
        engagement: t.likes + t.comments + t.shares,
      }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 10);

    // Engagement heatmap: weekday (0=Sun) × hour (UTC) → average engagement per post.
    const heat: { day: number; hour: number; posts: number; engagement: number }[] = [];
    const buckets = new Map<string, { posts: number; engagement: number }>();
    for (const t of targets) {
      if (!t.publishedAt) continue;
      const key = `${t.publishedAt.getUTCDay()}-${t.publishedAt.getUTCHours()}`;
      const b = buckets.get(key) ?? { posts: 0, engagement: 0 };
      b.posts++;
      b.engagement += t.likes + t.comments + t.shares;
      buckets.set(key, b);
    }
    for (const [key, b] of buckets) {
      const [day, hour] = key.split('-').map(Number);
      heat.push({ day, hour, posts: b.posts, engagement: Math.round(b.engagement / b.posts) });
    }

    return {
      range: { from, to, days, maxDays },
      totals: {
        followers,
        followersChange: followers - followersStart,
        followersChangePct: followersStart ? Math.round(((followers - followersStart) / followersStart) * 1000) / 10 : null,
        reach,
        reachChange: change(reach, prevReach),
        posts: targets.length,
        postsChange: change(targets.length, prevTargets.length),
        engagement,
        engagementChange: change(engagement, prevEngagement),
        ...cur,
        impressionsChange: change(cur.impressions, prev.impressions),
        engagementRate: cur.impressions ? Math.round((engagement / cur.impressions) * 10000) / 100 : null,
      },
      series,
      seriesByProvider,
      byProvider,
      topPosts,
      heatmap: heat,
      accounts,
    };
  }
}

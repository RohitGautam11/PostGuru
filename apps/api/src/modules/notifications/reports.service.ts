import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { env } from '../../config/env';
import { EmailService } from '../email/email.service';
import { NotificationsService } from './notifications.service';

const DAY = 24 * 3600 * 1000;
const EXPIRY_WARNING_DAYS = 7;
const fmt = (n: number) => new Intl.NumberFormat('en-US', { notation: n >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);

/** Scheduled digests and proactive warnings (weekly report, token expiring soon). */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  /** Weekly analytics summary for every workspace with connected accounts or posts. */
  async sendWeeklyReports() {
    const workspaces = await this.prisma.workspace.findMany({
      where: { OR: [{ accounts: { some: {} } }, { posts: { some: {} } }] },
      select: { id: true },
    });
    let sent = 0;
    for (const ws of workspaces) {
      try {
        await this.sendWeeklyReport(ws.id);
        sent++;
      } catch (err) {
        this.logger.warn(`Weekly report for ${ws.id} failed: ${(err as Error).message}`);
      }
    }
    return { workspaces: workspaces.length, sent };
  }

  async weeklySummary(workspaceId: string, now = new Date()) {
    const from = new Date(now.getTime() - 7 * DAY);
    const published: Prisma.PostWhereInput = { workspaceId, status: { in: ['PUBLISHED', 'PARTIAL'] }, publishedAt: { gte: from, lt: now } };
    const [posts, failed, scheduled, totals, messages, comments, metrics] = await Promise.all([
      this.prisma.post.count({ where: published }),
      this.prisma.post.count({ where: { workspaceId, status: 'FAILED', updatedAt: { gte: from, lt: now } } }),
      this.prisma.post.count({ where: { workspaceId, status: 'SCHEDULED', scheduledAt: { gte: now, lt: new Date(now.getTime() + 7 * DAY) } } }),
      this.prisma.postTarget.aggregate({
        where: { status: 'PUBLISHED', post: published },
        _sum: { likes: true, comments: true, shares: true, impressions: true },
      }),
      this.prisma.message.count({ where: { direction: 'INBOUND', sentAt: { gte: from, lt: now }, conversation: { workspaceId } } }),
      this.prisma.comment.count({ where: { workspaceId, isOwn: false, postedAt: { gte: from, lt: now } } }),
      this.prisma.accountMetric.findMany({
        where: { socialAccount: { workspaceId }, date: { gte: new Date(from.getTime() - DAY), lt: now } },
        orderBy: { date: 'asc' },
        select: { socialAccountId: true, followers: true },
      }),
    ]);
    // Follower growth = last minus first snapshot per account inside the window.
    const byAccount = new Map<string, number[]>();
    for (const m of metrics) byAccount.set(m.socialAccountId, [...(byAccount.get(m.socialAccountId) ?? []), m.followers]);
    const followerGrowth = [...byAccount.values()].reduce((sum, v) => sum + (v.length > 1 ? v[v.length - 1] - v[0] : 0), 0);
    const s = totals._sum;
    const engagement = (s.likes ?? 0) + (s.comments ?? 0) + (s.shares ?? 0);
    return { posts, failed, scheduled, impressions: s.impressions ?? 0, engagement, likes: s.likes ?? 0, inbox: messages + comments, followerGrowth };
  }

  async sendWeeklyReport(workspaceId: string) {
    const { title, body, stats } = await this.buildWeeklyReport(workspaceId);
    await this.notifications.notifyWorkspace(workspaceId, 'weeklyReport', { title, body, link: '/analytics', stats });
  }

  /** On-demand copy of the weekly report for one member (Analytics → Schedule report → Send now). */
  async emailWeeklyReportTo(userId: string, workspaceId: string) {
    const [user, ws, report] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
      this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } }),
      this.buildWeeklyReport(workspaceId),
    ]);
    const sent = await this.email.send({
      to: user.email,
      subject: `Weekly report · ${ws.name}`,
      heading: `Your weekly report for ${ws.name}`,
      paragraphs: ['Here is how your accounts performed over the last 7 days.'],
      stats: report.stats,
      action: { label: 'Open analytics', url: `${env().WEB_URL}/analytics` },
    });
    return { sent, email: user.email, emailEnabled: this.email.enabled };
  }

  private async buildWeeklyReport(workspaceId: string) {
    const r = await this.weeklySummary(workspaceId);
    const growth = `${r.followerGrowth >= 0 ? '+' : ''}${fmt(r.followerGrowth)}`;
    return {
      title: 'Your weekly report is ready',
      body: `${r.posts} posts published · ${fmt(r.impressions)} impressions · ${fmt(r.engagement)} interactions · ${growth} followers`,
      stats: [
        { label: 'Posts published', value: fmt(r.posts) },
        { label: 'Impressions', value: fmt(r.impressions) },
        { label: 'Interactions (likes, comments, shares)', value: fmt(r.engagement) },
        { label: 'Follower growth', value: growth },
        { label: 'New inbox messages & comments', value: fmt(r.inbox) },
        { label: 'Failed posts', value: fmt(r.failed) },
        { label: 'Scheduled for the next 7 days', value: fmt(r.scheduled) },
      ],
    };
  }

  /**
   * Warns once per token when an account that cannot refresh itself will expire within 7 days
   * (Settings → Notifications → Token expiring).
   */
  async warnExpiringTokens(now = new Date()) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: {
        status: 'CONNECTED',
        refreshToken: null,
        tokenExpiresAt: { gt: now, lt: new Date(now.getTime() + EXPIRY_WARNING_DAYS * DAY) },
      },
    });
    let warned = 0;
    for (const a of accounts) {
      const meta = (a.metadata && typeof a.metadata === 'object' ? a.metadata : {}) as Record<string, unknown>;
      const marker = a.tokenExpiresAt!.toISOString();
      if (meta.expiryWarnedFor === marker) continue;
      const days = Math.max(1, Math.ceil((a.tokenExpiresAt!.getTime() - now.getTime()) / DAY));
      await this.notifications.notifyWorkspace(a.workspaceId, 'accountIssues', {
        title: `${a.name} token expires in ${days} day${days > 1 ? 's' : ''}`,
        body: 'Reconnect the account to avoid interruptions to scheduled posts and inbox sync.',
        link: '/connect',
      });
      await this.prisma.socialAccount.update({ where: { id: a.id }, data: { metadata: { ...meta, expiryWarnedFor: marker } } });
      warned++;
    }
    return { candidates: accounts.length, warned };
  }
}

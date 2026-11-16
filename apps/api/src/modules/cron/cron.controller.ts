import { Controller, Get, Headers, Injectable, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { env } from '../../config/env';
import { safeEqual } from '../../common/crypto';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportsService } from '../notifications/reports.service';
import { PublisherService } from '../posts/publisher.service';
import { SyncService } from '../social/sync.service';

const SYNC_INTERVAL_MS = 10 * 60 * 1000;

@Injectable()
export class CronJobs {
  private readonly logger = new Logger(CronJobs.name);
  private running = { publish: false, sync: false };

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: PublisherService,
    private readonly sync: SyncService,
    readonly reports: ReportsService,
  ) {}

  publishDue() {
    return this.publisher.processDue({ limit: 25, budgetMs: 45_000 });
  }

  /** Syncs the accounts that were synced least recently, within a time budget. */
  async syncStale(budgetMs = 45_000) {
    const started = Date.now();
    const accounts = await this.prisma.socialAccount.findMany({
      where: {
        status: 'CONNECTED',
        OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(Date.now() - SYNC_INTERVAL_MS) } }],
      },
      orderBy: { lastSyncedAt: { sort: 'asc', nulls: 'first' } },
      take: 25,
    });
    let synced = 0;
    for (const a of accounts) {
      if (Date.now() - started > budgetMs) break;
      await this.sync.syncAccount(a).catch((err) => this.logger.warn(`Sync ${a.id} failed: ${(err as Error).message}`));
      synced++;
    }
    return { candidates: accounts.length, synced };
  }

  async cleanup() {
    const now = new Date();
    const [states, tokens, notes] = await Promise.all([
      this.prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.refreshToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: new Date(now.getTime() - 7 * 86400_000) } }] },
      }),
      this.prisma.notification.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 90 * 86400_000) } } }),
    ]);
    return { oauthStates: states.count, refreshTokens: tokens.count, notifications: notes.count };
  }

  // In-process scheduler for long-running deployments (Docker, Render, Railway…).
  @Cron(CronExpression.EVERY_MINUTE)
  async tickPublish() {
    if (!env().ENABLE_INTERNAL_SCHEDULER || this.running.publish) return;
    this.running.publish = true;
    try {
      await this.publishDue();
    } finally {
      this.running.publish = false;
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async tickSync() {
    if (!env().ENABLE_INTERNAL_SCHEDULER || this.running.sync) return;
    this.running.sync = true;
    try {
      await this.syncStale();
    } finally {
      this.running.sync = false;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async tickCleanup() {
    if (env().ENABLE_INTERNAL_SCHEDULER) await this.cleanup();
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async tickTokenExpiry() {
    if (env().ENABLE_INTERNAL_SCHEDULER) await this.reports.warnExpiringTokens();
  }

  /** Mondays at 09:00 server time. */
  @Cron('0 9 * * 1')
  async tickWeeklyReport() {
    if (env().ENABLE_INTERNAL_SCHEDULER) await this.reports.sendWeeklyReports();
  }
}

/** HTTP triggers for Vercel Cron / external schedulers. Protected by CRON_SECRET (Bearer token). */
@Public()
@Controller('cron')
export class CronController {
  constructor(private readonly jobs: CronJobs) {}

  private authorize(header?: string) {
    const secret = env().CRON_SECRET;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    if (!secret || !token || !safeEqual(token, secret)) throw new UnauthorizedException('Invalid cron secret');
  }

  // Vercel Cron issues GET requests; POST is accepted for other schedulers.
  @Get('publish')
  publishGet(@Headers('authorization') auth?: string) {
    this.authorize(auth);
    return this.jobs.publishDue();
  }

  @Post('publish')
  publishPost(@Headers('authorization') auth?: string) {
    return this.publishGet(auth);
  }

  @Get('sync')
  syncGet(@Headers('authorization') auth?: string) {
    this.authorize(auth);
    return this.jobs.syncStale();
  }

  @Post('sync')
  syncPost(@Headers('authorization') auth?: string) {
    return this.syncGet(auth);
  }

  @Get('cleanup')
  cleanupGet(@Headers('authorization') auth?: string) {
    this.authorize(auth);
    return this.jobs.cleanup();
  }

  /** Daily: warns about social tokens that expire within 7 days. */
  @Get('token-expiry')
  tokenExpiryGet(@Headers('authorization') auth?: string) {
    this.authorize(auth);
    return this.jobs.reports.warnExpiringTokens();
  }

  /** Weekly (Mondays): emails each member who opted in an analytics summary of the last 7 days. */
  @Get('weekly-report')
  weeklyReportGet(@Headers('authorization') auth?: string) {
    this.authorize(auth);
    return this.jobs.reports.sendWeeklyReports();
  }
}

import { Body, Controller, Delete, Get, HttpCode, Module, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { adminEmails, assertPlatformAdmin, isPlatformAdmin } from '../../common/admin';
import { AuthUser, CurrentUser, Public } from '../../common/decorators';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';

export const FEEDBACK_KINDS = ['BUG', 'IDEA', 'INTEGRATION', 'QUESTION', 'PRAISE'] as const;
export const FEEDBACK_STATUSES = ['NEW', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'DONE', 'DECLINED'] as const;

class FeedbackDto {
  @IsIn(FEEDBACK_KINDS) kind: (typeof FEEDBACK_KINDS)[number];
  @IsString() @MaxLength(140) title: string;
  @IsString() @MaxLength(5000) message: string;
  @IsOptional() @IsString() @MaxLength(300) page?: string;
}

class AdminFeedbackDto {
  @IsOptional() @IsIn(FEEDBACK_STATUSES) status?: (typeof FEEDBACK_STATUSES)[number];
  @IsOptional() @IsBoolean() public?: boolean;
  @IsOptional() @IsString() @MaxLength(140) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) adminNote?: string;
}

const HANDLE = 200;
class BetaTesterDto {
  @IsOptional() @IsString() @MaxLength(HANDLE) facebook?: string;
  @IsOptional() @IsString() @MaxLength(HANDLE) instagram?: string;
  @IsOptional() @IsString() @MaxLength(HANDLE) gmail?: string;
  @IsOptional() @IsString() @MaxLength(HANDLE) linkedin?: string;
  @IsOptional() @IsString() @MaxLength(HANDLE) x?: string;
  @IsOptional() @IsString() @MaxLength(HANDLE) threads?: string;
  @IsOptional() @IsString() @MaxLength(HANDLE) tiktok?: string;
  @IsOptional() @IsString() @MaxLength(HANDLE) pinterest?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

class AdminStatusDto {
  @IsString() @MaxLength(40) status: string;
}

const publicItem = (f: any, votedIds: Set<string>) => ({
  id: f.id,
  kind: f.kind,
  title: f.title,
  message: f.message,
  status: f.status,
  votes: f.votes,
  voted: votedIds.has(f.id),
  adminNote: f.adminNote,
  createdAt: f.createdAt,
});

/** In-app feedback widget, the public roadmap with upvotes, beta-tester sign-up and the admin console API. */
@Controller()
export class FeedbackController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  // ── Feedback widget ───────────────────────────────────────────────────────
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('feedback')
  async create(@CurrentUser() user: AuthUser, @Body() dto: FeedbackDto) {
    // Feature ideas go on the public roadmap straight away so other testers can upvote them.
    const isIdea = dto.kind === 'IDEA' || dto.kind === 'INTEGRATION';
    const item = await this.prisma.feedback.create({
      data: {
        workspaceId: user.workspaceId,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        kind: dto.kind,
        title: dto.title.trim(),
        message: dto.message.trim(),
        page: dto.page ?? null,
        public: isIdea,
        status: isIdea ? 'UNDER_REVIEW' : 'NEW',
        voters: { create: { userId: user.id } },
      },
    });
    await Promise.all(
      adminEmails().map((to) =>
        this.email.send({
          to,
          subject: `[${dto.kind}] ${dto.title}`.slice(0, 150),
          heading: `New ${dto.kind.toLowerCase()} from ${user.name}`,
          paragraphs: [dto.message, `From: ${user.name} <${user.email}>`, dto.page ? `Page: ${dto.page}` : ''].filter(Boolean),
          action: { label: 'Open admin console', url: `${env().WEB_URL}/admin` },
        }),
      ),
    );
    return { id: item.id, public: item.public };
  }

  @Get('feedback/mine')
  async mine(@CurrentUser() user: AuthUser) {
    return this.prisma.feedback.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, kind: true, title: true, status: true, public: true, votes: true, adminNote: true, createdAt: true },
    });
  }

  // ── Public roadmap ────────────────────────────────────────────────────────
  @Public()
  @Get('roadmap')
  async roadmap() {
    const items = await this.prisma.feedback.findMany({
      where: { public: true, status: { not: 'DECLINED' } },
      orderBy: [{ votes: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
    return items.map((f) => publicItem(f, new Set()));
  }

  /** Same list, with "voted" flags for the signed-in user. */
  @Get('roadmap/me')
  async roadmapForMe(@CurrentUser() user: AuthUser) {
    const [items, votes] = await Promise.all([
      this.prisma.feedback.findMany({
        where: { public: true, status: { not: 'DECLINED' } },
        orderBy: [{ votes: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      }),
      this.prisma.feedbackVote.findMany({ where: { userId: user.id }, select: { feedbackId: true } }),
    ]);
    const voted = new Set(votes.map((v) => v.feedbackId));
    return items.map((f) => publicItem(f, voted));
  }

  @HttpCode(200)
  @Post('roadmap/:id/vote')
  async vote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const item = await this.prisma.feedback.findFirst({ where: { id, public: true } });
    if (!item) throw new NotFoundException('Roadmap item not found');
    const existing = await this.prisma.feedbackVote.findUnique({ where: { feedbackId_userId: { feedbackId: id, userId: user.id } } });
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.feedbackVote.delete({ where: { feedbackId_userId: { feedbackId: id, userId: user.id } } }),
        this.prisma.feedback.update({ where: { id }, data: { votes: { decrement: 1 } } }),
      ]);
      return { voted: false, votes: item.votes - 1 };
    }
    await this.prisma.$transaction([
      this.prisma.feedbackVote.create({ data: { feedbackId: id, userId: user.id } }),
      this.prisma.feedback.update({ where: { id }, data: { votes: { increment: 1 } } }),
    ]);
    return { voted: true, votes: item.votes + 1 };
  }

  // ── Beta testers (Development-mode app testers) ───────────────────────────
  @Get('beta-tester')
  async getBeta(@CurrentUser() user: AuthUser) {
    return (await this.prisma.betaTester.findUnique({ where: { userId: user.id } })) ?? null;
  }

  @Put('beta-tester')
  async saveBeta(@CurrentUser() user: AuthUser, @Body() dto: BetaTesterDto) {
    const clean = Object.fromEntries(Object.entries(dto).map(([k, v]) => [k, typeof v === 'string' && v.trim() ? v.trim() : null]));
    const existing = await this.prisma.betaTester.findUnique({ where: { userId: user.id } });
    const saved = await this.prisma.betaTester.upsert({
      where: { userId: user.id },
      create: { userId: user.id, email: user.email, name: user.name, ...clean },
      update: { ...clean, status: 'REQUESTED' },
    });
    if (!existing) {
      await Promise.all(
        adminEmails().map((to) =>
          this.email.send({
            to,
            subject: `New beta tester: ${user.name}`,
            heading: 'Add this tester to your developer apps',
            paragraphs: [
              `${user.name} <${user.email}> wants to connect accounts during the beta.`,
              'Add their identities as testers: Meta App Roles → Testers, Google OAuth consent screen → Test users, TikTok/Pinterest sandbox users.',
            ],
            stats: Object.entries(clean)
              .filter(([k, v]) => v && k !== 'notes')
              .map(([label, value]) => ({ label, value: String(value) })),
            action: { label: 'Open admin console', url: `${env().WEB_URL}/admin` },
          }),
        ),
      );
    }
    return saved;
  }

  // ── Admin console ─────────────────────────────────────────────────────────
  @Get('admin/me')
  adminMe(@CurrentUser() user: AuthUser) {
    return { admin: isPlatformAdmin(user.email) };
  }

  @Get('admin/overview')
  async overview(@CurrentUser() user: AuthUser) {
    assertPlatformAdmin(user);
    const weekAgo = new Date(Date.now() - 7 * 86400_000);
    const [users, newUsers, workspaces, accounts, posts, published, feedback, testers, deletions] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.workspace.count(),
      this.prisma.socialAccount.count(),
      this.prisma.post.count(),
      this.prisma.post.count({ where: { status: { in: ['PUBLISHED', 'PARTIAL'] } } }),
      this.prisma.feedback.count({ where: { status: 'NEW' } }),
      this.prisma.betaTester.count({ where: { status: 'REQUESTED' } }),
      this.prisma.dataDeletionRequest.count({ where: { status: 'PENDING' } }),
    ]);
    const byProvider = await this.prisma.socialAccount.groupBy({ by: ['provider'], _count: true });
    return {
      users,
      newUsers,
      workspaces,
      accounts,
      posts,
      published,
      openFeedback: feedback,
      pendingTesters: testers,
      pendingDeletions: deletions,
      accountsByProvider: byProvider.map((b) => ({ provider: b.provider, count: b._count })),
    };
  }

  @Get('admin/feedback')
  async adminFeedback(@CurrentUser() user: AuthUser, @Query('kind') kind?: string, @Query('status') status?: string) {
    assertPlatformAdmin(user);
    return this.prisma.feedback.findMany({
      where: { ...(kind ? { kind } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  @Patch('admin/feedback/:id')
  async updateFeedback(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AdminFeedbackDto) {
    assertPlatformAdmin(user);
    return this.prisma.feedback.update({ where: { id }, data: dto });
  }

  @Delete('admin/feedback/:id')
  async deleteFeedback(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    assertPlatformAdmin(user);
    await this.prisma.feedback.delete({ where: { id } });
    return { ok: true };
  }

  @Get('admin/beta-testers')
  async adminTesters(@CurrentUser() user: AuthUser) {
    assertPlatformAdmin(user);
    return this.prisma.betaTester.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  }

  @Patch('admin/beta-testers/:id')
  async updateTester(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AdminStatusDto) {
    assertPlatformAdmin(user);
    return this.prisma.betaTester.update({ where: { id }, data: { status: dto.status } });
  }

  @Get('admin/deletion-requests')
  async adminDeletions(@CurrentUser() user: AuthUser) {
    assertPlatformAdmin(user);
    return this.prisma.dataDeletionRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  }

  @Patch('admin/deletion-requests/:id')
  async updateDeletion(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AdminStatusDto) {
    assertPlatformAdmin(user);
    return this.prisma.dataDeletionRequest.update({
      where: { id },
      data: { status: dto.status, completedAt: dto.status === 'COMPLETED' ? new Date() : null },
    });
  }
}

@Module({ controllers: [FeedbackController] })
export class FeedbackModule {}

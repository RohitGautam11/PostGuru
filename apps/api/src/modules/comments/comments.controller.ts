import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { CommentStatus, Prisma, Sentiment } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, MinRole } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from '../social/accounts.service';
import { classifySentiment } from '../social/sentiment';
import { SyncService } from '../social/sync.service';

class ReplyDto {
  @IsString() @MinLength(1) @MaxLength(2000) text: string;
}

class UpdateCommentDto {
  @IsEnum(CommentStatus) status: CommentStatus;
}

class HideDto {
  @IsBoolean() hidden: boolean;
}

class ListCommentsQuery {
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsEnum(Sentiment) sentiment?: Sentiment;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

const ACCOUNT_SELECT = { id: true, provider: true, name: true, username: true, avatarUrl: true } as const;

@Controller('comments')
export class CommentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly sync: SyncService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() q: ListCommentsQuery) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 30;
    const statuses = q.status
      ?.split(',')
      .map((s) => s.toUpperCase())
      .filter((s): s is CommentStatus => Object.values(CommentStatus).includes(s as CommentStatus));
    const where: Prisma.CommentWhereInput = {
      workspaceId: user.workspaceId,
      isOwn: false,
      ...(q.accountId ? { socialAccountId: q.accountId } : {}),
      ...(q.provider ? { socialAccount: { provider: q.provider.toUpperCase() as any } } : {}),
      ...(statuses?.length ? { status: { in: statuses } } : {}),
      ...(q.sentiment ? { sentiment: q.sentiment } : {}),
      ...(q.search
        ? {
            OR: [
              { text: { contains: q.search, mode: 'insensitive' } },
              { authorName: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total, counts] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        orderBy: { postedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { socialAccount: { select: ACCOUNT_SELECT } },
      }),
      this.prisma.comment.count({ where }),
      this.prisma.comment.groupBy({
        by: ['status'],
        where: { workspaceId: user.workspaceId, isOwn: false },
        _count: { _all: true },
      }),
    ]);

    // Attach our own replies so the UI can show the thread.
    const replies = items.length
      ? await this.prisma.comment.findMany({
          where: { workspaceId: user.workspaceId, isOwn: true, parentExternalId: { in: items.map((i) => i.externalId) } },
          orderBy: { postedAt: 'asc' },
        })
      : [];
    const byParent = new Map<string, typeof replies>();
    for (const r of replies) byParent.set(r.parentExternalId!, [...(byParent.get(r.parentExternalId!) ?? []), r]);

    return {
      items: items.map((i) => ({ ...i, replies: byParent.get(i.externalId) ?? [] })),
      total,
      page,
      pageSize,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    };
  }

  @MinRole('EDITOR')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/reply')
  async reply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReplyDto) {
    const comment = await this.find(user, id);
    const result = await this.accounts.withProvider(comment.socialAccount, async (ctx, provider) => {
      if (!provider.replyToComment) throw new BadRequestException(`${provider.displayName} does not support replies`);
      return provider.replyToComment(ctx, { externalId: comment.externalId, externalPostId: comment.externalPostId }, dto.text);
    });

    const [reply] = await this.prisma.$transaction([
      this.prisma.comment.upsert({
        where: { socialAccountId_externalId: { socialAccountId: comment.socialAccountId, externalId: result.externalId } },
        create: {
          workspaceId: user.workspaceId,
          socialAccountId: comment.socialAccountId,
          externalId: result.externalId,
          externalPostId: comment.externalPostId,
          parentExternalId: comment.externalId,
          postPermalink: comment.postPermalink,
          authorName: comment.socialAccount.name,
          authorHandle: comment.socialAccount.username,
          authorAvatar: comment.socialAccount.avatarUrl,
          text: dto.text,
          isOwn: true,
          status: 'REPLIED',
          sentiment: classifySentiment(dto.text),
          postedAt: new Date(),
        },
        update: {},
      }),
      this.prisma.comment.update({ where: { id: comment.id }, data: { status: 'REPLIED' } }),
    ]);
    return reply;
  }

  @MinRole('EDITOR')
  @Patch(':id')
  async updateStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCommentDto) {
    await this.find(user, id);
    return this.prisma.comment.update({ where: { id }, data: { status: dto.status } });
  }

  @MinRole('EDITOR')
  @HttpCode(200)
  @Post(':id/hide')
  async hide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: HideDto) {
    const comment = await this.find(user, id);
    await this.accounts.withProvider(comment.socialAccount, async (ctx, provider) => {
      if (!provider.hideComment) throw new BadRequestException(`${provider.displayName} does not support hiding comments`);
      await provider.hideComment(ctx, comment.externalId, dto.hidden);
    });
    return this.prisma.comment.update({
      where: { id },
      data: { hidden: dto.hidden, status: dto.hidden ? 'HIDDEN' : 'REVIEWED' },
    });
  }

  @MinRole('EDITOR')
  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const comment = await this.find(user, id);
    await this.accounts.withProvider(comment.socialAccount, async (ctx, provider) => {
      if (!provider.deleteComment) throw new BadRequestException(`${provider.displayName} does not support deleting comments`);
      await provider.deleteComment(ctx, comment.externalId);
    });
    await this.prisma.comment.delete({ where: { id } });
    return { ok: true };
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @HttpCode(200)
  @Post('sync')
  async syncComments(@CurrentUser() user: AuthUser) {
    const results = await this.sync.syncWorkspace(user.workspaceId, { comments: true });
    return {
      newComments: results.reduce((s, r) => s + r.newComments, 0),
      errors: results.flatMap((r) => r.errors),
    };
  }

  private async find(user: AuthUser, id: string) {
    const comment = await this.prisma.comment.findFirst({
      where: { id, workspaceId: user.workspaceId },
      include: { socialAccount: true },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }
}

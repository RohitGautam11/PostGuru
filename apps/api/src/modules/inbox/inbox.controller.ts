import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ConversationStatus, Prisma } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser, MinRole } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from '../social/accounts.service';
import { SyncService } from '../social/sync.service';

class SendMessageDto {
  @IsString() @MinLength(1) @MaxLength(2000) text: string;
}

class UpdateConversationDto {
  @IsOptional() @IsEnum(ConversationStatus) status?: ConversationStatus;
  @IsOptional() @IsBoolean() read?: boolean;
}

const ACCOUNT_SELECT = { id: true, provider: true, name: true, username: true, avatarUrl: true } as const;

@Controller('inbox')
export class InboxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly sync: SyncService,
  ) {}

  @Get('conversations')
  async conversations(
    @CurrentUser() user: AuthUser,
    @Query('accountId') accountId?: string,
    @Query('status') status?: string,
    @Query('unread') unread?: string,
    @Query('search') search?: string,
    @Query('provider') provider?: string,
  ) {
    const where: Prisma.ConversationWhereInput = {
      workspaceId: user.workspaceId,
      status: status === 'ARCHIVED' ? 'ARCHIVED' : status === 'ALL' ? undefined : 'OPEN',
      ...(accountId ? { socialAccountId: accountId } : {}),
      ...(provider ? { socialAccount: { provider: provider.toUpperCase() as any } } : {}),
      ...(unread === 'true' ? { unreadCount: { gt: 0 } } : {}),
      ...(search
        ? {
            OR: [
              { participantName: { contains: search, mode: 'insensitive' } },
              { participantHandle: { contains: search, mode: 'insensitive' } },
              { lastMessagePreview: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, unreadTotal] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        take: 100,
        include: { socialAccount: { select: ACCOUNT_SELECT } },
      }),
      this.prisma.conversation.aggregate({
        where: { workspaceId: user.workspaceId, status: 'OPEN' },
        _sum: { unreadCount: true },
      }),
    ]);
    return { items, unread: unreadTotal._sum.unreadCount ?? 0 };
  }

  @Get('conversations/:id')
  async conversation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id, workspaceId: user.workspaceId },
      include: {
        socialAccount: { select: ACCOUNT_SELECT },
        messages: { orderBy: { sentAt: 'asc' }, take: 500 },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.unreadCount > 0) {
      await this.prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });
    }
    return { ...conv, unreadCount: 0 };
  }

  @MinRole('EDITOR')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('conversations/:id/messages')
  async send(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SendMessageDto) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id, workspaceId: user.workspaceId },
      include: { socialAccount: true },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const result = await this.accounts.withProvider(conv.socialAccount, async (ctx, provider) => {
      if (!provider.sendMessage) throw new BadRequestException(`${provider.displayName} does not support direct messages`);
      return provider.sendMessage(ctx, { externalId: conv.externalId, participantExternalId: conv.participantExternalId }, dto.text);
    });

    const now = new Date();
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId: conv.id,
          externalId: result.externalId,
          direction: 'OUTBOUND',
          text: dto.text,
          senderName: user.name,
          sentAt: now,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conv.id },
        data: { lastMessageAt: now, lastMessagePreview: dto.text.slice(0, 200), unreadCount: 0 },
      }),
    ]);
    return message;
  }

  @Patch('conversations/:id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateConversationDto) {
    const { count } = await this.prisma.conversation.updateMany({
      where: { id, workspaceId: user.workspaceId },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.read === true ? { unreadCount: 0 } : dto.read === false ? { unreadCount: 1 } : {}),
      },
    });
    if (!count) throw new NotFoundException('Conversation not found');
    return { ok: true };
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @HttpCode(200)
  @Post('sync')
  async syncInbox(@CurrentUser() user: AuthUser) {
    const results = await this.sync.syncWorkspace(user.workspaceId, { inbox: true });
    return {
      newMessages: results.reduce((s, r) => s + r.newMessages, 0),
      errors: results.flatMap((r) => r.errors),
    };
  }
}

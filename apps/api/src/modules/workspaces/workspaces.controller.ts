import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { env } from '../../config/env';
import { decrypt, encrypt, randomToken, sha256 } from '../../common/crypto';
import { API_KEY_PREFIX } from '../../common/guards';
import { INVITE_LINK_PREFIX } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser, CurrentUser, MinRole, ROLE_RANK } from '../../common/decorators';
import { atLimit, limitsFor, trialEndsAt } from '../../common/plans';
import { PrismaService } from '../../prisma/prisma.service';

class UpdateWorkspaceDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
}

class InviteDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;
  @IsEnum(Role) role: Role;
}

class UpdateRoleDto {
  @IsEnum(Role) role: Role;
}

class InviteLinkDto {
  @IsEnum(Role) role: Role;
}

class CreateApiKeyDto {
  @IsString() @MinLength(2) @MaxLength(60) name: string;
}

@Controller('workspace')
export class WorkspacesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  async current(@CurrentUser() user: AuthUser) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: user.workspaceId },
      select: { id: true, name: true, plan: true, subscriptionStatus: true, currentPeriodEnd: true, createdAt: true },
    });
    const limits = limitsFor(ws);
    return { ...ws, limits, effectivePlan: limits.key, trial: limits.trial, beta: limits.beta, trialEndsAt: trialEndsAt(ws) };
  }

  /** Creates a new workspace owned by the current user (switch to it with POST /auth/switch-workspace). */
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: UpdateWorkspaceDto) {
    const owned = await this.prisma.membership.count({ where: { userId: user.id, role: 'OWNER' } });
    if (owned >= 10) throw new ForbiddenException('You can own at most 10 workspaces');
    const ws = await this.prisma.workspace.create({
      data: { name: dto.name.trim(), memberships: { create: { userId: user.id, role: 'OWNER' } } },
      select: { id: true, name: true, plan: true },
    });
    return ws;
  }

  @MinRole('ADMIN')
  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateWorkspaceDto) {
    return this.prisma.workspace.update({ where: { id: user.workspaceId }, data: { name: dto.name.trim() } });
  }

  @Get('members')
  async members(@CurrentUser() user: AuthUser) {
    const [members, invitations] = await Promise.all([
      this.prisma.membership.findMany({
        where: { workspaceId: user.workspaceId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      }),
      this.prisma.invitation.findMany({
        where: { workspaceId: user.workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { members, invitations };
  }

  @MinRole('ADMIN')
  @Post('invitations')
  async invite(@CurrentUser() user: AuthUser, @Body() dto: InviteDto) {
    if (dto.role === 'OWNER' && user.role !== 'OWNER') throw new ForbiddenException('Only owners can invite owners');

    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } });
    const [memberCount, pending] = await Promise.all([
      this.prisma.membership.count({ where: { workspaceId: ws.id } }),
      this.prisma.invitation.count({ where: { workspaceId: ws.id, acceptedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    const limits = limitsFor(ws);
    if (atLimit(memberCount + pending, limits.members)) {
      throw new ForbiddenException(`Your ${limits.name} plan allows ${limits.members} member(s). Upgrade to invite more.`);
    }
    const already = await this.prisma.membership.findFirst({ where: { workspaceId: ws.id, user: { email: dto.email } } });
    if (already) throw new BadRequestException('This person is already a member');

    const token = randomToken(32);
    await this.prisma.invitation.deleteMany({ where: { workspaceId: ws.id, email: dto.email, acceptedAt: null } });
    const invitation = await this.prisma.invitation.create({
      data: {
        workspaceId: ws.id,
        email: dto.email,
        role: dto.role,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });
    // No transactional email provider is assumed; the admin shares this link (shown once).
    return { ...invitation, inviteUrl: `${env().WEB_URL}/invite/${token}` };
  }

  // ─── Invite by link ──────────────────────────────────────────────────────
  @MinRole('ADMIN')
  @Get('invite-link')
  async inviteLink(@CurrentUser() user: AuthUser) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: user.workspaceId },
      select: { inviteLinkToken: true, inviteLinkRole: true },
    });
    return this.linkView(ws.inviteLinkToken, ws.inviteLinkRole);
  }

  /** Creates (or rotates) the reusable invite link. Rotating immediately disables the old link. */
  @MinRole('ADMIN')
  @Post('invite-link')
  async createInviteLink(@CurrentUser() user: AuthUser, @Body() dto: InviteLinkDto) {
    if (dto.role === 'OWNER') throw new BadRequestException('Invite links cannot grant the owner role');
    if (dto.role === 'ADMIN' && user.role !== 'OWNER') throw new ForbiddenException('Only owners can create admin invite links');
    const token = INVITE_LINK_PREFIX + randomToken(18);
    await this.prisma.workspace.update({
      where: { id: user.workspaceId },
      data: { inviteLinkToken: encrypt(token), inviteLinkHash: sha256(token), inviteLinkRole: dto.role },
    });
    return this.linkView(encrypt(token), dto.role);
  }

  @MinRole('ADMIN')
  @Delete('invite-link')
  async disableInviteLink(@CurrentUser() user: AuthUser) {
    await this.prisma.workspace.update({ where: { id: user.workspaceId }, data: { inviteLinkToken: null, inviteLinkHash: null } });
    return this.linkView(null, 'EDITOR');
  }

  private linkView(encrypted: string | null, role: Role) {
    return { url: encrypted ? `${env().WEB_URL}/invite/${decrypt(encrypted)}` : null, role };
  }

  // ─── API keys ────────────────────────────────────────────────────────────
  @MinRole('ADMIN')
  @Get('api-keys')
  apiKeys(@CurrentUser() user: AuthUser) {
    return this.prisma.apiKey.findMany({
      where: { workspaceId: user.workspaceId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true, createdById: true },
    });
  }

  /** The full key is returned only once; only its hash is stored. */
  @MinRole('ADMIN')
  @Post('api-keys')
  async createApiKey(@CurrentUser() user: AuthUser, @Body() dto: CreateApiKeyDto) {
    const active = await this.prisma.apiKey.count({ where: { workspaceId: user.workspaceId, revokedAt: null } });
    if (active >= 10) throw new BadRequestException('A workspace can have at most 10 active API keys');
    const key = API_KEY_PREFIX + randomToken(32);
    const record = await this.prisma.apiKey.create({
      data: { workspaceId: user.workspaceId, createdById: user.id, name: dto.name.trim(), prefix: key.slice(0, 16), keyHash: sha256(key) },
      select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true, createdById: true },
    });
    return { ...record, key };
  }

  @MinRole('ADMIN')
  @Delete('api-keys/:id')
  async revokeApiKey(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const { count } = await this.prisma.apiKey.updateMany({
      where: { id, workspaceId: user.workspaceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!count) throw new NotFoundException('API key not found');
    return { ok: true };
  }

  @MinRole('ADMIN')
  @Delete('invitations/:id')
  async revokeInvite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const { count } = await this.prisma.invitation.deleteMany({ where: { id, workspaceId: user.workspaceId } });
    if (!count) throw new NotFoundException('Invitation not found');
    return { ok: true };
  }

  @MinRole('ADMIN')
  @Patch('members/:id')
  async updateRole(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    const target = await this.findMember(user, id);
    this.assertCanManage(user, target.role, dto.role);
    if (target.role === 'OWNER' && dto.role !== 'OWNER') await this.assertNotLastOwner(user.workspaceId);
    const updated = await this.prisma.membership.update({
      where: { id },
      data: { role: dto.role },
      include: { user: { select: { name: true } } },
    });
    if (target.role !== dto.role) {
      void this.notifications.notifyWorkspace(user.workspaceId, 'teamActivity', {
        title: `${updated.user.name} is now ${dto.role === 'ADMIN' ? 'an' : 'a'} ${dto.role.toLowerCase()}`,
        body: `Changed by ${user.name}`,
        link: '/settings?tab=team',
      });
    }
    return updated;
  }

  @Delete('members/:id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const target = await this.findMember(user, id);
    const leavingSelf = target.userId === user.id;
    if (!leavingSelf) {
      if (ROLE_RANK[user.role] < ROLE_RANK.ADMIN) throw new ForbiddenException('Only admins can remove members');
      this.assertCanManage(user, target.role, target.role);
    }
    if (target.role === 'OWNER') await this.assertNotLastOwner(user.workspaceId);
    const removed = await this.prisma.membership.delete({ where: { id }, include: { user: { select: { name: true } } } });
    void this.notifications.notifyWorkspace(user.workspaceId, 'teamActivity', {
      title: leavingSelf ? `${removed.user.name} left the workspace` : `${removed.user.name} was removed from the workspace`,
      body: leavingSelf ? undefined : `Removed by ${user.name}`,
      link: '/settings?tab=team',
    });
    return { ok: true };
  }

  private async findMember(user: AuthUser, id: string) {
    const m = await this.prisma.membership.findFirst({ where: { id, workspaceId: user.workspaceId } });
    if (!m) throw new NotFoundException('Member not found');
    return m;
  }

  private assertCanManage(user: AuthUser, current: Role, next: Role) {
    if (user.role === 'OWNER') return;
    if (ROLE_RANK[current] >= ROLE_RANK[user.role] || ROLE_RANK[next] >= ROLE_RANK[user.role]) {
      throw new ForbiddenException('You cannot manage members with an equal or higher role');
    }
  }

  private async assertNotLastOwner(workspaceId: string) {
    const owners = await this.prisma.membership.count({ where: { workspaceId, role: 'OWNER' } });
    if (owners <= 1) throw new BadRequestException('A workspace must keep at least one owner');
  }
}

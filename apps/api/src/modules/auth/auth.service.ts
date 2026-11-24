import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { env, isProd } from '../../config/env';
import { decrypt, randomToken, sha256 } from '../../common/crypto';
import { normalizeRecoveryCode, verifyTotp } from '../../common/totp';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../common/guards';
import { atLimit, limitsFor } from '../../common/plans';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';

const ACCESS_TTL_SECONDS = 15 * 60;
const MFA_TTL_SECONDS = 5 * 60;
const RESET_TTL_MS = 60 * 60 * 1000;
export const MFA_COOKIE = 'sh_mfa';
export const INVITE_LINK_PREFIX = 'wl_';

interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
/** A login that passed the password (or Google) step and still needs a second factor. */
export interface PendingMfa {
  mfaRequired: true;
  mfaToken: string;
}
export type LoginResult = Session | PendingMfa;
export const isPendingMfa = (r: LoginResult): r is PendingMfa => 'mfaRequired' in r;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
let dummyHash: string | undefined;

interface ClientInfo {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  async register(dto: RegisterDto, client: ClientInfo) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const invite = dto.inviteToken ? await this.findValidInvite(dto.inviteToken) : null;

    const { user, workspaceId } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: dto.email, name: dto.name.trim(), passwordHash } });
      if (invite) {
        await tx.membership.create({ data: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role } });
        if (invite.invitationId) await tx.invitation.update({ where: { id: invite.invitationId }, data: { acceptedAt: new Date() } });
        return { user, workspaceId: invite.workspaceId };
      }
      const workspace = await tx.workspace.create({
        data: { name: dto.workspaceName?.trim() || `${dto.name.trim().split(' ')[0]}'s Workspace` },
      });
      await tx.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: 'OWNER' } });
      return { user, workspaceId: workspace.id };
    });

    if (invite) this.announceJoin(invite.workspaceId, user.id, user.name);
    return this.issueSession(user.id, workspaceId, client);
  }

  // ─── Google sign-in (OpenID Connect) ─────────────────────────────────────
  googleEnabled() {
    return Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET);
  }

  googleRedirectUri() {
    return `${env().WEB_URL}/api/auth/google/callback`;
  }

  googleAuthUrl(state: string, codeChallenge: string) {
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.searchParams.set('client_id', env().GOOGLE_CLIENT_ID ?? '');
    u.searchParams.set('redirect_uri', this.googleRedirectUri());
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', 'openid email profile');
    u.searchParams.set('state', state);
    u.searchParams.set('code_challenge', codeChallenge);
    u.searchParams.set('code_challenge_method', 'S256');
    u.searchParams.set('prompt', 'select_account');
    return u.toString();
  }

  async loginWithGoogle(code: string, codeVerifier: string, client: ClientInfo) {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env().GOOGLE_CLIENT_ID ?? '',
        client_secret: env().GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri: this.googleRedirectUri(),
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });
    if (!tokenRes.ok) throw new UnauthorizedException('Google sign-in failed. Please try again.');
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!infoRes.ok) throw new UnauthorizedException('Could not read your Google profile');
    const info = (await infoRes.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
    if (!info.email || !info.email_verified) throw new UnauthorizedException('Your Google email address is not verified');
    const email = info.email.toLowerCase();

    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId: info.sub }, { email }] },
      include: { memberships: { orderBy: { createdAt: 'asc' } } },
    });
    if (user && !user.googleId) {
      // Google has verified ownership of this email, so it is safe to link the identities.
      await this.prisma.user.update({ where: { id: user.id }, data: { googleId: info.sub, avatarUrl: user.avatarUrl ?? info.picture } });
    }
    if (!user) {
      const name = info.name?.trim() || email.split('@')[0];
      const created = await this.prisma.user.create({
        data: {
          email,
          name,
          googleId: info.sub,
          avatarUrl: info.picture,
          // Unusable password: the account signs in with Google until a password is set.
          passwordHash: await bcrypt.hash(randomToken(32), 12),
          memberships: {
            create: { role: 'OWNER', workspace: { create: { name: `${name.split(' ')[0]}'s Workspace` } } },
          },
        },
        include: { memberships: true },
      });
      user = created;
    }
    const workspaceId = user.memberships[0]?.workspaceId;
    if (!workspaceId) throw new ForbiddenException('Your account is not a member of any workspace');
    return this.completeLogin(user.id, workspaceId, client);
  }

  async login(dto: LoginDto, client: ClientInfo) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { memberships: { orderBy: { createdAt: 'asc' } } },
    });
    // Always run bcrypt to keep timing constant whether or not the user exists.
    dummyHash ??= await bcrypt.hash('timing-equalizer', 12);
    const valid = await bcrypt.compare(dto.password, user?.passwordHash ?? dummyHash);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');

    let workspaceId = user.memberships[0]?.workspaceId;
    if (dto.inviteToken) {
      workspaceId = await this.acceptInvite(user.id, dto.inviteToken);
    }
    if (!workspaceId) throw new ForbiddenException('Your account is not a member of any workspace');
    return this.completeLogin(user.id, workspaceId, client);
  }

  // ─── Two-factor authentication ───────────────────────────────────────────
  /** Issues a session, or a short-lived MFA challenge when the user has 2FA enabled. */
  private async completeLogin(userId: string, workspaceId: string, client: ClientInfo): Promise<LoginResult> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { twoFactorEnabledAt: true } });
    if (!user.twoFactorEnabledAt) return this.issueSession(userId, workspaceId, client);
    const mfaToken = await this.jwt.signAsync(
      { sub: userId, wid: workspaceId, typ: 'mfa' },
      { secret: env().JWT_REFRESH_SECRET, expiresIn: MFA_TTL_SECONDS },
    );
    return { mfaRequired: true, mfaToken };
  }

  async verifyMfa(mfaToken: string | undefined, code: string, client: ClientInfo) {
    let payload: { sub: string; wid: string; typ: string };
    try {
      payload = await this.jwt.verifyAsync(mfaToken ?? '', { secret: env().JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Your sign-in attempt expired. Please sign in again.');
    }
    if (payload.typ !== 'mfa') throw new UnauthorizedException('Invalid sign-in attempt');
    const ok = await this.checkSecondFactor(payload.sub, code);
    if (!ok) throw new UnauthorizedException('That code is not valid. Check your authenticator app and try again.');
    return this.issueSession(payload.sub, payload.wid, client);
  }

  /** Verifies a TOTP code, or consumes a single-use recovery code. */
  async checkSecondFactor(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabledAt: true, twoFactorRecovery: true },
    });
    if (!user.twoFactorSecret) return false;
    if (verifyTotp(decrypt(user.twoFactorSecret), code)) return true;
    const hash = sha256(normalizeRecoveryCode(code));
    if (user.twoFactorEnabledAt && user.twoFactorRecovery.includes(hash)) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorRecovery: user.twoFactorRecovery.filter((h) => h !== hash) },
      });
      return true;
    }
    return false;
  }

  // ─── Password reset ──────────────────────────────────────────────────────
  /** Resolves the same way whether or not the account exists, so the response reveals nothing. */
  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;
    const recent = await this.prisma.passwordResetToken.count({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 15 * 60 * 1000) } },
    });
    if (recent >= 3) return; // quietly rate-limit per account
    const token = randomToken(32);
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    await this.email.send({
      to: user.email,
      subject: `Reset your ${env().APP_NAME} password`,
      heading: 'Reset your password',
      paragraphs: [
        `Hi ${user.name.split(' ')[0]},`,
        'We received a request to reset the password for your account. This link expires in 1 hour and can be used once.',
      ],
      action: { label: 'Choose a new password', url: `${env().WEB_URL}/reset-password?token=${token}` },
      footer: "If you didn't request this, you can safely ignore this email — your password won't change.",
    });
  }

  async resetPassword(token: string, password: string) {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired. Request a new one.');
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await bcrypt.hash(password, 12), passwordChangedAt: now },
      }),
      this.prisma.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: now } }),
      // Anyone holding an old session is signed out.
      this.prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    return { ok: true };
  }

  /** Tells the rest of the team someone joined (Settings → Notifications → Team activity). */
  announceJoin(workspaceId: string, userId: string, name: string) {
    void this.notifications.notifyWorkspace(
      workspaceId,
      'teamActivity',
      { title: `${name} joined the workspace`, link: '/settings?tab=team' },
      { excludeUserId: userId },
    );
  }

  /** Rotates the refresh token. Presenting an already-revoked token revokes the whole family (theft detection). */
  async refresh(rawToken: string | undefined, client: ClientInfo) {
    if (!rawToken) throw new UnauthorizedException('Missing refresh token');
    const [id, secret] = rawToken.split('.');
    if (!id || !secret) throw new UnauthorizedException('Invalid refresh token');

    const stored = await this.prisma.refreshToken.findUnique({ where: { id } });
    if (!stored || stored.tokenHash !== sha256(secret)) throw new UnauthorizedException('Invalid refresh token');
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected. Please sign in again.');
    }
    if (stored.expiresAt < new Date()) throw new UnauthorizedException('Session expired');

    const membership = await this.prisma.membership.findUnique({
      where: { userId_workspaceId: { userId: stored.userId, workspaceId: stored.workspaceId } },
    });
    const fallback = membership
      ? null
      : await this.prisma.membership.findFirst({ where: { userId: stored.userId }, orderBy: { createdAt: 'asc' } });
    const workspaceId = membership?.workspaceId ?? fallback?.workspaceId;
    if (!workspaceId) throw new UnauthorizedException('No workspace access');

    await this.prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
    return this.issueSession(stored.userId, workspaceId, client);
  }

  async logout(rawToken: string | undefined) {
    const id = rawToken?.split('.')[0];
    if (id) await this.prisma.refreshToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async switchWorkspace(userId: string, workspaceId: string, client: ClientInfo) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!membership) throw new ForbiddenException('You are not a member of this workspace');
    return this.issueSession(userId, workspaceId, client);
  }

  async me(userId: string, workspaceId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        timezone: true,
        jobTitle: true,
        notificationPrefs: true,
        passwordChangedAt: true,
        twoFactorEnabledAt: true,
        createdAt: true,
        memberships: { select: { role: true, workspace: { select: { id: true, name: true, plan: true } } } },
      },
    });
    const current = user.memberships.find((m) => m.workspace.id === workspaceId);
    return {
      user: { ...user, memberships: undefined },
      workspace: current?.workspace,
      role: current?.role,
      workspaces: user.memberships.map((m) => ({ ...m.workspace, role: m.role })),
    };
  }

  async acceptInvite(userId: string, token: string): Promise<string> {
    const invite = await this.findValidInvite(token);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (invite.email && user.email !== invite.email) throw new ForbiddenException('This invitation was sent to a different email address');
    const existing = await this.prisma.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: invite.workspaceId } },
    });
    if (existing) return invite.workspaceId; // already a member: just switch to the workspace
    await this.prisma.$transaction([
      this.prisma.membership.create({ data: { userId, workspaceId: invite.workspaceId, role: invite.role } }),
      ...(invite.invitationId
        ? [this.prisma.invitation.update({ where: { id: invite.invitationId }, data: { acceptedAt: new Date() } })]
        : []),
    ]);
    this.announceJoin(invite.workspaceId, userId, user.name);
    return invite.workspaceId;
  }

  /** Public preview for the invite page: which workspace the link joins. */
  async describeInvite(token: string) {
    const invite = await this.findValidInvite(token);
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: invite.workspaceId }, select: { name: true } });
    return { workspaceName: ws.name, role: invite.role, email: invite.email };
  }

  /**
   * Resolves either a single-use email invitation or the workspace's reusable invite link
   * (tokens starting with "wl_", see Settings → Team → Invite by link).
   */
  private async findValidInvite(token: string): Promise<{ workspaceId: string; role: Role; email: string | null; invitationId: string | null }> {
    if (token.startsWith(INVITE_LINK_PREFIX)) {
      const ws = await this.prisma.workspace.findUnique({ where: { inviteLinkHash: sha256(token) } });
      if (!ws) throw new BadRequestException('This invite link is no longer active. Ask an admin for a new one.');
      const members = await this.prisma.membership.count({ where: { workspaceId: ws.id } });
      if (atLimit(members, limitsFor(ws).members)) {
        throw new ForbiddenException('This workspace has reached its member limit. Ask an admin to upgrade the plan.');
      }
      return { workspaceId: ws.id, role: ws.inviteLinkRole, email: null, invitationId: null };
    }
    const invite = await this.prisma.invitation.findUnique({ where: { tokenHash: sha256(token) } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new BadRequestException('This invitation is invalid or has expired');
    }
    return { workspaceId: invite.workspaceId, role: invite.role, email: invite.email, invitationId: invite.id };
  }

  async issueSession(userId: string, workspaceId: string, client: ClientInfo): Promise<Session> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, wid: workspaceId },
      { secret: env().JWT_ACCESS_SECRET, expiresIn: ACCESS_TTL_SECONDS },
    );
    const secret = randomToken(48);
    const stored = await this.prisma.refreshToken.create({
      data: {
        userId,
        workspaceId,
        tokenHash: sha256(secret),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        userAgent: client.userAgent?.slice(0, 255),
        ip: client.ip,
      },
    });
    return { accessToken, refreshToken: `${stored.id}.${secret}`, expiresIn: ACCESS_TTL_SECONDS };
  }

  setCookies(res: Response, session: { accessToken: string; refreshToken: string }) {
    const base = { httpOnly: true, secure: isProd(), sameSite: 'lax' as const, path: '/' };
    res.cookie(ACCESS_COOKIE, session.accessToken, { ...base, maxAge: ACCESS_TTL_SECONDS * 1000 });
    res.cookie(REFRESH_COOKIE, session.refreshToken, { ...base, maxAge: REFRESH_TTL_MS });
  }

  clearCookies(res: Response) {
    const base = { httpOnly: true, secure: isProd(), sameSite: 'lax' as const, path: '/' };
    res.clearCookie(ACCESS_COOKIE, base);
    res.clearCookie(REFRESH_COOKIE, base);
  }

  setMfaCookie(res: Response, token: string) {
    res.cookie(MFA_COOKIE, token, { httpOnly: true, secure: isProd(), sameSite: 'lax', path: '/api/auth', maxAge: MFA_TTL_SECONDS * 1000 });
  }

  clearMfaCookie(res: Response) {
    res.clearCookie(MFA_COOKIE, { httpOnly: true, secure: isProd(), sameSite: 'lax', path: '/api/auth' });
  }
}

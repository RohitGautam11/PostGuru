import { BadRequestException, Body, Controller, Get, HttpCode, Patch, Post, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import * as bcrypt from 'bcryptjs';
import { IsBoolean, IsObject, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { AuthUser, CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import * as QRCode from 'qrcode';
import { env } from '../../config/env';
import { decrypt, encrypt, sha256 } from '../../common/crypto';
import { generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, totpUri, verifyTotp } from '../../common/totp';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../email/email.service';
import { PREF_KEYS, resolvePrefs } from '../notifications/notifications.service';

class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsUrl({ require_tld: false }) @MaxLength(500) avatarUrl?: string;
  @IsOptional() @IsString() @MaxLength(80) jobTitle?: string;
}

class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'Password must contain at least one letter and one number' })
  newPassword: string;
}

class NotificationPrefsDto {
  @IsObject() prefs: Record<string, unknown>;
}

class TwoFactorCodeDto {
  @IsString() @MinLength(6) @MaxLength(20) code: string;
}

class DeleteAccountDto {
  @IsString() password: string;
  @IsOptional() @IsBoolean() confirm?: boolean;
}

const PROFILE_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  timezone: true,
  jobTitle: true,
  notificationPrefs: true,
  updatedAt: true,
} as const;

@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly email: EmailService,
  ) {}

  @Patch('me')
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    if (dto.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: dto.timezone });
      } catch {
        throw new BadRequestException('Unknown timezone');
      }
    }
    return this.prisma.user.update({ where: { id: user.id }, data: dto, select: PROFILE_SELECT });
  }

  /** Returns the effective preference matrix (stored values merged with defaults). */
  @Get('me/notifications')
  async getNotifications(@CurrentUser() user: AuthUser) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { notificationPrefs: true } });
    return { prefs: resolvePrefs(record.notificationPrefs), emailEnabled: this.email.enabled };
  }

  /** Accepts `{ prefs: { publishSuccess: { push, email }, … } }` and merges it into the stored preferences. */
  @Patch('me/notifications')
  async notifications(@CurrentUser() user: AuthUser, @Body() dto: NotificationPrefsDto) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { notificationPrefs: true } });
    const current = resolvePrefs(record.notificationPrefs);
    for (const key of PREF_KEYS) {
      const next = dto.prefs[key] as unknown;
      if (!next || typeof next !== 'object') continue;
      const { push, email } = next as { push?: unknown; email?: unknown };
      if (typeof push === 'boolean') current[key].push = push;
      if (typeof email === 'boolean') current[key].email = email;
    }
    const stored = Object.fromEntries(PREF_KEYS.flatMap((k) => [[k, current[k].push], [`${k}Email`, current[k].email]]));
    await this.prisma.user.update({ where: { id: user.id }, data: { notificationPrefs: stored } });
    return { prefs: current, emailEnabled: this.email.enabled };
  }

  // ─── Two-factor authentication (authenticator app, RFC 6238) ─────────────
  @Get('me/2fa')
  async twoFactorStatus(@CurrentUser() user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorEnabledAt: true, twoFactorRecovery: true },
    });
    return { enabled: !!u.twoFactorEnabledAt, enabledAt: u.twoFactorEnabledAt, recoveryCodesLeft: u.twoFactorRecovery.length };
  }

  /** Starts setup: stores a new (inactive) secret and returns it with a scannable QR code. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('me/2fa/setup')
  async twoFactorSetup(@CurrentUser() user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { twoFactorEnabledAt: true } });
    if (u.twoFactorEnabledAt) throw new BadRequestException('Two-factor authentication is already enabled');
    const secret = generateTotpSecret();
    await this.prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: encrypt(secret) } });
    const otpauthUrl = totpUri(secret, user.email, env().APP_NAME);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 200, color: { dark: '#0F172A', light: '#FFFFFF' } });
    return { secret, otpauthUrl, qrDataUrl };
  }

  /** Confirms setup with a code from the app; returns one-time recovery codes. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('me/2fa/enable')
  async twoFactorEnable(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { twoFactorSecret: true, twoFactorEnabledAt: true } });
    if (u.twoFactorEnabledAt) throw new BadRequestException('Two-factor authentication is already enabled');
    if (!u.twoFactorSecret) throw new BadRequestException('Start setup first');
    if (!verifyTotp(decrypt(u.twoFactorSecret), dto.code)) throw new BadRequestException('That code is not valid. Check the time on your phone and try again.');
    const codes = generateRecoveryCodes();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabledAt: new Date(), twoFactorRecovery: codes.map((c) => sha256(normalizeRecoveryCode(c))) },
    });
    return { enabled: true, recoveryCodes: codes };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('me/2fa/disable')
  async twoFactorDisable(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) {
    if (!(await this.auth.checkSecondFactor(user.id, dto.code))) throw new UnauthorizedException('That code is not valid');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorRecovery: [] },
    });
    return { enabled: false };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('me/2fa/recovery-codes')
  async twoFactorRecoveryCodes(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { twoFactorEnabledAt: true } });
    if (!u.twoFactorEnabledAt) throw new BadRequestException('Two-factor authentication is not enabled');
    if (!(await this.auth.checkSecondFactor(user.id, dto.code))) throw new UnauthorizedException('That code is not valid');
    const codes = generateRecoveryCodes();
    await this.prisma.user.update({ where: { id: user.id }, data: { twoFactorRecovery: codes.map((c) => sha256(normalizeRecoveryCode(c))) } });
    return { recoveryCodes: codes };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('me/password')
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await bcrypt.compare(dto.currentPassword, record.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 12), passwordChangedAt: new Date() },
    });
    return { ok: true };
  }

  /** Signs out every other device by revoking all refresh tokens. */
  @HttpCode(200)
  @Post('me/sessions/revoke')
  async revokeSessions(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    this.auth.clearCookies(res);
    return { ok: true };
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(200)
  @Post('me/delete')
  async deleteAccount(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto, @Res({ passthrough: true }) res: Response) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await bcrypt.compare(dto.password, record.passwordHash))) throw new UnauthorizedException('Password is incorrect');

    // Workspaces this user solely owns are deleted with them; shared workspaces keep running.
    const owned = await this.prisma.membership.findMany({ where: { userId: user.id, role: 'OWNER' } });
    for (const m of owned) {
      const otherOwners = await this.prisma.membership.count({
        where: { workspaceId: m.workspaceId, role: 'OWNER', userId: { not: user.id } },
      });
      if (otherOwners === 0) await this.prisma.workspace.delete({ where: { id: m.workspaceId } });
    }
    await this.prisma.user.delete({ where: { id: user.id } });
    this.auth.clearCookies(res);
    return { ok: true };
  }
}

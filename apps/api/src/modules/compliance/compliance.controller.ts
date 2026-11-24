import { BadRequestException, Body, Controller, Get, HttpCode, Logger, NotFoundException, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Prisma, Provider } from '@prisma/client';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { createHmac } from 'crypto';
import { adminEmails } from '../../common/admin';
import { randomToken, safeEqual } from '../../common/crypto';
import { Public } from '../../common/decorators';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';

class SignedRequestDto {
  @IsString() @MaxLength(10_000) signed_request: string;
}

class DeletionFormDto {
  @IsEmail() @MaxLength(200) email: string;
  @IsOptional() @IsString() @MaxLength(2000) details?: string;
}

const META_PROVIDERS: Provider[] = ['FACEBOOK', 'INSTAGRAM', 'THREADS'];

/**
 * Meta platform compliance callbacks (required for App Review / Live mode) and the public
 * data-deletion request form linked from /data-deletion.
 *
 * Configure in the Meta app dashboard:
 *  - Facebook Login for Business → Settings → Deauthorize callback URL: {WEB_URL}/api/compliance/meta/deauthorize
 *  - Facebook Login for Business → Settings → Data deletion request URL: {WEB_URL}/api/compliance/meta/data-deletion
 *  - Instagram (Instagram Login) and Threads → the same two URLs.
 */
@Public()
@Controller('compliance')
export class ComplianceController {
  private readonly logger = new Logger(ComplianceController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /** Verifies Meta's `signed_request` (HMAC-SHA256 of the payload with the app secret). */
  private parseSignedRequest(signed: string): { user_id?: string; algorithm?: string; issued_at?: number } {
    const [sig, payload] = (signed ?? '').split('.', 2);
    if (!sig || !payload) throw new BadRequestException('Malformed signed_request');
    const secrets = [env().META_APP_SECRET, env().INSTAGRAM_APP_SECRET, env().THREADS_APP_SECRET].filter(Boolean) as string[];
    const ok = secrets.some((secret) => safeEqual(createHmac('sha256', secret).update(payload).digest('base64url'), sig.replace(/=+$/, '')));
    if (!ok) throw new BadRequestException('Invalid signed_request signature');
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.algorithm && String(data.algorithm).toUpperCase() !== 'HMAC-SHA256') throw new BadRequestException('Unsupported algorithm');
    return data;
  }

  /** Accounts connected by this Meta user: Page owner (fbUserId) or the Instagram/Threads profile itself. */
  private accountsFor(userId: string) {
    return this.prisma.socialAccount.findMany({
      where: {
        provider: { in: META_PROVIDERS },
        OR: [{ externalId: userId }, { metadata: { path: ['fbUserId'], equals: userId } as Prisma.JsonFilter<'SocialAccount'> }],
      },
      select: { id: true, workspaceId: true, name: true, provider: true },
    });
  }

  /** The person removed the app in their Facebook/Instagram settings: stop using their tokens. */
  @HttpCode(200)
  @Post('meta/deauthorize')
  async deauthorize(@Body() dto: SignedRequestDto) {
    const data = this.parseSignedRequest(dto.signed_request);
    if (!data.user_id) return { ok: true };
    const accounts = await this.accountsFor(String(data.user_id));
    if (accounts.length) {
      await this.prisma.socialAccount.updateMany({
        where: { id: { in: accounts.map((a) => a.id) } },
        data: { status: 'EXPIRED', statusMessage: 'Access was removed in your Meta settings. Reconnect to keep publishing.' },
      });
    }
    this.logger.log(`Meta deauthorize for user ${data.user_id}: ${accounts.length} account(s) disconnected`);
    return { ok: true };
  }

  /** Meta "Data Deletion Request" callback: delete the user's tokens and synced data, return a status URL. */
  @HttpCode(200)
  @Post('meta/data-deletion')
  async metaDataDeletion(@Body() dto: SignedRequestDto) {
    const data = this.parseSignedRequest(dto.signed_request);
    const userId = data.user_id ? String(data.user_id) : null;
    const accounts = userId ? await this.accountsFor(userId) : [];
    // Deleting the SocialAccount cascades to its tokens, comments, conversations, metrics and post targets.
    if (accounts.length) await this.prisma.socialAccount.deleteMany({ where: { id: { in: accounts.map((a) => a.id) } } });
    const code = `del_${randomToken(9)}`;
    await this.prisma.dataDeletionRequest.create({
      data: {
        confirmationCode: code,
        source: 'meta',
        externalUserId: userId,
        status: 'COMPLETED',
        completedAt: new Date(),
        details: `${accounts.length} connected account(s) and their synced data deleted.`,
      },
    });
    return { url: `${env().WEB_URL}/data-deletion?code=${code}`, confirmation_code: code };
  }

  /** Public form on /data-deletion for anyone (users or not) to request removal of their data. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('data-deletion')
  async request(@Body() dto: DeletionFormDto) {
    const code = `del_${randomToken(9)}`;
    await this.prisma.dataDeletionRequest.create({
      data: { confirmationCode: code, source: 'form', email: dto.email.toLowerCase(), details: dto.details?.slice(0, 2000) ?? null },
    });
    await Promise.all(
      adminEmails().map((to) =>
        this.email.send({
          to,
          subject: `Data deletion request ${code}`,
          heading: 'New data deletion request',
          paragraphs: [`From: ${dto.email}`, dto.details ?? '(no details)', 'Complete it within 30 days and mark it done in the admin console.'],
          action: { label: 'Open admin console', url: `${env().WEB_URL}/admin` },
        }),
      ),
    );
    return { confirmationCode: code, url: `${env().WEB_URL}/data-deletion?code=${code}` };
  }

  @Get('data-deletion/status')
  async status(@Query('code') code?: string) {
    if (!code) throw new BadRequestException('Missing confirmation code');
    const r = await this.prisma.dataDeletionRequest.findUnique({ where: { confirmationCode: code } });
    if (!r) throw new NotFoundException('No deletion request with this confirmation code');
    return { confirmationCode: r.confirmationCode, status: r.status, requestedAt: r.createdAt, completedAt: r.completedAt, details: r.details };
  }
}

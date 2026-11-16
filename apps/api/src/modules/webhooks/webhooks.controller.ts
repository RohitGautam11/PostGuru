import { BadRequestException, Controller, ForbiddenException, Get, HttpCode, Logger, Post, Query, Req } from '@nestjs/common';
import { createHmac } from 'crypto';
import type { Request } from 'express';
import { env } from '../../config/env';
import { safeEqual } from '../../common/crypto';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncService } from '../social/sync.service';

/**
 * Meta (Facebook Pages + Instagram) webhooks. Configure the callback URL as
 * `${WEB_URL}/api/webhooks/meta` with the verify token from META_WEBHOOK_VERIFY_TOKEN.
 */
@Public()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
  ) {}

  @Get('meta')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const expected = env().META_WEBHOOK_VERIFY_TOKEN;
    if (mode === 'subscribe' && expected && token && safeEqual(token, expected)) return challenge;
    throw new ForbiddenException('Verification failed');
  }

  @HttpCode(200)
  @Post('meta')
  async receive(@Req() req: Request & { rawBody?: Buffer }) {
    const secret = env().META_APP_SECRET;
    const signature = req.headers['x-hub-signature-256'];
    if (!secret || !req.rawBody || typeof signature !== 'string') throw new BadRequestException('Missing signature');
    const expected = 'sha256=' + createHmac('sha256', secret).update(req.rawBody).digest('hex');
    if (!safeEqual(signature, expected)) throw new ForbiddenException('Invalid signature');

    const body = req.body as { object?: string; entry?: any[] };
    const provider = body.object === 'instagram' ? 'INSTAGRAM' : body.object === 'page' ? 'FACEBOOK' : null;
    if (!provider) return { ok: true };

    for (const entry of body.entry ?? []) {
      const wantsInbox = Array.isArray(entry.messaging) && entry.messaging.length > 0;
      const wantsComments = Array.isArray(entry.changes) && entry.changes.some((c: any) => ['feed', 'comments', 'mentions'].includes(c.field));
      if (!wantsInbox && !wantsComments) continue;

      // A Page id can also own an IG account (DMs for IG arrive via the Page when object=instagram).
      const accounts = await this.prisma.socialAccount.findMany({
        where: {
          status: 'CONNECTED',
          OR: [
            { provider, externalId: String(entry.id) },
            { provider: 'INSTAGRAM', metadata: { path: ['pageId'], equals: String(entry.id) } },
          ],
        },
      });
      for (const account of accounts) {
        await this.sync
          .syncAccount(account, { inbox: wantsInbox, comments: wantsComments })
          .catch((err) => this.logger.warn(`Webhook sync failed for ${account.id}: ${(err as Error).message}`));
      }
    }
    return { ok: true };
  }
}

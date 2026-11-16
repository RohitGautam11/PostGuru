import { BadRequestException, Controller, Get, Logger, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { env } from '../../config/env';
import { pkcePair, randomToken } from '../../common/crypto';
import { AuthUser, CurrentUser, MinRole, Public } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from './accounts.service';
import { ProviderRegistry } from './provider.registry';
import { SyncService } from './sync.service';

const STATE_TTL_MS = 10 * 60 * 1000;

/** The OAuth redirect URI is on the web domain; Next.js proxies /api/* to this API. */
export const callbackUrl = (provider: string) => `${env().WEB_URL}/api/integrations/${provider.toLowerCase()}/callback`;

@Controller('integrations')
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    private readonly accounts: AccountsService,
    private readonly sync: SyncService,
  ) {}

  @Get()
  list() {
    return this.registry.all().map((p) => ({
      key: p.key,
      name: p.displayName,
      configured: p.isConfigured(),
      capabilities: p.capabilities,
      callbackUrl: callbackUrl(p.key),
    }));
  }

  @MinRole('ADMIN')
  @Get(':provider/connect')
  async connect(@CurrentUser() user: AuthUser, @Param('provider') key: string) {
    const provider = this.registry.get(key);
    if (!provider.isConfigured()) {
      throw new BadRequestException(`${provider.displayName} is not configured on the server. See README → Social platform setup.`);
    }
    const state = randomToken(32);
    const pkce = provider.usesPkce ? pkcePair() : null;
    await this.prisma.oAuthState.create({
      data: {
        id: state,
        workspaceId: user.workspaceId,
        userId: user.id,
        provider: provider.key,
        codeVerifier: pkce?.verifier ?? null,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });
    return { url: provider.getAuthUrl({ state, redirectUri: callbackUrl(provider.key), codeChallenge: pkce?.challenge }) };
  }

  @Public()
  @Get(':provider/callback')
  async callback(
    @Param('provider') key: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() res: Response,
  ) {
    const back = (params: Record<string, string>) =>
      res.redirect(`${env().WEB_URL}/connect?${new URLSearchParams(params).toString()}`);

    if (error) return back({ error: errorDescription || error });
    if (!code || !state) return back({ error: 'Missing authorization code' });

    const stored = await this.prisma.oAuthState.findUnique({ where: { id: state } });
    if (stored) await this.prisma.oAuthState.delete({ where: { id: state } }); // single use
    if (!stored || stored.expiresAt < new Date() || stored.provider !== key.toUpperCase()) {
      return back({ error: 'The connection request expired or is invalid. Please try again.' });
    }

    try {
      const provider = this.registry.get(stored.provider);
      const connected = await provider.handleCallback({
        code,
        redirectUri: callbackUrl(provider.key),
        codeVerifier: stored.codeVerifier,
      });
      const saved = await this.accounts.saveConnected(stored.workspaceId, connected);
      // Kick off an initial sync in the background; failures are non-fatal.
      Promise.all(saved.map((a) => this.sync.syncAccount(a))).catch(() => undefined);
      return back({ connected: provider.key.toLowerCase(), count: String(saved.length) });
    } catch (err) {
      this.logger.warn(`OAuth callback for ${key} failed: ${(err as Error).message}`);
      return back({ error: (err as Error).message.slice(0, 300) });
    }
  }
}

import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, SocialAccount } from '@prisma/client';
import { decrypt, encrypt } from '../../common/crypto';
import { ProviderError } from '../../common/http';
import { limitsFor } from '../../common/plans';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProviderRegistry } from './provider.registry';
import { AccountContext, ConnectedAccount, SocialProvider } from './provider.types';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Brand/business identities that require a plan with business accounts. */
export function isBusinessAccount(a: { provider: string; metadata?: Record<string, unknown> | null }) {
  if (a.provider === 'FACEBOOK') return true;
  if (a.provider === 'LINKEDIN') return a.metadata?.kind === 'organization';
  if (a.provider === 'INSTAGRAM') return a.metadata?.loginType !== 'instagram';
  return false;
}

export const PUBLIC_ACCOUNT_SELECT = {
  id: true,
  provider: true,
  externalId: true,
  name: true,
  username: true,
  avatarUrl: true,
  status: true,
  statusMessage: true,
  followers: true,
  lastSyncedAt: true,
  tokenExpiresAt: true,
  createdAt: true,
} satisfies Prisma.SocialAccountSelect;

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    private readonly notifications: NotificationsService,
  ) {}

  async list(workspaceId: string) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { workspaceId },
      select: PUBLIC_ACCOUNT_SELECT,
      orderBy: [{ provider: 'asc' }, { createdAt: 'asc' }],
    });
    return accounts.map((a) => ({ ...a, capabilities: this.registry.get(a.provider).capabilities }));
  }

  async findOwned(workspaceId: string, id: string) {
    const account = await this.prisma.socialAccount.findFirst({ where: { id, workspaceId } });
    if (!account) throw new NotFoundException('Social account not found');
    return account;
  }

  /** Persist accounts returned by an OAuth callback, enforcing the plan's account limit. */
  async saveConnected(workspaceId: string, accounts: ConnectedAccount[]) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const limits = limitsFor(ws);
    const limit = limits.accounts;
    if (!limits.businessAccounts) {
      const business = accounts.filter(isBusinessAccount);
      if (business.length) {
        throw new ForbiddenException(
          `${business[0].name} is a business page. The ${limits.name} plan supports personal and creator profiles; upgrade to Business to connect Facebook Pages, LinkedIn Company Pages and brand Instagram accounts.`,
        );
      }
    }
    const existing = await this.prisma.socialAccount.findMany({
      where: { workspaceId },
      select: { provider: true, externalId: true },
    });
    const existingKeys = new Set(existing.map((e) => `${e.provider}:${e.externalId}`));
    const newOnes = accounts.filter((a) => !existingKeys.has(`${a.provider}:${a.externalId}`));
    if (limit >= 0 && existing.length + newOnes.length > limit) {
      throw new ForbiddenException(
        `Your ${limits.name} plan supports up to ${limit} connected accounts. Please upgrade to add more.`,
      );
    }

    const saved: SocialAccount[] = [];
    for (const a of accounts) {
      const data = {
        name: a.name,
        username: a.username ?? null,
        avatarUrl: a.avatarUrl ?? null,
        accessToken: encrypt(a.accessToken),
        refreshToken: a.refreshToken ? encrypt(a.refreshToken) : null,
        tokenExpiresAt: a.expiresAt ?? null,
        scopes: a.scopes,
        metadata: (a.metadata ?? {}) as Prisma.InputJsonValue,
        followers: a.followers ?? null,
        status: 'CONNECTED' as const,
        statusMessage: null,
      };
      saved.push(
        await this.prisma.socialAccount.upsert({
          where: { workspaceId_provider_externalId: { workspaceId, provider: a.provider, externalId: a.externalId } },
          create: { workspaceId, provider: a.provider, externalId: a.externalId, ...data },
          update: data,
        }),
      );
    }
    return saved;
  }

  async disconnect(workspaceId: string, id: string) {
    await this.findOwned(workspaceId, id);
    await this.prisma.socialAccount.delete({ where: { id } });
  }

  /** Decrypts tokens and transparently refreshes them when close to expiry. */
  async getContext(account: SocialAccount): Promise<AccountContext> {
    const provider = this.registry.get(account.provider);
    let accessToken = decrypt(account.accessToken);
    const expiring = account.tokenExpiresAt && account.tokenExpiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS;

    if (expiring) {
      if (!account.refreshToken || !provider.refreshTokens) {
        await this.markExpired(account, 'Access token expired. Please reconnect this account.');
        throw new ProviderError('Access token expired. Please reconnect this account.', 401, false, true);
      }
      try {
        const tokens = await provider.refreshTokens(decrypt(account.refreshToken));
        accessToken = tokens.accessToken;
        await this.prisma.socialAccount.update({
          where: { id: account.id },
          data: {
            accessToken: encrypt(tokens.accessToken),
            refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : account.refreshToken,
            tokenExpiresAt: tokens.expiresAt ?? null,
            status: 'CONNECTED',
            statusMessage: null,
          },
        });
      } catch (err) {
        const message = `Token refresh failed: ${(err as Error).message}`;
        await this.markExpired(account, message);
        throw new ProviderError(message, 401, false, true);
      }
    }

    return {
      id: account.id,
      externalId: account.externalId,
      accessToken,
      username: account.username,
      metadata: (account.metadata as Record<string, any>) ?? {},
    };
  }

  /**
   * Token lifecycle engine. 60-day tokens (Instagram Login, Threads) are refreshed once they are
   * ~50 days old (i.e. within 10 days of expiry); short-lived OAuth tokens (X, LinkedIn, Google,
   * TikTok, Pinterest) are refreshed when they expire within the next hour. Runs daily via cron.
   */
  async refreshExpiringTokens(budgetMs = 45_000) {
    const started = Date.now();
    const soon = new Date(Date.now() + 10 * 86400_000);
    const candidates = await this.prisma.socialAccount.findMany({
      where: { status: 'CONNECTED', refreshToken: { not: null }, tokenExpiresAt: { not: null, lt: soon } },
      orderBy: { tokenExpiresAt: 'asc' },
      take: 100,
    });
    let refreshed = 0;
    const failed: string[] = [];
    for (const account of candidates) {
      if (Date.now() - started > budgetMs) break;
      const provider = this.registry.get(account.provider);
      if (!provider.refreshTokens || !account.refreshToken) continue;
      const longLived = account.provider === 'INSTAGRAM' || account.provider === 'THREADS';
      const msLeft = account.tokenExpiresAt!.getTime() - Date.now();
      if (!longLived && msLeft > 60 * 60 * 1000) continue;
      try {
        const tokens = await provider.refreshTokens(decrypt(account.refreshToken));
        await this.prisma.socialAccount.update({
          where: { id: account.id },
          data: {
            accessToken: encrypt(tokens.accessToken),
            refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : account.refreshToken,
            tokenExpiresAt: tokens.expiresAt ?? null,
            status: 'CONNECTED',
            statusMessage: null,
          },
        });
        refreshed++;
      } catch (err) {
        failed.push(account.id);
        // Only flag the account once the token has really run out; until then it still works.
        if (msLeft < REFRESH_MARGIN_MS) await this.markExpired(account, `Token refresh failed: ${(err as Error).message}`);
        this.logger.warn(`Proactive refresh for ${account.id} failed: ${(err as Error).message}`);
      }
    }
    return { candidates: candidates.length, refreshed, failed: failed.length };
  }

  /**
   * Runs a provider call with a ready context. Auth failures flag the account as EXPIRED so the UI
   * can prompt the user to reconnect.
   */
  async withProvider<T>(account: SocialAccount, fn: (ctx: AccountContext, provider: SocialProvider) => Promise<T>): Promise<T> {
    const provider = this.registry.get(account.provider);
    const ctx = await this.getContext(account);
    try {
      return await fn(ctx, provider);
    } catch (err) {
      if (err instanceof ProviderError && err.authError) {
        await this.markExpired(account, err.message);
      }
      throw err;
    }
  }

  private async markExpired(account: SocialAccount, message: string) {
    if (account.status === 'EXPIRED') return;
    await this.prisma.socialAccount.update({
      where: { id: account.id },
      data: { status: 'EXPIRED', statusMessage: message.slice(0, 500) },
    });
    await this.notifications.notifyWorkspace(account.workspaceId, 'accountIssues', {
      title: `${account.name} needs to be reconnected`,
      body: message.slice(0, 300),
      link: '/connect',
    });
    this.logger.warn(`Account ${account.id} marked expired: ${message}`);
  }
}

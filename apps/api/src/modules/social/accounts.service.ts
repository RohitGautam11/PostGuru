import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, SocialAccount } from '@prisma/client';
import { decrypt, encrypt } from '../../common/crypto';
import { ProviderError } from '../../common/http';
import { PLAN_LIMITS } from '../../common/plans';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProviderRegistry } from './provider.registry';
import { AccountContext, ConnectedAccount, SocialProvider } from './provider.types';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

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
    const limit = PLAN_LIMITS[ws.plan].accounts;
    const existing = await this.prisma.socialAccount.findMany({
      where: { workspaceId },
      select: { provider: true, externalId: true },
    });
    const existingKeys = new Set(existing.map((e) => `${e.provider}:${e.externalId}`));
    const newOnes = accounts.filter((a) => !existingKeys.has(`${a.provider}:${a.externalId}`));
    if (existing.length + newOnes.length > limit) {
      throw new ForbiddenException(
        `Your ${PLAN_LIMITS[ws.plan].name} plan allows ${limit} connected accounts. Upgrade to connect more.`,
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

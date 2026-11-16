import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser, MinRole } from '../../common/decorators';
import { AccountsService } from './accounts.service';
import { SyncService } from './sync.service';

@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly sync: SyncService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.accounts.list(user.workspaceId);
  }

  @MinRole('ADMIN')
  @Delete(':id')
  async disconnect(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.accounts.disconnect(user.workspaceId, id);
    return { ok: true };
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @HttpCode(200)
  @Post('sync')
  async syncAll(@CurrentUser() user: AuthUser) {
    return this.sync.syncWorkspace(user.workspaceId);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post(':id/sync')
  async syncOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const account = await this.accounts.findOwned(user.workspaceId, id);
    return this.sync.syncAccount(account);
  }
}

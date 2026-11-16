import { Global, Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { IntegrationsController } from './integrations.controller';
import { ProviderRegistry } from './provider.registry';
import { SyncService } from './sync.service';

@Global()
@Module({
  controllers: [IntegrationsController, AccountsController],
  providers: [ProviderRegistry, AccountsService, SyncService],
  exports: [ProviderRegistry, AccountsService, SyncService],
})
export class SocialModule {}

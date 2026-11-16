import { Controller, Get, HttpCode, Global, Module, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/decorators';
import { NotificationsService } from './notifications.service';
import { ReportsService } from './reports.service';

@Controller('notifications')
class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.id, user.workspaceId);
  }

  @HttpCode(200)
  @Post('read-all')
  async readAll(@CurrentUser() user: AuthUser) {
    await this.notifications.markAllRead(user.id, user.workspaceId);
    return { ok: true };
  }

  @HttpCode(200)
  @Post(':id/read')
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.notifications.markRead(user.id, id);
    return { ok: true };
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, ReportsService],
  exports: [NotificationsService, ReportsService],
})
export class NotificationsModule {}

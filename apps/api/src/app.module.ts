import { GrowthModule } from './modules/growth/growth.module';
import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Public } from './common/decorators';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { AnalyticsController } from './modules/analytics/analytics.controller';
import { DashboardController } from './modules/analytics/dashboard.controller';
import { AuthModule } from './modules/auth/auth.module';
import { BillingController } from './modules/billing/billing.controller';
import { CronController, CronJobs } from './modules/cron/cron.controller';
import { EmailModule } from './modules/email/email.service';
import { EngagementModule } from './modules/engagement.module';
import { MediaModule } from './modules/media/media.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PostsModule } from './modules/posts/posts.module';
import { SocialModule } from './modules/social/social.module';
import { UsersModule } from './modules/users/users.module';
import { WebhooksController } from './modules/webhooks/webhooks.controller';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';

@Public()
@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    EmailModule,
    NotificationsModule,
    SocialModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    MediaModule,
    PostsModule,
    EngagementModule,
    GrowthModule,
  ],
  controllers: [HealthController, AnalyticsController, DashboardController, BillingController, WebhooksController, CronController],
  providers: [
    CronJobs,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}

import { Body, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, Post } from '@nestjs/common';
import { atLimit, limitsFor } from '../../common/plans';
import { PrismaService } from '../../prisma/prisma.service';
import { Throttle } from '@nestjs/throttler';
import { Provider } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { AuthUser, CurrentUser, MinRole } from '../../common/decorators';
import { AI_TASKS, AiService, AiTask } from './ai.service';
import { GrowthService } from './growth.service';

const PROVIDERS = Object.values(Provider);

class MediaMetaDto {
  @IsIn(['IMAGE', 'VIDEO']) type: 'IMAGE' | 'VIDEO';
  @IsOptional() @IsNumber() width?: number;
  @IsOptional() @IsNumber() height?: number;
  @IsOptional() @IsNumber() duration?: number;
}

class ScoreDto {
  @IsString() @MaxLength(63206) content: string;
  @IsArray() @ArrayMaxSize(10) @IsIn(PROVIDERS, { each: true }) providers: Provider[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => MediaMetaDto) media?: MediaMetaDto[];
  @IsOptional() @IsString() @MaxLength(2000) link?: string;
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsDateString() scheduledAt?: string;
}

class HashtagDto {
  @IsString() @MaxLength(63206) content: string;
  @IsArray() @ArrayMaxSize(10) @IsIn(PROVIDERS, { each: true }) providers: Provider[];
}

class AssistDto {
  @IsIn(AI_TASKS) task: AiTask;
  @IsOptional() @IsString() @MaxLength(63206) content?: string;
  @IsOptional() @IsString() @MaxLength(1000) topic?: string;
  @IsOptional() @IsString() @MaxLength(60) tone?: string;
  @IsOptional() @IsString() @MaxLength(200) audience?: string;
  @IsOptional() @IsString() @MaxLength(40) language?: string;
  @IsArray() @ArrayMaxSize(10) @IsIn(PROVIDERS, { each: true }) providers: Provider[];
}

class ReplyDto {
  @IsIn(PROVIDERS) platform: Provider;
  @IsIn(['comment', 'dm']) kind: 'comment' | 'dm';
  @IsString() @MaxLength(5000) message: string;
  @IsOptional() @IsString() @MaxLength(120) authorName?: string;
  @IsOptional() @IsString() @MaxLength(5000) context?: string;
  @IsOptional() @IsString() @MaxLength(300) brandVoice?: string;
}

/** Monthly AI credit metering per plan (Starter 5, Creator 100, Business 500, Agency unlimited). */
@Injectable()
export class AiCredits {
  constructor(private readonly prisma: PrismaService) {}

  async consume(workspaceId: string) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const limits = limitsFor(ws);
    const month = new Date().toISOString().slice(0, 7);
    const used = ws.aiCreditsMonth === month ? ws.aiCreditsUsed : 0;
    if (atLimit(used, limits.aiCreditsPerMonth)) {
      throw new ForbiddenException(
        `You've used all ${limits.aiCreditsPerMonth} AI credits in the ${limits.name} plan this month. Upgrade for more.`,
      );
    }
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: ws.aiCreditsMonth === month ? { aiCreditsUsed: { increment: 1 } } : { aiCreditsMonth: month, aiCreditsUsed: 1 },
    });
    return { used: used + 1, limit: limits.aiCreditsPerMonth };
  }
}

/** Growth Assistant: content scoring, hashtag intelligence, format guide, insights and the optional AI helper. */
@Controller('growth')
class GrowthController {
  constructor(
    private readonly growth: GrowthService,
    private readonly ai: AiService,
    private readonly credits: AiCredits,
  ) {}

  @Get('status')
  status() {
    return { ai: this.ai.enabled() };
  }

  @HttpCode(200)
  @Post('score')
  score(@CurrentUser() user: AuthUser, @Body() dto: ScoreDto) {
    return this.growth.score(user.workspaceId, dto);
  }

  @HttpCode(200)
  @Post('hashtags')
  hashtags(@CurrentUser() user: AuthUser, @Body() dto: HashtagDto) {
    return this.growth.hashtags(user.workspaceId, dto.content, dto.providers);
  }

  @Get('insights')
  insights(@CurrentUser() user: AuthUser) {
    return this.growth.insights(user.workspaceId);
  }

  @Get('formats')
  formats() {
    return this.growth.formats();
  }

  @MinRole('EDITOR')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('assist')
  async assist(@CurrentUser() user: AuthUser, @Body() dto: AssistDto) {
    if (!this.ai.enabled()) return this.ai.run(dto); // throws "not configured" without using a credit
    const credits = await this.credits.consume(user.workspaceId);
    return { ...(await this.ai.run(dto)), credits };
  }

  /** AI reply suggestions for an inbox comment or DM. */
  @MinRole('EDITOR')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('replies')
  async replies(@CurrentUser() user: AuthUser, @Body() dto: ReplyDto) {
    if (!this.ai.enabled()) return this.ai.suggestReplies(dto);
    const credits = await this.credits.consume(user.workspaceId);
    return { ...(await this.ai.suggestReplies(dto)), credits };
  }
}

@Module({
  controllers: [GrowthController],
  providers: [GrowthService, AiService, AiCredits],
})
export class GrowthModule {}

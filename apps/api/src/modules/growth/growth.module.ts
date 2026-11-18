import { Body, Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
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

/** Growth Assistant: content scoring, hashtag intelligence, format guide, insights and the optional AI helper. */
@Controller('growth')
class GrowthController {
  constructor(
    private readonly growth: GrowthService,
    private readonly ai: AiService,
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
  assist(@Body() dto: AssistDto) {
    return this.ai.run(dto);
  }
}

@Module({
  controllers: [GrowthController],
  providers: [GrowthService, AiService],
})
export class GrowthModule {}

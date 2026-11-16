import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const POST_ACTIONS = ['draft', 'schedule', 'publish'] as const;
export type PostAction = (typeof POST_ACTIONS)[number];

export class UpsertPostDto {
  @IsString()
  @MaxLength(63206)
  content: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  mediaIds?: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  accountIds: string[];

  @IsIn(POST_ACTIONS)
  action: PostAction;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  link?: string;

  /** Per-platform customisation, keyed by provider: { X: { content: '...' }, YOUTUBE: { title: '...' } } */
  @IsOptional()
  @IsObject()
  overrides?: Record<string, { content?: string; title?: string }>;
}

export class ListPostsQuery {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize?: number;
}

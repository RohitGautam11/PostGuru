import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { IsDateString } from 'class-validator';
import { AuthUser, CurrentUser, MinRole } from '../../common/decorators';
import { ListPostsQuery, UpsertPostDto } from './posts.dto';
import { PostsService } from './posts.service';

class RescheduleDto {
  @IsDateString() scheduledAt: string;
}

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListPostsQuery) {
    return this.posts.list(user.workspaceId, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.posts.get(user.workspaceId, id);
  }

  @MinRole('EDITOR')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertPostDto) {
    return this.posts.create(user, dto);
  }

  @MinRole('EDITOR')
  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertPostDto) {
    return this.posts.update(user, id, dto);
  }

  @MinRole('EDITOR')
  @Patch(':id/schedule')
  reschedule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RescheduleDto) {
    return this.posts.reschedule(user, id, dto.scheduledAt);
  }

  @MinRole('EDITOR')
  @HttpCode(200)
  @Post(':id/publish')
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.posts.publishNow(user, id);
  }

  @MinRole('EDITOR')
  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.posts.duplicate(user, id);
  }

  @MinRole('EDITOR')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('remote') remote?: string) {
    return this.posts.remove(user, id, remote === 'true');
  }
}

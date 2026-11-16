import { Module } from '@nestjs/common';
import { CommentsController } from './comments/comments.controller';
import { InboxController } from './inbox/inbox.controller';
import { ThreadsController } from './inbox/threads.controller';

/** Unified inbox (DMs + comment threads) and comment moderation. */
@Module({ controllers: [ThreadsController, InboxController, CommentsController] })
export class EngagementModule {}

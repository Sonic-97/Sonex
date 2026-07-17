import { Module } from '@nestjs/common';
import { ReplyRouterService } from './reply-router.service';

@Module({
  imports: [],
  providers: [ReplyRouterService],
  exports: [ReplyRouterService],
})
export class ReplyRouterModule {}

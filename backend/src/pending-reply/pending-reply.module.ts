import { Global, Module } from '@nestjs/common';
import { PendingReplyService } from './pending-reply.service';

@Global()
@Module({
  providers: [PendingReplyService],
  exports: [PendingReplyService],
})
export class PendingReplyModule {}

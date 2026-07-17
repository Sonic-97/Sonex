import { Module } from '@nestjs/common';
import { ReplyEngineService } from './reply-engine.service';

@Module({
  providers: [ReplyEngineService],
  exports: [ReplyEngineService],
})
export class ReplyEngineModule {}

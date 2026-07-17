import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingModule } from '../messaging/messaging.module';
import { AiWaiterService } from './ai-waiter.service';
import { AiWaiterScheduler } from './ai-waiter.scheduler';

@Module({
  imports: [PrismaModule, MessagingModule],
  providers: [AiWaiterService, AiWaiterScheduler],
  exports: [AiWaiterService],
})
export class AiWaiterModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AiWaiterService } from './ai-waiter.service';
import { AiWaiterScheduler } from './ai-waiter.scheduler';

@Module({
  imports: [PrismaModule, WhatsappModule],
  providers: [AiWaiterService, AiWaiterScheduler],
  exports: [AiWaiterService],
})
export class AiWaiterModule {}

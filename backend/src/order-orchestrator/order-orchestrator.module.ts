import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrderOrchestratorService } from './order-orchestrator.service';
import { OrderSplitterService } from './order-splitter.service';

@Module({
  imports: [PrismaModule],
  providers: [OrderOrchestratorService, OrderSplitterService],
  exports: [OrderOrchestratorService, OrderSplitterService],
})
export class OrderOrchestratorModule {}

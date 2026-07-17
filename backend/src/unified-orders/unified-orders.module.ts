import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CustomerLearningModule } from '../customer-learning/customer-learning.module';
import { UnifiedOrdersService } from './unified-orders.service';
import { OrderStatusMachine } from './order-status-machine.service';
import { OrderItemsService } from './order-items.service';
import { OrderPaymentService } from './order-payment.service';

@Module({
  imports: [
    PrismaModule,
    EventsModule,
    AuditModule,
    CommonModule,
    InventoryModule,
    CustomerLearningModule,
  ],
  providers: [
    UnifiedOrdersService,
    OrderStatusMachine,
    OrderItemsService,
    OrderPaymentService,
  ],
  exports: [
    UnifiedOrdersService,
    OrderStatusMachine,
    OrderItemsService,
    OrderPaymentService,
  ],
})
export class UnifiedOrdersModule {}

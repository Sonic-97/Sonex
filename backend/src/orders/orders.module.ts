import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MessagesModule } from '../messages/messages.module';
import { OrderStatusService } from './order-status.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ProductManagementModule } from '../product-management/product-management.module';
import { CustomerLearningModule } from '../customer-learning/customer-learning.module';

@Module({
  imports: [PrismaModule, InventoryModule, MessagesModule, WhatsappModule, ProductManagementModule, CustomerLearningModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderStatusService],
  exports: [OrdersService],
})
export class OrdersModule {}





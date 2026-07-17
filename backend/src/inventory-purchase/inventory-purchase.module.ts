import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryPurchaseController } from './inventory-purchase.controller';
import { InventoryPurchaseService } from './inventory-purchase.service';

@Module({
  imports: [PrismaModule],
  controllers: [InventoryPurchaseController],
  providers: [InventoryPurchaseService],
  exports: [InventoryPurchaseService],
})
export class InventoryPurchaseModule {}





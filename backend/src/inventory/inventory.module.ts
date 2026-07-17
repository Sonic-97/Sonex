import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { QueueModule } from '../queue/queue.module';
import { InventoryCacheService } from './services/inventory-cache.service';
import { InventorySyncProcessor } from './processors/inventory-sync.processor';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, RedisModule, QueueModule, NotificationsModule],
  providers: [InventoryService, InventoryCacheService, InventorySyncProcessor],
  controllers: [InventoryController],
  exports: [InventoryService, InventoryCacheService],
})
export class InventoryModule {}





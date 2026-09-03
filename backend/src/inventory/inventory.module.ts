import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { QueueModule } from '../queue/queue.module';
import { InventorySyncProcessor } from './processors/inventory-sync.processor';
import { NotificationsModule } from '../notifications/notifications.module';
import { InventorySubscriber } from '../domain-events/subscribers/inventory.subscriber';
import { InventoryPipelineModule } from '../inventory-pipeline/inventory-pipeline.module';
import { InventoryCacheModule } from '../inventory-cache/inventory-cache.module';

@Module({
  imports: [PrismaModule, RedisModule, QueueModule, NotificationsModule, InventoryPipelineModule, InventoryCacheModule],
  providers: [InventoryService, InventorySyncProcessor, InventorySubscriber],
  controllers: [InventoryController],
  exports: [InventoryService, InventoryCacheModule],
})
export class InventoryModule {}





import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { QueueModule } from '../queue/queue.module';
import { InventoryCacheService } from '../inventory/services/inventory-cache.service';

@Module({
  imports: [PrismaModule, RedisModule, QueueModule],
  providers: [InventoryCacheService],
  exports: [InventoryCacheService],
})
export class InventoryCacheModule {}

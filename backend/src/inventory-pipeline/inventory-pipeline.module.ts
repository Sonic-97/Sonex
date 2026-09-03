import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InventoryPipelineService } from './inventory-pipeline.service';
import { InventoryCacheModule } from '../inventory-cache/inventory-cache.module';

@Module({
  imports: [PrismaModule, EventsModule, AuditModule, NotificationsModule, InventoryCacheModule],
  providers: [InventoryPipelineService],
  exports: [InventoryPipelineService],
})
export class InventoryPipelineModule {}

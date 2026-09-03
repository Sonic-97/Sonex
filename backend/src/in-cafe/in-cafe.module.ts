import { Module } from '@nestjs/common';
import { InCafeController } from './in-cafe.controller';
import { InCafeService } from './in-cafe.service';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { InventoryPipelineModule } from '../inventory-pipeline/inventory-pipeline.module';
import { KitchenWebsocketGateway } from './gateways/kitchen-websocket.gateway';
import { OutboxEventSubscriber } from './subscribers/outbox-event.subscriber';

@Module({
  imports: [PrismaModule, InventoryModule, InventoryPipelineModule],
  controllers: [InCafeController],
  providers: [InCafeService, KitchenWebsocketGateway, OutboxEventSubscriber],
  exports: [InCafeService, KitchenWebsocketGateway, OutboxEventSubscriber],
})
export class InCafeModule {}





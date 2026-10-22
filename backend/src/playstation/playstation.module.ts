import { Module } from '@nestjs/common';
import { PlayStationController } from './playstation.controller';
import { PlayStationService } from './playstation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { PaymentModule } from '../payment/payment.module';
import { InventoryPipelineModule } from '../inventory-pipeline/inventory-pipeline.module';

@Module({
  imports: [PrismaModule, EventsModule, PaymentModule, InventoryPipelineModule],
  controllers: [PlayStationController],
  providers: [PlayStationService],
  exports: [PlayStationService],
})
export class PlayStationModule {}

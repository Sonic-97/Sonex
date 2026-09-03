import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UnifiedOrdersModule } from '../unified-orders/unified-orders.module';
import { RunningAccountModule } from '../running-account/running-account.module';
import { RecipeBOMModule } from '../recipe-bom/recipe-bom.module';
import { DeliveryManagementModule } from '../delivery-management/delivery-management.module';
import { BossIntegrationService } from './boss-integration.service';
import { BossPilotController } from './boss-pilot.controller';

@Module({
  imports: [
    PrismaModule,
    UnifiedOrdersModule,
    RunningAccountModule,
    RecipeBOMModule,
    DeliveryManagementModule,
  ],
  controllers: [BossPilotController],
  providers: [BossIntegrationService],
  exports: [BossIntegrationService],
})
export class BossPilotModule {}

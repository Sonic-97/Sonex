import { Module } from '@nestjs/common';
import { DriverApiController } from './driver-api.controller';
import { DriverApiService } from './driver-api.service';
import { DriverApiAuthGuard } from './driver-api-auth.guard';
import { DriverDispatchModule } from '../driver-dispatch/driver-dispatch.module';
import { DriverPresenceModule } from '../driver-presence/driver-presence.module';
import { OrderOrchestratorModule } from '../order-orchestrator/order-orchestrator.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [DriverDispatchModule, DriverPresenceModule, OrderOrchestratorModule, PrismaModule],
  controllers: [DriverApiController],
  providers: [DriverApiService, DriverApiAuthGuard],
})
export class DriverApiModule {}

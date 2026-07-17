import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { AuditModule } from '../audit/audit.module';
import { InventoryPipelineModule } from '../inventory-pipeline/inventory-pipeline.module';
import { FinancialEngineService } from './financial-engine.service';

@Global()
@Module({
  imports: [
    PrismaModule,
    EventsModule,
    AuditModule,
    InventoryPipelineModule,
  ],
  providers: [FinancialEngineService],
  exports: [FinancialEngineService],
})
export class FinancialEngineModule {}

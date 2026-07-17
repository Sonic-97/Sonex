import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { FinancialModule } from '../financial/financial.module';
import { StaffPerformanceModule } from '../staff-performance/staff-performance.module';
import { DecisionEngineService } from './decision-engine.service';
import { AiDecisionsController } from './ai-decisions.controller';

@Module({
  imports: [
    PrismaModule,
    AnalyticsModule,
    FinancialModule,
    StaffPerformanceModule,
  ],
  controllers: [AiDecisionsController],
  providers: [DecisionEngineService],
  exports: [DecisionEngineService],
})
export class AiDecisionsModule {}





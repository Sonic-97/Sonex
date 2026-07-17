import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StaffPerformanceService } from './staff-performance.service';
import { StaffRankingService } from './staff-ranking.service';
import { StaffInsightService } from './staff-insight.service';
import { StaffPerformanceController } from './staff-performance.controller';

@Module({
  imports: [PrismaModule],
  controllers: [StaffPerformanceController],
  providers: [
    StaffPerformanceService,
    StaffRankingService,
    StaffInsightService,
  ],
  exports: [
    StaffPerformanceService,
    StaffRankingService,
    StaffInsightService,
  ],
})
export class StaffPerformanceModule {}





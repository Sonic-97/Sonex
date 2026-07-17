import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [AnalyticsModule, ReportsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}





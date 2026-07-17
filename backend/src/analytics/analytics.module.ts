import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { SalesAnalyticsService } from './sales-analytics.service';
import { RevenueAnalyticsService } from './revenue-analytics.service';
import { StaffAnalyticsService } from './staff-analytics.service';
import { DriverAnalyticsService } from './driver-analytics.service';
import { CustomerAnalyticsService } from './customer-analytics.service';
import { BusinessInsightsService } from './business-insights.service';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    SalesAnalyticsService,
    RevenueAnalyticsService,
    StaffAnalyticsService,
    DriverAnalyticsService,
    CustomerAnalyticsService,
    BusinessInsightsService,
  ],
  exports: [
    AnalyticsService,
    SalesAnalyticsService,
    RevenueAnalyticsService,
    StaffAnalyticsService,
    DriverAnalyticsService,
    CustomerAnalyticsService,
    BusinessInsightsService,
  ],
})
export class AnalyticsModule {}





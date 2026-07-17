import { Injectable } from '@nestjs/common';
import { AnalyticsEngineService } from '../analytics-engine/analytics-engine.service';

@Injectable()
export class RevenueAnalyticsService {
  constructor(private readonly engine: AnalyticsEngineService) {}

  async dailyRevenue(cafeId: string, days = 7) {
    return this.engine.getDailyRevenue(cafeId, days);
  }

  async weeklyRevenue(cafeId: string, weeks = 4) {
    return this.engine.getWeeklyRevenue(cafeId, weeks);
  }

  async monthlyRevenue(cafeId: string, months = 6) {
    return this.engine.getMonthlyRevenue(cafeId, months);
  }

  async hourlyRevenueDistribution(cafeId: string, from?: string, to?: string) {
    return this.engine.getHourlyRevenueDistribution(cafeId, from, to);
  }

  async peakHoursDetection(cafeId: string, from?: string, to?: string) {
    return this.engine.getPeakHoursDetection(cafeId, from, to);
  }
}

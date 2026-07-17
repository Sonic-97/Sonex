import { Injectable } from '@nestjs/common';
import { AnalyticsEngineService } from '../analytics-engine/analytics-engine.service';

@Injectable()
export class StaffAnalyticsService {
  constructor(private readonly engine: AnalyticsEngineService) {}

  async topStaffByOrders(cafeId: string, limit = 10, from?: string, to?: string) {
    return this.engine.topStaffByOrders(cafeId, limit, from, to);
  }

  async topStaffByEarnings(cafeId: string, limit = 10) {
    return this.engine.topStaffByEarnings(cafeId, limit);
  }

  async staffEfficiencyScore(cafeId: string, from?: string, to?: string) {
    return this.engine.staffEfficiencyScore(cafeId, from, to);
  }

  async underperformingStaff(cafeId: string, threshold = 3, from?: string, to?: string) {
    return this.engine.underperformingStaff(cafeId, threshold, from, to);
  }
}

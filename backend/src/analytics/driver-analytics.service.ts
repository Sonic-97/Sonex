import { Injectable } from '@nestjs/common';
import { AnalyticsEngineService } from '../analytics-engine/analytics-engine.service';

@Injectable()
export class DriverAnalyticsService {
  constructor(private readonly engine: AnalyticsEngineService) {}

  async topDriversByDeliveries(cafeId: string, limit = 10, from?: string, to?: string) {
    return this.engine.topDriversByDeliveries(cafeId, limit, from, to);
  }

  async driverEarningsRanking(cafeId: string, limit = 10) {
    return this.engine.driverEarningsRanking(cafeId, limit);
  }

  async deliverySpeedScore(cafeId: string, from?: string, to?: string) {
    return this.engine.deliverySpeedScore(cafeId, from, to);
  }

  async detectBonusEligible(cafeId: string) {
    return this.engine.detectBonusEligible(cafeId);
  }
}

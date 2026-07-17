import { Injectable } from '@nestjs/common';
import { AnalyticsEngineService } from '../analytics-engine/analytics-engine.service';

@Injectable()
export class CustomerAnalyticsService {
  constructor(private readonly engine: AnalyticsEngineService) {}

  async topCustomersBySpend(cafeId: string, limit = 10) {
    return this.engine.topCustomersBySpend(cafeId, limit);
  }

  async customerLifetimeValue(cafeId: string, limit = 10) {
    return this.engine.customerLifetimeValue(cafeId, limit);
  }

  async debtRiskCustomers(cafeId: string, minDebt = 50) {
    return this.engine.debtRiskCustomers(cafeId, minDebt);
  }

  async repeatCustomerRate(cafeId: string) {
    return this.engine.repeatCustomerRate(cafeId);
  }

  async totalCustomers(cafeId: string) {
    return this.engine.totalCustomers(cafeId);
  }
}

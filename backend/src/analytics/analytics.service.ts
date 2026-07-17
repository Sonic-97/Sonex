import { Injectable } from '@nestjs/common';
import { AnalyticsEngineService } from '../analytics-engine/analytics-engine.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly engine: AnalyticsEngineService) {}

  async getProductSales(cafeId: string, from?: string, to?: string) {
    return this.engine.getProductSales(cafeId, from, to);
  }

  async getRevenueByProduct(cafeId: string, from?: string, to?: string) {
    return this.engine.getProductSales(cafeId, from, to);
  }

  async getTopProducts(cafeId: string, limit = 10, from?: string, to?: string) {
    return this.engine.getTopProducts(cafeId, limit, from, to);
  }

  async getCategoryBreakdown(cafeId: string, from?: string, to?: string) {
    return this.engine.getCategoryBreakdown(cafeId, from, to);
  }

  async getTotalRevenue(cafeId: string, from?: string, to?: string) {
    return this.engine.getTotalRevenue(cafeId, from, to);
  }

  async getOrderCount(cafeId: string, from?: string, to?: string) {
    return this.engine.getOrderCount(cafeId, from, to);
  }

  async getAverageOrderValue(cafeId: string, from?: string, to?: string) {
    return this.engine.getAverageOrderValue(cafeId, from, to);
  }
}

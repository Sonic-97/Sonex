import { Injectable } from '@nestjs/common';
import { AnalyticsEngineService } from '../analytics-engine/analytics-engine.service';
import { FinancialEngineService } from '../financial-engine/financial-engine.service';

@Injectable()
export class SalesAnalyticsService {
  constructor(
    private readonly engine: AnalyticsEngineService,
    private readonly financialEngine: FinancialEngineService,
  ) {}

  async topProductsByRevenue(cafeId: string, limit = 10, from?: string, to?: string) {
    return this.engine.topProductsByRevenue(cafeId, limit, from, to);
  }

  async topProductsByQuantity(cafeId: string, limit = 10, from?: string, to?: string) {
    return this.engine.topProductsByQuantity(cafeId, limit, from, to);
  }

  async categoryPerformance(cafeId: string, from?: string, to?: string) {
    return this.engine.categoryPerformance(cafeId, from, to);
  }

  async productProfitabilityRanking(cafeId: string, limit = 10, from?: string, to?: string) {
    const ranking = await this.financialEngine.getProductProfitabilityRanking(cafeId, from, to);
    return ranking.products.slice(0, limit).map((p) => ({
      productId: p.productId,
      name: p.productName,
      category: '',
      quantity: p.orderCount,
      revenue: p.sellingPrice * p.orderCount,
      cost: p.estimatedCost * p.orderCount,
      profit: p.estimatedProfit * p.orderCount,
      marginPercent: p.profitMargin,
    }));
  }
}

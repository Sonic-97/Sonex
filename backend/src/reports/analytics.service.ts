import { Injectable } from '@nestjs/common';
import { AnalyticsEngineService } from '../analytics-engine/analytics-engine.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly engine: AnalyticsEngineService,
    private readonly prisma: PrismaService,
  ) {}

  async getKPIs(userId: string, dateRange = 'today', from?: string, to?: string, branchId?: string, cafeId?: string) {
    if (!cafeId) {
      const user = await this.prisma.staff.findUnique({ where: { id: userId }, select: { cafeId: true } });
      cafeId = user?.cafeId;
    }
    return this.engine.getKPIs(cafeId!, dateRange, from, to, branchId);
  }

  async getSalesTrend(groupBy = 'DAILY', dateRange = 'week', from?: string, to?: string, branchId?: string, cafeId?: string) {
    return this.engine.getSalesTrend(groupBy, dateRange, from, to, branchId, cafeId);
  }

  async getOrderDistribution(branchId?: string, cafeId?: string) {
    return this.engine.getOrderDistribution(branchId, cafeId);
  }

  async getRevenueByCategory(limit = 10, branchId?: string, cafeId?: string) {
    return this.engine.getRevenueByCategory(limit, branchId, cafeId);
  }

  async getTopProducts(limit = 10, branchId?: string, cafeId?: string) {
    if (!cafeId) return [];
    const products = await this.engine.topProductsByRevenue(cafeId, limit);
    return products.map((p) => ({
      name: p.name,
      id: p.productId,
      units_sold: p.quantity,
      revenue: p.revenue,
    }));
  }

  async getPeakHours(branchId?: string, cafeId?: string) {
    return this.engine.getPeakHours(branchId, cafeId);
  }
}

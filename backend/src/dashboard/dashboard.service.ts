import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ReportsService } from '../reports/reports.service';
import { RedisService } from '../redis/redis.service';
import { AnalyticsEngineService } from '../analytics-engine/analytics-engine.service';
import { FinancialEngineService } from '../financial-engine/financial-engine.service';

const DASHBOARD_CACHE_TTL = 120;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly reportsService: ReportsService,
    private readonly redisService: RedisService,
    private readonly engine: AnalyticsEngineService,
    private readonly financialEngine: FinancialEngineService,
  ) {}

  async getOwnerDashboard(cafeId: string) {
    const cacheKey = `owner:${cafeId}`;
    const cached = await this.redisService.getDashboardCache(cacheKey);
    if (cached) {
      this.computeOwnerDashboard(cafeId).then(result => {
        this.redisService.setDashboardCache(cacheKey, result as any, DASHBOARD_CACHE_TTL).catch(() => {});
      }).catch(() => {});
      return cached;
    }

    const result = await this.computeOwnerDashboard(cafeId);
    await this.redisService.setDashboardCache(cacheKey, result as any, DASHBOARD_CACHE_TTL);
    return result;
  }

  private async computeOwnerDashboard(cafeId: string) {
    const [snapshot, lowStockItems, attendanceSummary, dailyReport] = await Promise.all([
      this.engine.getDashboardSnapshot(cafeId),
      this.prisma.inventory.findMany({
        where: { cafeId },
        select: { id: true, itemName: true, unit: true, currentQty: true, minThreshold: true, costPerUnit: true },
      }).then((items) => items.filter((i) => Number(i.currentQty) <= Number(i.minThreshold)).slice(0, 50)),
      this.getAttendanceSummarySnapshot(cafeId),
      this.reportsService.generateDailyReport(cafeId),
    ]);

    return {
      snapshot,
      dailyReport,
      lowStockItems,
      productProfitability: null,
      attendanceSummary,
    };
  }

  async getProductProfitabilitySnapshot(cafeId: string, from?: string, to?: string) {
    const cacheKey = `profitability:${cafeId}:${from ?? ''}:${to ?? ''}`;
    const cached = await this.redisService.getDashboardCache(cacheKey);
    if (cached) return cached;

    const ranking = await this.financialEngine.getProductProfitabilityRanking(cafeId, from, to);
    const sorted = [...ranking.products].sort((a, b) => b.profitMargin - a.profitMargin);
    const result = {
      mostProfitable: sorted.slice(0, 5).map(p => ({
        productId: p.productId,
        productName: p.productName,
        sellingPrice: p.sellingPrice,
        ingredientCost: p.ingredientCost,
        laborCost: p.laborCost,
        overheadCost: p.operationalCost + p.utilityCost + p.miscellaneousCost,
        estimatedCost: p.estimatedCost,
        estimatedProfit: p.estimatedProfit,
        profitMargin: p.profitMargin,
        orderCount: p.orderCount,
      })),
      leastProfitable: sorted.filter(p => p.profitMargin < 15).slice(0, 5).map(p => ({
        productId: p.productId,
        productName: p.productName,
        sellingPrice: p.sellingPrice,
        ingredientCost: p.ingredientCost,
        laborCost: p.laborCost,
        overheadCost: p.operationalCost + p.utilityCost + p.miscellaneousCost,
        estimatedCost: p.estimatedCost,
        estimatedProfit: p.estimatedProfit,
        profitMargin: p.profitMargin,
        orderCount: p.orderCount,
      })),
      lowMarginCount: ranking.products.filter(p => p.profitMargin < 15).length,
    };
    await this.redisService.setDashboardCache(cacheKey, result as any, DASHBOARD_CACHE_TTL * 2);
    return result;
  }

  async getAttendanceSummarySnapshot(cafeId: string) {
    const cacheKey = `attendance:${cafeId}`;
    const cached = await this.redisService.getDashboardCache(cacheKey);
    if (cached) return cached;

    const result = await this.computeAttendanceSummary(cafeId);
    await this.redisService.setDashboardCache(cacheKey, result as any, DASHBOARD_CACHE_TTL * 2);
    return result;
  }

  private async computeAttendanceSummary(cafeId: string) {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const records = await this.prisma.attendance.findMany({
      where: { cafeId, date: { gte: monthStart, lte: today }, status: 'COMPLETED' },
      select: { staffId: true, totalHours: true, date: true, status: true, staff: { select: { id: true, name: true, role: true, salary: true, salaryType: true, hourlyWage: true } } },
    });

    const staffMap: Record<string, { staffId: string; name: string; role: string; days: number; hours: number; cost: number }> = {};
    for (const r of records) {
      if (!r.staff) continue;
      if (!staffMap[r.staffId]) {
        staffMap[r.staffId] = { staffId: r.staffId, name: r.staff.name, role: r.staff.role, days: 0, hours: 0, cost: 0 };
      }
      staffMap[r.staffId].days += 1;
      staffMap[r.staffId].hours += Number(r.totalHours ?? 0);
    }

    for (const sid of Object.keys(staffMap)) {
      const s = staffMap[sid];
      const staff = records.find(r => r.staffId === sid)?.staff;
      if (!staff) continue;
      if (staff.salaryType === 'DAILY') s.cost = Number(staff.salary) * s.days;
      else if (staff.salaryType === 'HOURLY') s.cost = Number(staff.hourlyWage ?? staff.salary) * s.hours;
      else s.cost = Number(staff.salary);
    }

    const staffList = Object.values(staffMap);
    const totalLaborCost = staffList.reduce((sum, s) => sum + s.cost, 0);
    const totalHours = staffList.reduce((sum, s) => sum + s.hours, 0);

    return {
      totalStaff: staffList.length,
      totalDaysWorked: staffList.reduce((s, v) => s + v.days, 0),
      totalHours,
      totalLaborCost: Math.round(totalLaborCost * 100) / 100,
      staff: staffList.sort((a, b) => b.cost - a.cost).slice(0, 10),
    };
  }

  async getSalesSummary(cafeId: string, from?: string, to?: string) {
    const [totalRevenue, orderCount, avgOrder, categoryBreakdown] = await Promise.all([
      this.analyticsService.getTotalRevenue(cafeId, from, to),
      this.analyticsService.getOrderCount(cafeId, from, to),
      this.analyticsService.getAverageOrderValue(cafeId, from, to),
      this.analyticsService.getCategoryBreakdown(cafeId, from, to),
    ]);

    return { totalRevenue, orderCount, avgOrder, categoryBreakdown };
  }

  async getPendingOrders(cafeId: string) {
    return this.prisma.unifiedOrder.findMany({
      where: { cafeId, status: { in: ['NEW', 'CONFIRMED', 'READY'] } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  async getLowStock(cafeId: string) {
    const items = await this.prisma.inventory.findMany({
      where: { cafeId },
      select: { id: true, itemName: true, unit: true, currentQty: true, minThreshold: true, costPerUnit: true },
    });
    return items.filter((i) => Number(i.currentQty) <= Number(i.minThreshold))
      .sort((a, b) => Number(a.currentQty) - Number(b.currentQty))
      .slice(0, 50);
  }
}

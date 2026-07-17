import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialEngineService } from '../financial-engine/financial-engine.service';
import {
  ProductSale, TopProduct, CategoryBreakdown,
  DailyRevenueEntry, WeeklyRevenueEntry, MonthlyRevenueEntry,
  HourlyRevenueEntry, PeakHoursResult,
  StaffPerformanceEntry, StaffEarningsEntry, StaffEfficiencyEntry, UnderperformingStaffEntry,
  DriverPerformanceEntry, DriverEarningsEntry, DeliverySpeedEntry, BonusEligibleDriverEntry,
  CustomerSpendEntry, CustomerLifetimeValueEntry, DebtRiskCustomerEntry, RetentionRateResult,
  DailySummaryResult, WeeklySummaryResult, MonthlyTrendResult,
  HealthScoreResult, AlertEntry, OverviewResult,
  KPIResult, SalesTrendEntry, OrderDistributionEntry, CategoryRevenueEntry, PeakHourEntry,
  DashboardSnapshotResult,
} from './dto/analytics-engine.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AnalyticsEngineService {
  private readonly logger = new Logger(AnalyticsEngineService.name);

  private readonly completedOrderFilter: Prisma.UnifiedOrderWhereInput = {
    paymentStatus: { notIn: ['UNPAID', 'REFUNDED'] },
    status: { notIn: ['CANCELLED', 'VOID'] },
  };

  private readonly paidOrderFilter: Prisma.UnifiedOrderWhereInput = {
    paymentStatus: 'PAID',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialEngine: FinancialEngineService,
  ) {}

  private dateFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;
    const f: Prisma.DateTimeFilter = {};
    if (from) f.gte = new Date(from);
    if (to) f.lte = new Date(to);
    return f;
  }

  private async loadOrders(
    cafeId: string,
    extraWhere?: Prisma.UnifiedOrderWhereInput,
    from?: string,
    to?: string,
    take = 5000,
  ) {
    const dateFilter = this.dateFilter(from, to);
    const where: Prisma.UnifiedOrderWhereInput = { cafeId, ...extraWhere };
    if (dateFilter) where.createdAt = dateFilter;
    return this.prisma.unifiedOrder.findMany({
      where,
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, category: true, cost: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // ── SALES ──

  async getProductSales(cafeId: string, from?: string, to?: string): Promise<ProductSale[]> {
    const orders = await this.loadOrders(cafeId, this.completedOrderFilter, from, to);
    return this.aggregateProductSales(orders);
  }

  async getTopProducts(cafeId: string, limit = 10, from?: string, to?: string): Promise<TopProduct[]> {
    const sales = await this.getProductSales(cafeId, from, to);
    return sales.sort((a, b) => b.quantity - a.quantity).slice(0, limit);
  }

  async getCategoryBreakdown(cafeId: string, from?: string, to?: string): Promise<CategoryBreakdown[]> {
    const orders = await this.loadOrders(cafeId, this.completedOrderFilter, from, to);
    const catMap = new Map<string, { quantity: number; revenue: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        const cat = item.product?.category || 'Uncategorized';
        const existing = catMap.get(cat) || { quantity: 0, revenue: 0 };
        existing.quantity += item.quantity;
        existing.revenue += Number(item.unitPrice) * item.quantity;
        catMap.set(cat, existing);
      }
    }
    return Array.from(catMap.entries()).map(([category, d]) => ({
      category,
      quantity: d.quantity,
      revenue: Math.round(d.revenue * 100) / 100,
    }));
  }

  async getTotalRevenue(cafeId: string, from?: string, to?: string): Promise<number> {
    const summary = await this.financialEngine.getSalesSummary(cafeId, from, to);
    return summary.totalRevenue;
  }

  async getOrderCount(cafeId: string, from?: string, to?: string): Promise<number> {
    const dateFilter = this.dateFilter(from, to);
    return this.prisma.unifiedOrder.count({
      where: {
        cafeId,
        ...this.completedOrderFilter,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
    });
  }

  async getAverageOrderValue(cafeId: string, from?: string, to?: string): Promise<number> {
    const dateFilter = this.dateFilter(from, to);
    const agg = await this.prisma.unifiedOrder.aggregate({
      where: {
        cafeId,
        ...this.paidOrderFilter,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      _sum: { grandTotal: true },
      _count: true,
    });
    const count = agg._count;
    const total = Number(agg._sum.grandTotal || 0);
    return count > 0 ? Math.round((total / count) * 100) / 100 : 0;
  }

  // ── REVENUE TRENDS (delegate to FinancialEngine for daily/weekly/monthly via DailyRevenue) ──

  async getDailyRevenue(cafeId: string, days = 7): Promise<DailyRevenueEntry[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);
    const daily = await this.prisma.dailyRevenue.findMany({
      where: { cafeId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });
    const filled: DailyRevenueEntry[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const match = daily.find((r) => r.date.toISOString().slice(0, 10) === dateStr);
      filled.push({
        date: dateStr,
        revenue: match ? Number(match.totalRevenue) : 0,
        profit: match ? Number(match.totalProfit) : 0,
        orders: match ? match.totalOrders : 0,
      });
    }
    return filled;
  }

  async getWeeklyRevenue(cafeId: string, weeks = 4): Promise<WeeklyRevenueEntry[]> {
    const since = new Date();
    since.setDate(since.getDate() - weeks * 7);
    since.setHours(0, 0, 0, 0);
    const daily = await this.prisma.dailyRevenue.findMany({
      where: { cafeId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });
    const weekly: Record<string, { revenue: number; profit: number; orders: number }> = {};
    for (const d of daily) {
      const dObj = new Date(d.date);
      const weekStart = new Date(dObj);
      weekStart.setDate(dObj.getDate() - dObj.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      if (!weekly[key]) weekly[key] = { revenue: 0, profit: 0, orders: 0 };
      weekly[key].revenue += Number(d.totalRevenue);
      weekly[key].profit += Number(d.totalProfit);
      weekly[key].orders += d.totalOrders;
    }
    return Object.entries(weekly).map(([weekStart, data]) => ({
      weekStart,
      revenue: Math.round(data.revenue * 100) / 100,
      profit: Math.round(data.profit * 100) / 100,
      orders: data.orders,
    }));
  }

  async getMonthlyRevenue(cafeId: string, months = 6): Promise<MonthlyRevenueEntry[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);
    const daily = await this.prisma.dailyRevenue.findMany({
      where: { cafeId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });
    const monthly: Record<string, { revenue: number; profit: number; orders: number }> = {};
    for (const d of daily) {
      const key = d.date.toISOString().slice(0, 7);
      if (!monthly[key]) monthly[key] = { revenue: 0, profit: 0, orders: 0 };
      monthly[key].revenue += Number(d.totalRevenue);
      monthly[key].profit += Number(d.totalProfit);
      monthly[key].orders += d.totalOrders;
    }
    return Object.entries(monthly).map(([month, data]) => ({
      month,
      revenue: Math.round(data.revenue * 100) / 100,
      profit: Math.round(data.profit * 100) / 100,
      orders: data.orders,
    }));
  }

  async getHourlyRevenueDistribution(cafeId: string, from?: string, to?: string): Promise<HourlyRevenueEntry[]> {
    const dateFilter = this.dateFilter(from, to);
    const orders = await this.prisma.unifiedOrder.findMany({
      where: {
        cafeId,
        ...this.paidOrderFilter,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      select: { createdAt: true, grandTotal: true },
    });
    const hourly: HourlyRevenueEntry[] = [];
    for (let i = 0; i < 24; i++) hourly.push({ hour: i, count: 0, revenue: 0 });
    for (const o of orders) {
      const h = o.createdAt.getHours();
      if (h >= 0 && h < 24) {
        hourly[h].count += 1;
        hourly[h].revenue += Number(o.grandTotal);
      }
    }
    return hourly.map((h) => ({ ...h, revenue: Math.round(h.revenue * 100) / 100 }));
  }

  async getPeakHoursDetection(cafeId: string, from?: string, to?: string): Promise<PeakHoursResult> {
    const distribution = await this.getHourlyRevenueDistribution(cafeId, from, to);
    const maxCount = Math.max(...distribution.map((d) => d.count));
    const maxRevenue = Math.max(...distribution.map((d) => d.revenue));
    return {
      peakOrderCount: distribution.filter((d) => d.count === maxCount),
      peakRevenue: distribution.filter((d) => d.revenue === maxRevenue),
      busiestHour: distribution.find((d) => d.count === maxCount)?.hour ?? -1,
      mostRevenueHour: distribution.find((d) => d.revenue === maxRevenue)?.hour ?? -1,
    };
  }

  // ── SALES ANALYTICS ──

  async topProductsByRevenue(cafeId: string, limit = 10, from?: string, to?: string): Promise<TopProduct[]> {
    const orders = await this.loadOrders(cafeId, this.paidOrderFilter, from, to);
    const sales = this.aggregateProductSales(orders);
    return sales.sort((a, b) => b.revenue - a.revenue).slice(0, limit);
  }

  async topProductsByQuantity(cafeId: string, limit = 10, from?: string, to?: string): Promise<TopProduct[]> {
    const orders = await this.loadOrders(cafeId, this.paidOrderFilter, from, to);
    const sales = this.aggregateProductSales(orders);
    return sales.sort((a, b) => b.quantity - a.quantity).slice(0, limit);
  }

  async categoryPerformance(cafeId: string, from?: string, to?: string): Promise<CategoryBreakdown[]> {
    const orders = await this.loadOrders(cafeId, this.paidOrderFilter, from, to);
    const catMap = new Map<string, { quantity: number; revenue: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        const cat = item.product?.category || 'Uncategorized';
        const existing = catMap.get(cat) || { quantity: 0, revenue: 0 };
        existing.quantity += item.quantity;
        existing.revenue += Number(item.unitPrice) * item.quantity;
        catMap.set(cat, existing);
      }
    }
    return Array.from(catMap.entries())
      .map(([category, d]) => ({ category, quantity: d.quantity, revenue: Math.round(d.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  async productProfitabilityRanking(cafeId: string, limit = 10, from?: string, to?: string) {
    return this.financialEngine.getProductProfitabilityRanking(cafeId, from, to);
  }

  // ── STAFF ──

  async topStaffByOrders(cafeId: string, limit = 10, from?: string, to?: string): Promise<StaffPerformanceEntry[]> {
    const dateFilter = this.dateFilter(from, to);
    const orders = await this.prisma.unifiedOrder.groupBy({
      by: ['employeeId'],
      where: {
        cafeId,
        ...this.completedOrderFilter,
        employeeId: { not: null },
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      _count: { id: true },
      _sum: { grandTotal: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });
    const employeeIds = orders.filter((o) => o.employeeId).map((o) => o.employeeId!);
    const staff = employeeIds.length > 0
      ? await this.prisma.staff.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true } })
      : [];
    const staffMap = new Map(staff.map((s) => [s.id, s.name]));
    return orders
      .filter((o) => o.employeeId)
      .map((o) => ({
        staffId: o.employeeId!,
        name: staffMap.get(o.employeeId!) || 'Unknown',
        orderCount: o._count.id,
        totalRevenue: Math.round(Number(o._sum.grandTotal || 0) * 100) / 100,
      }))
      .slice(0, limit);
  }

  async topStaffByEarnings(cafeId: string, limit = 10): Promise<StaffEarningsEntry[]> {
    const earnings = await this.prisma.staffEarning.findMany({
      where: { cafeId },
      orderBy: { totalEarnings: 'desc' },
      take: limit,
      include: { staff: true },
    });
    return earnings.map((e) => ({
      staffId: e.staffId,
      name: e.staff.name,
      totalOrdersHandled: e.totalOrdersHandled,
      totalEarnings: Number(e.totalEarnings),
      bonus: Number(e.bonus),
    }));
  }

  async staffEfficiencyScore(cafeId: string, from?: string, to?: string): Promise<StaffEfficiencyEntry[]> {
    const dateFilter = this.dateFilter(from, to);
    const [orderCounts, allStaff] = await Promise.all([
      this.prisma.unifiedOrder.groupBy({
        by: ['employeeId'],
        where: {
          cafeId,
          ...this.completedOrderFilter,
          employeeId: { not: null },
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
        _count: { id: true },
      }),
      this.prisma.staff.findMany({
        where: { cafeId, active: true },
        select: { id: true, name: true },
      }),
    ]);
    const countMap = new Map(orderCounts.filter((o) => o.employeeId).map((o) => [o.employeeId!, o._count.id]));
    return allStaff.map((s) => {
      const orderCount = countMap.get(s.id) || 0;
      const daysActive = orderCount > 0 ? 30 : 1;
      const score = daysActive > 0 ? Math.round((orderCount / daysActive) * 100) / 100 : 0;
      return {
        staffId: s.id,
        name: s.name,
        orderCount,
        estimatedDaysActive: daysActive,
        efficiencyScore: score,
      };
    }).sort((a, b) => b.efficiencyScore - a.efficiencyScore);
  }

  async underperformingStaff(cafeId: string, threshold = 3, from?: string, to?: string): Promise<UnderperformingStaffEntry[]> {
    const dateFilter = this.dateFilter(from, to);
    const [orderCounts, allStaff] = await Promise.all([
      this.prisma.unifiedOrder.groupBy({
        by: ['employeeId'],
        where: {
          cafeId,
          ...this.completedOrderFilter,
          employeeId: { not: null },
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
        _count: { id: true },
      }),
      this.prisma.staff.findMany({
        where: { cafeId, active: true },
        select: { id: true, name: true, role: true },
      }),
    ]);
    const countMap = new Map(orderCounts.filter((o) => o.employeeId).map((o) => [o.employeeId!, o._count.id]));
    return allStaff
      .map((s) => ({
        staffId: s.id,
        name: s.name,
        role: s.role,
        orderCount: countMap.get(s.id) || 0,
        reason: `Only ${countMap.get(s.id) || 0} orders completed (threshold: ${threshold})`,
      }))
      .filter((s) => s.orderCount < threshold);
  }

  // ── DRIVERS ──

  async topDriversByDeliveries(cafeId: string, limit = 10, from?: string, to?: string): Promise<DriverPerformanceEntry[]> {
    const dateFilter = this.dateFilter(from, to);
    const driverOrders = await this.prisma.unifiedOrder.groupBy({
      by: ['driverId'],
      where: {
        cafeId,
        ...this.completedOrderFilter,
        driverId: { not: null },
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      _count: { id: true },
      _sum: { grandTotal: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });
    const driverIds = driverOrders.filter((d) => d.driverId).map((d) => d.driverId!);
    const drivers = driverIds.length > 0
      ? await this.prisma.driver.findMany({ where: { id: { in: driverIds } } })
      : [];
    const driverMap = new Map(drivers.map((d) => [d.id, d]));
    return driverOrders
      .filter((d) => d.driverId)
      .map((d) => ({
        driverId: d.driverId!,
        name: driverMap.get(d.driverId!)?.name || 'Unknown',
        deliveries: d._count.id,
        totalRevenue: d._sum.grandTotal ? Math.round(Number(d._sum.grandTotal) * 100) / 100 : 0,
      }));
  }

  async driverEarningsRanking(cafeId: string, limit = 10): Promise<DriverEarningsEntry[]> {
    const earnings = await this.prisma.driverEarning.findMany({
      where: { cafeId },
      orderBy: { earnings: 'desc' },
      take: limit,
      include: { driver: true },
    });
    return earnings.map((e) => ({
      driverId: e.driverId,
      name: e.driver.name,
      deliveries: e.deliveries,
      earnings: Number(e.earnings),
    }));
  }

  async deliverySpeedScore(cafeId: string, from?: string, to?: string): Promise<DeliverySpeedEntry[]> {
    const dateFilter = this.dateFilter(from, to);
    const orders = await this.prisma.unifiedOrder.findMany({
      where: {
        cafeId,
        driverId: { not: null },
        deliveredAt: { not: null },
        ...this.completedOrderFilter,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      select: { driverId: true, createdAt: true, deliveredAt: true },
      take: 5000,
    });
    const driverStats = new Map<string, { totalMinutes: number; count: number }>();
    for (const o of orders) {
      if (!o.driverId || !o.deliveredAt) continue;
      const minutes = (o.deliveredAt.getTime() - o.createdAt.getTime()) / 60000;
      const existing = driverStats.get(o.driverId) || { totalMinutes: 0, count: 0 };
      existing.totalMinutes += minutes;
      existing.count += 1;
      driverStats.set(o.driverId, existing);
    }
    const driverIds = Array.from(driverStats.keys());
    const drivers = driverIds.length > 0
      ? await this.prisma.driver.findMany({ where: { id: { in: driverIds } }, select: { id: true, name: true } })
      : [];
    const driverMap = new Map(drivers.map((d) => [d.id, d.name]));
    return Array.from(driverStats.entries())
      .map(([driverId, stats]) => {
        const avgMinutes = stats.count > 0 ? stats.totalMinutes / stats.count : 0;
        return {
          driverId,
          name: driverMap.get(driverId) || 'Unknown',
          avgDeliveryMinutes: Math.round(avgMinutes * 100) / 100,
          totalDeliveries: stats.count,
          speedScore: Math.max(0, Math.min(100, Math.round(100 - avgMinutes / 1.5))),
        };
      })
      .sort((a, b) => b.speedScore - a.speedScore);
  }

  async detectBonusEligible(cafeId: string): Promise<BonusEligibleDriverEntry[]> {
    const drivers = await this.prisma.driver.findMany({
      where: { cafeId, active: true },
    });
    return drivers.map((d) => ({
      driverId: d.id,
      name: d.name,
      totalDeliveries: d.totalDeliveries,
      totalRevenue: Number(d.totalRevenue),
      newCustomersAcquired: d.newCustomersAcquired,
      isBonusEligible: d.totalDeliveries >= 50 || Number(d.totalRevenue) >= 1000,
    }));
  }

  // ── CUSTOMERS ──

  async topCustomersBySpend(cafeId: string, limit = 10): Promise<CustomerSpendEntry[]> {
    const customers = await this.prisma.customer.findMany({
      where: { cafeId },
      orderBy: { totalSpent: 'desc' },
      take: limit,
      select: { id: true, name: true, phone: true, totalOrders: true, totalSpent: true, unpaidBalance: true, lastOrderDate: true },
    });
    return customers.map((c) => ({
      ...c,
      totalSpent: Number(c.totalSpent),
      unpaidBalance: Number(c.unpaidBalance),
    })) as any;
  }

  async customerLifetimeValue(cafeId: string, limit = 10): Promise<CustomerLifetimeValueEntry[]> {
    const customers = await this.prisma.customer.findMany({
      where: { cafeId, totalOrders: { gt: 0 } },
      orderBy: { totalSpent: 'desc' },
      take: limit,
      select: { id: true, name: true, phone: true, totalOrders: true, totalSpent: true, lastOrderDate: true },
    });
    return customers.map((c) => {
      const totalSpent = Number(c.totalSpent);
      return {
        id: c.id,
        name: c.name || c.phone,
        phone: c.phone,
        totalOrders: c.totalOrders,
        totalSpent,
        avgOrderValue: c.totalOrders > 0 ? Math.round((totalSpent / c.totalOrders) * 100) / 100 : 0,
        clv: totalSpent,
      };
    });
  }

  async debtRiskCustomers(cafeId: string, minDebt = 50): Promise<DebtRiskCustomerEntry[]> {
    const customers = await this.prisma.customer.findMany({
      where: { cafeId, unpaidBalance: { gte: minDebt } },
      orderBy: { unpaidBalance: 'desc' },
      select: {
        id: true, name: true, phone: true, totalOrders: true, totalSpent: true, unpaidBalance: true,
        debts: {
          where: { settled: false },
          select: { id: true, amount: true, reason: true, createdAt: true },
        },
      },
    });
    return customers.map((c) => ({
      ...c,
      totalSpent: Number(c.totalSpent),
      unpaidBalance: Number(c.unpaidBalance),
      debts: c.debts.map((d) => ({ ...d, amount: Number(d.amount) })),
    })) as any;
  }

  async repeatCustomerRate(cafeId: string): Promise<RetentionRateResult> {
    const [totalCustomers, repeatCustomers] = await Promise.all([
      this.prisma.customer.count({ where: { cafeId } }),
      this.prisma.customer.count({ where: { cafeId, totalOrders: { gt: 1 } } }),
    ]);
    return {
      totalCustomers,
      repeatCustomers,
      retentionRate: totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 10000) / 100 : 0,
    };
  }

  async totalCustomers(cafeId: string): Promise<number> {
    return this.prisma.customer.count({ where: { cafeId } });
  }

  // ── BUSINESS INSIGHTS ──

  async generateDailySummary(cafeId: string): Promise<DailySummaryResult> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const from = todayStart.toISOString();
    const to = todayEnd.toISOString();

    const [topProducts, revenue, hourly, topStaff, underStaff, topDrivers, customerRate, debtRisk] = await Promise.all([
      this.topProductsByRevenue(cafeId, 5, from, to),
      this.getDailyRevenue(cafeId, 1),
      this.getHourlyRevenueDistribution(cafeId, from, to),
      this.topStaffByOrders(cafeId, 3, from, to),
      this.underperformingStaff(cafeId, 2, from, to),
      this.topDriversByDeliveries(cafeId, 3, from, to),
      this.repeatCustomerRate(cafeId),
      this.debtRiskCustomers(cafeId, 100),
    ]);

    const todayRev = revenue[0]?.revenue ?? 0;
    const todayOrders = revenue[0]?.orders ?? 0;
    const peakHour = hourly.reduce((max, h) => (h.count > max.count ? h : max), hourly[0]);

    return {
      date: todayStart.toISOString().slice(0, 10),
      summary: `Today: $${todayRev.toFixed(2)} revenue from ${todayOrders} orders. Best hour: ${peakHour.hour}:00 (${peakHour.count} orders).`,
      revenue: todayRev,
      orders: todayOrders,
      peakHour: peakHour.hour,
      peakHourOrders: peakHour.count,
      topProduct: topProducts[0]?.name ?? 'None',
      topProductRevenue: topProducts[0]?.revenue ?? 0,
      topStaffMember: topStaff[0]?.name ?? 'None',
      topStaffOrders: topStaff[0]?.orderCount ?? 0,
      underperformingStaff: underStaff.map((s) => ({ name: s.name, orders: s.orderCount })),
      topDriver: topDrivers[0]?.name ?? 'None',
      topDriverDeliveries: topDrivers[0]?.deliveries ?? 0,
      customerRetentionRate: customerRate.retentionRate,
      highDebtCustomers: debtRisk.length,
    };
  }

  async generateWeeklySummary(cafeId: string): Promise<WeeklySummaryResult> {
    const weeklyRevenue = await this.getWeeklyRevenue(cafeId, 2);
    const weekOverWeek = weeklyRevenue.length >= 2
      ? {
          current: weeklyRevenue[weeklyRevenue.length - 1],
          previous: weeklyRevenue[weeklyRevenue.length - 2],
          change: weeklyRevenue[weeklyRevenue.length - 2].revenue > 0
            ? Math.round(((weeklyRevenue[weeklyRevenue.length - 1].revenue - weeklyRevenue[weeklyRevenue.length - 2].revenue) / weeklyRevenue[weeklyRevenue.length - 2].revenue) * 10000) / 100
            : 0,
        }
      : null;

    const currentWeek = weeklyRevenue[weeklyRevenue.length - 1];
    return {
      weekEnding: new Date().toISOString().slice(0, 10),
      totalRevenue: currentWeek?.revenue ?? 0,
      totalProfit: currentWeek?.profit ?? 0,
      totalOrders: currentWeek?.orders ?? 0,
      weekOverWeek,
      trend: weekOverWeek
        ? weekOverWeek.change >= 0
          ? `Revenue ${weekOverWeek.change >= 5 ? 'growing' : 'stable'} (${weekOverWeek.change > 0 ? '+' : ''}${weekOverWeek.change}%)`
          : `Revenue declining (${weekOverWeek.change}%)`
        : 'Insufficient data',
    };
  }

  async generateMonthlyTrendReport(cafeId: string): Promise<MonthlyTrendResult> {
    const monthly = await this.getMonthlyRevenue(cafeId, 6);
    const growth = monthly.length >= 2
      ? Math.round(((monthly[monthly.length - 1].revenue - monthly[0].revenue) / monthly[0].revenue) * 10000) / 100
      : 0;
    return {
      months: monthly,
      totalRevenue6Months: monthly.reduce((s, m) => s + m.revenue, 0),
      totalProfit6Months: monthly.reduce((s, m) => s + m.profit, 0),
      growthRate: growth,
      trend: growth > 10 ? 'strong_growth' : growth > 0 ? 'moderate_growth' : growth > -10 ? 'stable' : 'declining',
    };
  }

  async businessHealthScore(cafeId: string): Promise<HealthScoreResult> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [daily, weeklyRevenue, customerRate, staffWithEarnings, totalDebt, totalSpent] = await Promise.all([
      this.prisma.dailyRevenue.findFirst({ where: { cafeId, date: todayStart } }),
      this.getWeeklyRevenue(cafeId, 4),
      this.repeatCustomerRate(cafeId),
      this.prisma.staffEarning.count({ where: { cafeId } }),
      this.prisma.debt.aggregate({ where: { cafeId, settled: false }, _sum: { amount: true } }),
      this.prisma.customer.aggregate({ where: { cafeId }, _sum: { totalSpent: true } }),
    ]);

    const allStaffCount = await this.prisma.staff.count({ where: { cafeId, active: true } });

    let revenueStability = 50;
    if (weeklyRevenue.length >= 2) {
      const w1 = weeklyRevenue[weeklyRevenue.length - 1]?.revenue ?? 0;
      const w2 = weeklyRevenue[weeklyRevenue.length - 2]?.revenue ?? 0;
      if (w2 > 0) {
        const change = Math.abs((w1 - w2) / w2);
        revenueStability = Math.max(0, Math.min(100, Math.round((1 - change) * 100)));
      }
    }

    const todayRev = daily ? Number(daily.totalRevenue) : 0;
    const todayProfit = daily ? Number(daily.totalProfit) : 0;
    const profitMargin = todayRev > 0 ? Math.min(100, Math.round((todayProfit / todayRev) * 100)) : 50;

    const retention = customerRate.retentionRate;
    const staffScore = allStaffCount > 0 ? Math.min(100, Math.round((staffWithEarnings / allStaffCount) * 100)) : 50;
    const totalDebtAmount = Number(totalDebt._sum?.amount || 0);
    const totalSpentAmount = Number(totalSpent._sum?.totalSpent || 1);
    const debtRatio = Math.min(100, Math.round((totalDebtAmount / totalSpentAmount) * 100));

    const score = Math.max(0, Math.min(100,
      Math.round(revenueStability * 0.25 + profitMargin * 0.25 + retention * 0.20 + staffScore * 0.20 - debtRatio * 0.10),
    ));

    return {
      score,
      level: score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : score >= 20 ? 'poor' : 'critical',
      components: { revenueStability, profitMargin, customerRetention: retention, staffPerformance: staffScore, debtRatio },
    };
  }

  async detectAlerts(cafeId: string): Promise<AlertEntry[]> {
    const alerts: AlertEntry[] = [];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const from = todayStart.toISOString();
    const to = todayEnd.toISOString();

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayEnd);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

    const [todayDaily, yesterdayDaily] = await Promise.all([
      this.prisma.dailyRevenue.findFirst({ where: { cafeId, date: todayStart } }),
      this.prisma.dailyRevenue.findFirst({ where: { cafeId, date: yesterdayStart } }),
    ]);

    const todayRev = todayDaily ? Number(todayDaily.totalRevenue) : 0;
    const yesterdayRev = yesterdayDaily ? Number(yesterdayDaily.totalRevenue) : 0;

    if (yesterdayRev > 0 && todayRev < yesterdayRev * 0.5) {
      alerts.push({
        type: 'REVENUE_DROP',
        severity: 'high',
        message: `Revenue dropped ${Math.round((1 - todayRev / yesterdayRev) * 100)}% compared to yesterday`,
      });
    }

    const underStaff = await this.underperformingStaff(cafeId, 2, from, to);
    if (underStaff.length > 0) {
      alerts.push({
        type: 'STAFF_UNDERPERFORMANCE',
        severity: 'medium',
        message: `${underStaff.length} staff member(s) have completed fewer than 2 orders today`,
      });
    }

    const lastWeekStart = new Date(todayStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(todayEnd);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

    const [thisWeekProducts, lastWeekProducts] = await Promise.all([
      this.topProductsByQuantity(cafeId, 5, from, to),
      this.topProductsByQuantity(cafeId, 5, lastWeekStart.toISOString(), lastWeekEnd.toISOString()),
    ]);

    if (thisWeekProducts.length > 0 && lastWeekProducts.length > 0) {
      for (const tp of thisWeekProducts) {
        const lp = lastWeekProducts.find((p) => p.productId === tp.productId);
        if (lp && tp.quantity < lp.quantity * 0.5) {
          alerts.push({
            type: 'PRODUCT_POPULARITY_DROP',
            severity: 'medium',
            message: `"${tp.name}" sales dropped ${Math.round((1 - tp.quantity / lp.quantity) * 100)}% compared to last week`,
          });
        }
      }
    }

    const totalDebt = await this.prisma.debt.aggregate({
      where: { cafeId, settled: false },
      _sum: { amount: true },
    });
    const debtAmount = Number(totalDebt._sum?.amount || 0);
    if (debtAmount > 500) {
      alerts.push({
        type: 'HIGH_DEBT',
        severity: 'high',
        message: `Total unsettled debt is $${debtAmount.toFixed(2)} — exceeds $500 threshold`,
      });
    }

    return alerts;
  }

  async getOverview(cafeId: string): Promise<OverviewResult> {
    const [daily, health, alerts, weekly] = await Promise.all([
      this.generateDailySummary(cafeId),
      this.businessHealthScore(cafeId),
      this.detectAlerts(cafeId),
      this.generateWeeklySummary(cafeId),
    ]);
    return { daily, health, alerts, weekly };
  }

  // ── REPORTS ──

  async getKPIs(cafeId: string, dateRange = 'today', from?: string, to?: string, branchId?: string): Promise<KPIResult> {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (dateRange) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - startDate.getDay());
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'custom':
        startDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = to ? new Date(to) : now;
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    const prevStart = new Date(startDate);
    const rangeMs = endDate.getTime() - startDate.getTime();
    prevStart.setTime(prevStart.getTime() - rangeMs);

    const baseWhere: Prisma.UnifiedOrderWhereInput = { cafeId };
    if (branchId) baseWhere.branchId = branchId;

    const [currentOrders, prevOrders, currentRevenue, prevRevenue, pendingOrders, activeOrders] = await Promise.all([
      this.prisma.unifiedOrder.count({ where: { ...baseWhere, createdAt: { gte: startDate, lte: endDate }, status: { not: 'CANCELLED' } } }),
      this.prisma.unifiedOrder.count({ where: { ...baseWhere, createdAt: { gte: prevStart, lte: startDate }, status: { not: 'CANCELLED' } } }),
      this.prisma.unifiedOrder.aggregate({ where: { ...baseWhere, createdAt: { gte: startDate, lte: endDate }, paymentStatus: 'PAID' }, _sum: { grandTotal: true } }),
      this.prisma.unifiedOrder.aggregate({ where: { ...baseWhere, createdAt: { gte: prevStart, lte: startDate }, paymentStatus: 'PAID' }, _sum: { grandTotal: true } }),
      this.prisma.unifiedOrder.count({ where: { ...baseWhere, paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] } } }),
      this.prisma.unifiedOrder.count({ where: { ...baseWhere, status: { in: ['NEW', 'CONFIRMED', 'READY', 'PICKED_UP'] } } }),
    ]);

    const revenue = Number(currentRevenue._sum.grandTotal || 0);
    const prevRevenueVal = Number(prevRevenue._sum.grandTotal || 0);
    const weeklyTrend = prevRevenueVal > 0 ? ((revenue - prevRevenueVal) / prevRevenueVal) * 100 : 0;
    const monthlyGrowth = prevRevenueVal > 0 ? ((revenue - prevRevenueVal) / prevRevenueVal) * 100 : 0;

    let lowStock = 0;
    try {
      const allItems = await this.prisma.inventory.findMany({
        where: { cafeId, ...(branchId ? { branchId } : {}) },
        select: { currentQty: true, minThreshold: true },
      });
      lowStock = allItems.filter((i) => Number(i.currentQty) <= Number(i.minThreshold)).length;
    } catch { /* use default 0 */ }

    return {
      todayRevenue: Math.round(revenue * 100) / 100,
      weeklyTrend: Math.round(weeklyTrend * 100) / 100,
      monthlyGrowth: Math.round(monthlyGrowth * 100) / 100,
      pendingPayments: pendingOrders,
      activeOrders,
      lowStockItems: lowStock,
      currentOrders,
      previousOrders: prevOrders,
    };
  }

  async getSalesTrend(
    groupBy = 'DAILY', dateRange = 'week', from?: string, to?: string, branchId?: string, cafeId?: string,
  ): Promise<SalesTrendEntry[]> {
    const now = new Date();
    let startDate: Date;
    const endDate: Date = to ? new Date(to) : now;
    switch (dateRange) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - startDate.getDay());
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const orders = await this.prisma.unifiedOrder.findMany({
      where: {
        cafeId,
        ...(branchId ? { branchId } : {}),
        paymentStatus: 'PAID',
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { createdAt: true, grandTotal: true },
      orderBy: { createdAt: 'asc' },
    });

    const periodMap = new Map<string, { revenue: number; orders: number }>();
    for (const o of orders) {
      let key: string;
      if (groupBy === 'WEEKLY') {
        const d = new Date(o.createdAt);
        d.setDate(d.getDate() - d.getDay());
        key = d.toISOString().slice(0, 10);
      } else if (groupBy === 'MONTHLY') {
        key = o.createdAt.toISOString().slice(0, 7);
      } else {
        key = o.createdAt.toISOString().slice(0, 10);
      }
      const existing = periodMap.get(key) || { revenue: 0, orders: 0 };
      existing.revenue += Number(o.grandTotal);
      existing.orders += 1;
      periodMap.set(key, existing);
    }

    return Array.from(periodMap.entries())
      .map(([period, d]) => ({
        period: new Date(period),
        revenue: Math.round(d.revenue * 100) / 100,
        orders: d.orders,
      }))
      .sort((a, b) => a.period.getTime() - b.period.getTime());
  }

  async getOrderDistribution(branchId?: string, cafeId?: string): Promise<OrderDistributionEntry[]> {
    const where: Prisma.UnifiedOrderWhereInput = {};
    if (cafeId) where.cafeId = cafeId;
    if (branchId) where.branchId = branchId;
    const statuses = ['NEW', 'CONFIRMED', 'READY', 'PICKED_UP', 'DELIVERED', 'CLOSED', 'CANCELLED'];
    const results = await Promise.all(
      statuses.map(async (status) => {
        const count = await this.prisma.unifiedOrder.count({ where: { ...where, status } });
        return { status, count };
      }),
    );
    return results.filter((r) => r.count > 0);
  }

  async getRevenueByCategory(limit = 10, branchId?: string, cafeId?: string): Promise<CategoryRevenueEntry[]> {
    const where: Prisma.UnifiedOrderWhereInput = { paymentStatus: 'PAID' };
    if (cafeId) where.cafeId = cafeId;
    if (branchId) where.branchId = branchId;
    const orders = await this.prisma.unifiedOrder.findMany({
      where,
      include: {
        items: {
          include: { product: { select: { id: true, name: true, category: true } } },
        },
      },
      take: 5000,
    });
    const catMap = new Map<string, { revenue: number; orders: Set<string> }>();
    for (const order of orders) {
      for (const item of order.items) {
        const cat = item.product?.category || 'Uncategorized';
        const existing = catMap.get(cat) || { revenue: 0, orders: new Set<string>() };
        existing.revenue += Number(item.unitPrice) * item.quantity;
        existing.orders.add(order.id);
        catMap.set(cat, existing);
      }
    }
    return Array.from(catMap.entries())
      .map(([category, d]) => ({ category, revenue: Math.round(d.revenue * 100) / 100, orders: d.orders.size }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit) as any;
  }

  async getPeakHours(branchId?: string, cafeId?: string): Promise<PeakHourEntry[]> {
    const where: Prisma.UnifiedOrderWhereInput = {};
    if (cafeId) where.cafeId = cafeId;
    if (branchId) where.branchId = branchId;
    const orders = await this.prisma.unifiedOrder.findMany({
      where,
      select: { createdAt: true },
    });
    const hourMap = new Map<string, number>();
    for (const o of orders) {
      const day = o.createdAt.getDay();
      const hour = o.createdAt.getHours();
      const key = `${day}:${hour}`;
      hourMap.set(key, (hourMap.get(key) || 0) + 1);
    }
    return Array.from(hourMap.entries()).map(([key, count]) => {
      const [day_of_week, hour] = key.split(':').map(Number);
      return { day_of_week, hour, order_count: count };
    }).sort((a, b) => a.day_of_week - b.day_of_week || a.hour - b.hour);
  }

  // ── DASHBOARD ──

  async getDashboardSnapshot(cafeId: string): Promise<DashboardSnapshotResult> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [agg, pendingOrders, activeDrivers, totalCustomers, totalProducts] = await Promise.all([
      this.prisma.unifiedOrder.aggregate({
        where: { cafeId, createdAt: { gte: todayStart, lte: todayEnd }, paymentStatus: 'PAID' },
        _sum: { grandTotal: true },
        _count: true,
      }),
      this.prisma.unifiedOrder.count({
        where: { cafeId, status: { in: ['NEW', 'CONFIRMED', 'READY'] } },
      }),
      this.prisma.driver.count({ where: { cafeId, active: true } }),
      this.prisma.customer.count({ where: { cafeId } }),
      this.prisma.product.count({ where: { cafeId, active: true } }),
    ]);

    return {
      todayRevenue: Math.round(Number(agg._sum.grandTotal || 0) * 100) / 100,
      todayOrders: agg._count,
      pendingOrders,
      lowStockItems: 0,
      activeDrivers,
      totalCustomers,
      totalProducts,
    };
  }

  // ── HELPERS ──

  private aggregateProductSales(orders: any[]): ProductSale[] {
    const productMap = new Map<string, { name: string; category: string; quantity: number; revenue: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        const prod = item.product;
        if (!prod) continue;
        const existing = productMap.get(prod.id) || { name: prod.name, category: prod.category || 'Uncategorized', quantity: 0, revenue: 0 };
        existing.quantity += item.quantity;
        existing.revenue += Number(item.unitPrice) * item.quantity;
        productMap.set(prod.id, existing);
      }
    }
    return Array.from(productMap.entries()).map(([productId, data]) => ({
      productId,
      name: data.name,
      category: data.category,
      quantity: data.quantity,
      revenue: Math.round(data.revenue * 100) / 100,
    }));
  }
}

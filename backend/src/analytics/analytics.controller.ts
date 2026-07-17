import { Controller, Get, Query } from '@nestjs/common';
import { SalesAnalyticsService } from './sales-analytics.service';
import { RevenueAnalyticsService } from './revenue-analytics.service';
import { StaffAnalyticsService } from './staff-analytics.service';
import { DriverAnalyticsService } from './driver-analytics.service';
import { CustomerAnalyticsService } from './customer-analytics.service';
import { BusinessInsightsService } from './business-insights.service';
import { cafeId } from '../auth/decorators';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly salesAnalytics: SalesAnalyticsService,
    private readonly revenueAnalytics: RevenueAnalyticsService,
    private readonly staffAnalytics: StaffAnalyticsService,
    private readonly driverAnalytics: DriverAnalyticsService,
    private readonly customerAnalytics: CustomerAnalyticsService,
    private readonly businessInsights: BusinessInsightsService,
  ) {}

  @Get('overview')
  async getOverview(@cafeId() cafeId?: string) {
    return this.businessInsights.getOverview(cafeId || '');
  }

  // ── SALES ──

  @Get('sales/top-products')
  async getTopProducts(
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.salesAnalytics.topProductsByRevenue(
      cafeId || '',
      limit ? parseInt(limit, 10) : 10,
      from,
      to,
    );
  }

  @Get('sales/top-quantity')
  async getTopByQuantity(
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.salesAnalytics.topProductsByQuantity(
      cafeId || '',
      limit ? parseInt(limit, 10) : 10,
      from,
      to,
    );
  }

  @Get('sales/category-performance')
  async getCategoryPerformance(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.salesAnalytics.categoryPerformance(cafeId || '', from, to);
  }

  @Get('sales/product-profitability')
  async getProductProfitability(
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.salesAnalytics.productProfitabilityRanking(
      cafeId || '',
      limit ? parseInt(limit, 10) : 10,
      from,
      to,
    );
  }

  // ── REVENUE ──

  @Get('revenue/summary')
  async getRevenueSummary(@cafeId() cafeId?: string) {
    const cid = cafeId || '';
    const [daily, weekly, monthly, hourly, peaks] = await Promise.all([
      this.revenueAnalytics.dailyRevenue(cid, 7),
      this.revenueAnalytics.weeklyRevenue(cid, 4),
      this.revenueAnalytics.monthlyRevenue(cid, 6),
      this.revenueAnalytics.hourlyRevenueDistribution(cid),
      this.revenueAnalytics.peakHoursDetection(cid),
    ]);

    return { daily, weekly, monthly, hourly, peaks };
  }

  @Get('revenue/daily')
  async getDailyRevenue(@Query('days') days?: string, @cafeId() cafeId?: string) {
    return this.revenueAnalytics.dailyRevenue(cafeId || '', days ? parseInt(days, 10) : 7);
  }

  @Get('revenue/hourly')
  async getHourlyRevenue(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.revenueAnalytics.hourlyRevenueDistribution(cafeId || '', from, to);
  }

  @Get('revenue/peaks')
  async getPeakHours(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.revenueAnalytics.peakHoursDetection(cafeId || '', from, to);
  }

  // ── STAFF ──

  @Get('staff/performance')
  async getStaffPerformance(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @cafeId() cafeId?: string,
  ) {
    const cid = cafeId || '';
    const [topOrders, topEarnings, efficiency, underperforming] = await Promise.all([
      this.staffAnalytics.topStaffByOrders(cid, 10, from, to),
      this.staffAnalytics.topStaffByEarnings(cid, 10),
      this.staffAnalytics.staffEfficiencyScore(cid, from, to),
      this.staffAnalytics.underperformingStaff(cid, 3, from, to),
    ]);

    return { topOrders, topEarnings, efficiency, underperforming };
  }

  @Get('staff/top-orders')
  async getTopStaffByOrders(
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.staffAnalytics.topStaffByOrders(
      cafeId || '',
      limit ? parseInt(limit, 10) : 10,
      from,
      to,
    );
  }

  @Get('staff/underperforming')
  async getUnderperformingStaff(
    @Query('threshold') threshold?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.staffAnalytics.underperformingStaff(
      cafeId || '',
      threshold ? parseInt(threshold, 10) : 3,
      from,
      to,
    );
  }

  // ── DRIVERS ──

  @Get('drivers/performance')
  async getDriverPerformance(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @cafeId() cafeId?: string,
  ) {
    const cid = cafeId || '';
    const [topDeliveries, earnings, speed, bonus] = await Promise.all([
      this.driverAnalytics.topDriversByDeliveries(cid, 10, from, to),
      this.driverAnalytics.driverEarningsRanking(cid, 10),
      this.driverAnalytics.deliverySpeedScore(cid, from, to),
      this.driverAnalytics.detectBonusEligible(cid),
    ]);

    return { topDeliveries, earnings, speed, bonusEligible: bonus };
  }

  // ── CUSTOMERS ──

  @Get('customers/insights')
  async getCustomerInsights(@cafeId() cafeId?: string) {
    const cid = cafeId || '';
    const [topSpenders, clv, debtRisk, retention] = await Promise.all([
      this.customerAnalytics.topCustomersBySpend(cid, 10),
      this.customerAnalytics.customerLifetimeValue(cid, 10),
      this.customerAnalytics.debtRiskCustomers(cid, 50),
      this.customerAnalytics.repeatCustomerRate(cid),
    ]);

    return { topSpenders, clv, debtRisk, retention };
  }

  // ── BUSINESS ──

  @Get('business/report/daily')
  async getDailyReport(@cafeId() cafeId?: string) {
    return this.businessInsights.generateDailySummary(cafeId || '');
  }

  @Get('business/report/weekly')
  async getWeeklyReport(@cafeId() cafeId?: string) {
    return this.businessInsights.generateWeeklySummary(cafeId || '');
  }

  @Get('business/report/monthly')
  async getMonthlyReport(@cafeId() cafeId?: string) {
    return this.businessInsights.generateMonthlyTrendReport(cafeId || '');
  }

  @Get('business/health-score')
  async getHealthScore(@cafeId() cafeId?: string) {
    return this.businessInsights.businessHealthScore(cafeId || '');
  }

  @Get('business/alerts')
  async getAlerts(@cafeId() cafeId?: string) {
    return this.businessInsights.detectAlerts(cafeId || '');
  }
}





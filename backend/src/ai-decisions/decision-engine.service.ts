import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { BusinessInsightsService } from '../analytics/business-insights.service';
import { SalesAnalyticsService } from '../analytics/sales-analytics.service';
import { RevenueAnalyticsService } from '../analytics/revenue-analytics.service';
import { StaffAnalyticsService } from '../analytics/staff-analytics.service';
import { CustomerAnalyticsService } from '../analytics/customer-analytics.service';
import { StaffPerformanceService } from '../staff-performance/staff-performance.service';
import { DriverAnalyticsService } from '../analytics/driver-analytics.service';
import { FinancialService } from '../financial/financial.service';

export interface Decision {
  type: 'REVENUE' | 'STAFF' | 'PRODUCT' | 'CUSTOMER' | 'OPERATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  title: string;
  explanation: string;
  dataSource: string[];
  suggestedAction: string;
  expectedImpact: string;
  confidence: number;
}

@Injectable()
export class DecisionEngineService {
  private readonly logger = new Logger(DecisionEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly insightsService: BusinessInsightsService,
    private readonly salesAnalytics: SalesAnalyticsService,
    private readonly revenueAnalytics: RevenueAnalyticsService,
    private readonly staffAnalytics: StaffAnalyticsService,
    private readonly customerAnalytics: CustomerAnalyticsService,
    private readonly staffPerformance: StaffPerformanceService,
    private readonly driverAnalytics: DriverAnalyticsService,
    private readonly financialService: FinancialService,
  ) {}

  async generateDailyDecisions(cafeId: string): Promise<Decision[]> {
    const [
      revenue,
      staff,
      products,
      customers,
      operational,
    ] = await Promise.all([
      this.analyzeRevenueOpportunities(cafeId),
      this.analyzeStaffOptimization(cafeId),
      this.analyzeProductStrategy(cafeId),
      this.analyzeCustomerStrategy(cafeId),
      this.analyzeOperational(cafeId),
    ]);

    const all = [...revenue, ...staff, ...products, ...customers, ...operational]
      .sort((a, b) => {
        const sev = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        return (sev[b.severity] - sev[a.severity]) * 100 + Math.round((b.confidence - a.confidence) * 100);
      });

    const highPriority = all.filter((d) => d.severity === 'HIGH');

    for (const d of all) {
      this.eventsService.emitToOwner('decision.generated', {
        ...d,
        generatedAt: new Date().toISOString(),
      });
    }

    for (const d of highPriority) {
      this.eventsService.emitToOwner('decision.high_priority', {
        ...d,
        generatedAt: new Date().toISOString(),
      });
    }

    this.eventsService.emitToOwner('decision.alert', {
      count: highPriority.length,
      highestSeverity: highPriority.length > 0 ? 'HIGH' : 'NONE',
      generatedAt: new Date().toISOString(),
    });

    return all;
  }

  async generateWeeklyStrategy(cafeId: string): Promise<Decision[]> {
    const decisions: Decision[] = [];
    const weekly = await this.revenueAnalytics.weeklyRevenue(cafeId, 4);

    if (weekly.length >= 2) {
      const current = weekly[weekly.length - 1];
      const previous = weekly[weekly.length - 2];
      const change = previous.revenue > 0
        ? ((current.revenue - previous.revenue) / previous.revenue) * 100
        : 0;

      if (change < -10) {
        decisions.push({
          type: 'REVENUE',
          severity: 'HIGH',
          title: 'Weekly revenue declining sharply',
          explanation: `Revenue dropped ${Math.abs(change).toFixed(1)}% week-over-week`,
          dataSource: ['RevenueAnalyticsService.weeklyRevenue'],
          suggestedAction: 'Review last week\'s orders, identify which days/hours dropped most, launch a promotion campaign',
          expectedImpact: 'Reverse revenue decline — target 10-15% recovery within 1 week',
          confidence: 0.85,
        });
      } else if (change > 15) {
        decisions.push({
          type: 'REVENUE',
          severity: 'LOW',
          title: 'Strong weekly growth detected',
          explanation: `Revenue grew ${change.toFixed(1)}% week-over-week`,
          dataSource: ['RevenueAnalyticsService.weeklyRevenue'],
          suggestedAction: 'Analyze what drove the growth and replicate — check which products/hours/staff performed best',
          expectedImpact: 'Sustain and amplify growth trend',
          confidence: 0.80,
        });
      }

      const avgProfitMargin = current.revenue > 0
        ? (current.profit / current.revenue) * 100
        : 0;
      if (avgProfitMargin < 25) {
        decisions.push({
          type: 'REVENUE',
          severity: 'MEDIUM',
          title: 'Profit margin below 25% threshold',
          explanation: `Weekly profit margin is ${avgProfitMargin.toFixed(1)}%`,
          dataSource: ['RevenueAnalyticsService.weeklyRevenue'],
          suggestedAction: 'Review cost of goods sold, identify low-margin items, consider supplier renegotiation or price adjustments',
          expectedImpact: 'Increase profit margin to 30%+ — worth estimated $X per week',
          confidence: 0.75,
        });
      }
    }

    return decisions;
  }

  async analyzeRevenueOpportunities(cafeId: string): Promise<Decision[]> {
    const decisions: Decision[] = [];
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 14);
    const fromStr = from.toISOString();
    const toStr = today.toISOString();

    const [profitRanking, daily] = await Promise.all([
      this.salesAnalytics.productProfitabilityRanking(cafeId, 50, fromStr, toStr),
      this.revenueAnalytics.dailyRevenue(cafeId, 14),
    ]);

    const lowMarginHighVolume = profitRanking
      .filter((p) => p.marginPercent < 30 && p.quantity > 2)
      .slice(0, 3);

    for (const product of lowMarginHighVolume) {
      const suggestedPrice = Math.round(product.revenue / product.quantity * 1.15 * 4) / 4;
      decisions.push({
        type: 'REVENUE',
        severity: 'MEDIUM',
        title: `"${product.name}" margin is low at ${product.marginPercent}% despite high volume`,
        explanation: `Sold ${product.quantity}x generating $${product.revenue.toFixed(2)} revenue but margin is only ${product.marginPercent}%`,
        dataSource: ['SalesAnalyticsService.productProfitabilityRanking'],
        suggestedAction: `Consider raising price to ~$${suggestedPrice.toFixed(2)} (15% increase) or reduce cost of goods`,
        expectedImpact: `Would add ~$${(product.revenue * 0.15).toFixed(2)} pure profit over same volume`,
        confidence: 0.70,
      });
    }

    const highMargin = profitRanking
      .filter((p) => p.marginPercent > 60 && p.quantity < 5)
      .slice(0, 3);

    for (const product of highMargin) {
      decisions.push({
        type: 'REVENUE',
        severity: 'LOW',
        title: `"${product.name}" has ${product.marginPercent}% margin but low sales`,
        explanation: `High margin product with only ${product.quantity} units sold in 14 days`,
        dataSource: ['SalesAnalyticsService.productProfitabilityRanking'],
        suggestedAction: `Feature "${product.name}" on the menu board, offer a limited-time discount to drive trial`,
        expectedImpact: `Even 1 extra sale per day at $${product.revenue.toFixed(2)} adds ~$${(product.revenue * (product.marginPercent / 100) * 30).toFixed(2)} monthly profit`,
        confidence: 0.65,
      });
    }

    if (daily.length >= 7) {
      const recent = daily.slice(-7);
      const avgRevenue = recent.reduce((s, d) => s + d.revenue, 0) / recent.length;
      const todayRev = recent[recent.length - 1]?.revenue ?? 0;

      if (todayRev < avgRevenue * 0.7 && todayRev > 0) {
        decisions.push({
          type: 'REVENUE',
          severity: 'HIGH',
          title: 'Today\'s revenue is 30%+ below 7-day average',
          explanation: `Today: $${todayRev.toFixed(2)} vs 7-day avg: $${avgRevenue.toFixed(2)}`,
          dataSource: ['RevenueAnalyticsService.dailyRevenue'],
          suggestedAction: 'Immediate strategy review: check competitor activity, promotions, weather. Launch a push campaign.',
          expectedImpact: 'Recover today\'s slow traffic — target 10-20% boost',
          confidence: 0.80,
        });
      }
    }

    return decisions;
  }

  async analyzeStaffOptimization(cafeId: string): Promise<Decision[]> {
    const decisions: Decision[] = [];
    const today = new Date();
    const from = new Date(today);
    const toStr = today.toISOString();
    from.setHours(0, 0, 0, 0);
    const fromStr = from.toISOString();

    const [topStaff, underStaff, allPerformances] = await Promise.all([
      this.staffAnalytics.topStaffByOrders(cafeId, 5, fromStr, toStr),
      this.staffAnalytics.underperformingStaff(cafeId, 3, fromStr, toStr),
      this.prisma.staffPerformance.findMany({
        where: { cafeId, date: { gte: new Date(fromStr) } },
        include: { staff: true },
      }),
    ]);

    for (const staff of underStaff) {
      decisions.push({
        type: 'STAFF',
        severity: 'MEDIUM',
        title: `Staff member ${staff.name} needs attention`,
        explanation: `Completed only ${staff.orderCount} orders today`,
        dataSource: ['StaffAnalyticsService.underperformingStaff'],
        suggestedAction: `Check in with ${staff.name}. May need training, schedule adjustment, or support during rush hours`,
        expectedImpact: 'Improving this staff member could increase daily capacity by 10-15%',
        confidence: 0.75,
      });
    }

    const burnoutCandidates = allPerformances
      .filter((p) => p.avgOrderProcessingTime > 15 && p.ordersHandled > 5)
      .slice(0, 2);

    for (const candidate of burnoutCandidates) {
      decisions.push({
        type: 'STAFF',
        severity: 'HIGH',
        title: `Potential burnout: ${candidate.staff.name} handling ${candidate.ordersHandled} orders at ${candidate.avgOrderProcessingTime.toFixed(1)}min avg`,
        explanation: `High order volume (${candidate.ordersHandled}) combined with slow processing (${candidate.avgOrderProcessingTime.toFixed(1)}min) indicates overload`,
        dataSource: ['StaffPerformanceService.getPerformanceHistory'],
        suggestedAction: `Consider giving ${candidate.staff.name} a lighter shift tomorrow or pairing with another staff during peak hours`,
        expectedImpact: 'Prevents quality decline and potential staff loss',
        confidence: 0.70,
      });
    }

    const bonusCandidates = allPerformances
      .filter((p) => p.overallScore >= 85 && p.ordersHandled >= 10)
      .slice(0, 2);

    for (const candidate of bonusCandidates) {
      decisions.push({
        type: 'STAFF',
        severity: 'LOW',
        title: `${candidate.staff.name} qualifies for performance bonus`,
        explanation: `Score ${candidate.overallScore}/100 with ${candidate.ordersHandled} orders handled`,
        dataSource: ['StaffPerformanceService.getTopPerformers'],
        suggestedAction: `Acknowledge ${candidate.staff.name}'s performance with a shift bonus or public recognition`,
        expectedImpact: 'Boosts morale and motivates continued high performance',
        confidence: 0.85,
      });
    }

    return decisions;
  }

  async analyzeProductStrategy(cafeId: string): Promise<Decision[]> {
    const decisions: Decision[] = [];
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 14);
    const fromStr = from.toISOString();
    const toStr = today.toISOString();

    const [byRevenue, byQuantity, profitability, categoryPerf] = await Promise.all([
      this.salesAnalytics.topProductsByRevenue(cafeId, 50, fromStr, toStr),
      this.salesAnalytics.topProductsByQuantity(cafeId, 50, fromStr, toStr),
      this.salesAnalytics.productProfitabilityRanking(cafeId, 50, fromStr, toStr),
      this.salesAnalytics.categoryPerformance(cafeId, fromStr, toStr),
    ]);

    const revenueIds = new Set(byRevenue.map((p) => p.productId));
    const allProducts = await this.prisma.product.findMany({ where: { cafeId, active: true } });
    const zeroRevenue = allProducts.filter((p) => !revenueIds.has(p.id)).slice(0, 5);

    for (const product of zeroRevenue) {
      decisions.push({
        type: 'PRODUCT',
        severity: 'MEDIUM',
        title: `"${product.name}" has zero sales in 14 days`,
        explanation: `No orders for "${product.name}" despite being active on the menu`,
        dataSource: ['SalesAnalyticsService.topProductsByRevenue'],
        suggestedAction: `Consider removing "${product.name}" from the active menu or running a "featured item" promotion to clear inventory`,
        expectedImpact: 'Reduces menu complexity and potential waste',
        confidence: 0.90,
      });
    }

    const highProfitItems = profitability.filter((p) => p.profit > 0).slice(0, 5);
    const avgProfit = highProfitItems.length > 0
      ? highProfitItems.reduce((s, p) => s + p.profit, 0) / highProfitItems.length
      : 0;

    const topRevenueItem = byRevenue[0];
    if (topRevenueItem) {
      const topProfit = profitability.find((p) => p.productId === topRevenueItem.productId);
      if (topProfit && topProfit.marginPercent < 35) {
        decisions.push({
          type: 'PRODUCT',
          severity: 'MEDIUM',
          title: `Top revenue item "${topRevenueItem.name}" has low margin (${topProfit.marginPercent}%)`,
          explanation: `$${topRevenueItem.revenue.toFixed(2)} revenue but only ${topProfit.marginPercent}% margin`,
          dataSource: ['SalesAnalyticsService.productProfitabilityRanking', 'SalesAnalyticsService.topProductsByRevenue'],
          suggestedAction: `Bundle "${topRevenueItem.name}" with a high-margin add-on to boost overall profit`,
          expectedImpact: `Could increase per-order profit by 20-40% on bundle sales`,
          confidence: 0.65,
        });
      }
    }

    const underperformingCategory = categoryPerf
      .filter((c) => c.revenue < avgProfit * 0.5)
      .slice(0, 2);

    for (const cat of underperformingCategory) {
      decisions.push({
        type: 'PRODUCT',
        severity: 'LOW',
        title: `"${cat.category}" category underperforming`,
        explanation: `Only $${cat.revenue.toFixed(2)} revenue from this category`,
        dataSource: ['SalesAnalyticsService.categoryPerformance'],
        suggestedAction: `Review "${cat.category}" pricing and variety. Consider a category-specific promotion`,
        expectedImpact: 'Category revitalization could add 5-10% to total revenue',
        confidence: 0.60,
      });
    }

    return decisions;
  }

  async analyzeCustomerStrategy(cafeId: string): Promise<Decision[]> {
    const decisions: Decision[] = [];
    const today = new Date();

    const [topCustomers, retention, debtRisks, totalOrders] = await Promise.all([
      this.customerAnalytics.topCustomersBySpend(cafeId, 10),
      this.customerAnalytics.repeatCustomerRate(cafeId),
      this.customerAnalytics.debtRiskCustomers(cafeId, 50),
      this.prisma.order.groupBy({
        by: ['customerId'],
        where: { cafeId },
        _max: { createdAt: true },
      }),
    ]);

    if (topCustomers.length > 0) {
      const vipCustomers = topCustomers.slice(0, 5);
      const vipNames = vipCustomers.map((c) => c.name || c.phone).join(', ');
      decisions.push({
        type: 'CUSTOMER',
        severity: 'LOW',
        title: `${vipCustomers.length} VIP customers identified`,
        explanation: `Top ${vipCustomers.length} customers account for significant revenue`,
        dataSource: ['CustomerAnalyticsService.topCustomersBySpend'],
        suggestedAction: `Send personalized thank-you offers to: ${vipNames}. Consider a loyalty program for top spenders`,
        expectedImpact: 'Improves retention of highest-value customers by 20-30%',
        confidence: 0.80,
      });
    }

    if (retention.retentionRate < 30) {
      decisions.push({
        type: 'CUSTOMER',
        severity: 'HIGH',
        title: 'Customer retention rate is critically low',
        explanation: `Only ${retention.retentionRate}% of customers return for a second order`,
        dataSource: ['CustomerAnalyticsService.repeatCustomerRate'],
        suggestedAction: 'Launch a "second order" incentive campaign — discount on 2nd order, referral bonus, or punch card',
        expectedImpact: 'Increasing retention to 40% could double customer lifetime value',
        confidence: 0.85,
      });
    }

    const churnRisks: { name: string; daysSinceLastOrder: number }[] = [];
    for (const entry of totalOrders) {
      const lastDate = entry._max.createdAt;
      if (!lastDate) continue;
      const daysSince = Math.floor((today.getTime() - lastDate.getTime()) / 86400000);
      if (daysSince >= 14 && daysSince <= 30) {
        const customer = topCustomers.find((c) => c.id === entry.customerId);
        if (customer) {
          churnRisks.push({ name: customer.name || customer.phone, daysSinceLastOrder: daysSince });
        }
      }
    }

    for (const risk of churnRisks.slice(0, 3)) {
      decisions.push({
        type: 'CUSTOMER',
        severity: 'MEDIUM',
        title: `Customer ${risk.name} hasn't ordered in ${risk.daysSinceLastOrder} days`,
        explanation: `Formerly active customer at risk of churning`,
        dataSource: ['PrismaService.order.groupBy'],
        suggestedAction: `Send a re-engagement WhatsApp message with a small incentive to ${risk.name}`,
        expectedImpact: 'Reactivation rate of 15-25% for targeted re-engagement',
        confidence: 0.70,
      });
    }

    if (debtRisks.length > 0) {
      const totalUnpaid = debtRisks.reduce((s, c) => s + Number(c.unpaidBalance), 0);
      decisions.push({
        type: 'CUSTOMER',
        severity: 'MEDIUM',
        title: `${debtRisks.length} customers have outstanding debt totaling $${totalUnpaid.toFixed(2)}`,
        explanation: `Unpaid balances accumulating — affects cash flow`,
        dataSource: ['CustomerAnalyticsService.debtRiskCustomers'],
        suggestedAction: 'Send automated payment reminders to customers with >$50 unpaid. Offer a payment plan for large balances.',
        expectedImpact: 'Recover 60-80% of outstanding debt within 2 weeks',
        confidence: 0.75,
      });
    }

    return decisions;
  }

  async analyzeOperational(cafeId: string): Promise<Decision[]> {
    const decisions: Decision[] = [];
    const today = new Date();
    const from = new Date(today);
    from.setHours(0, 0, 0, 0);
    const fromStr = from.toISOString();
    const toStr = today.toISOString();

    const [hourly, staffPerformances, activeOrders] = await Promise.all([
      this.revenueAnalytics.hourlyRevenueDistribution(cafeId, fromStr, toStr),
      this.prisma.staffPerformance.findMany({
        where: { cafeId, date: { gte: new Date(fromStr) } },
        include: { staff: true },
      }),
      this.prisma.order.count({
        where: { cafeId, status: { in: ['NEW', 'ACCEPTED', 'PREPARING'] } },
      }),
    ]);

    const peakHour = [...hourly].sort((a, b) => b.count - a.count)[0];
    if (peakHour && peakHour.count > 0) {
      const now = today.getHours();
      if (now === peakHour.hour || now === peakHour.hour - 1) {
        const activeStaff = staffPerformances.filter((p) => p.ordersHandled > 0).length;
        if (activeStaff <= 2 && peakHour.count > 5) {
          decisions.push({
            type: 'OPERATION',
            severity: 'HIGH',
            title: 'Peak hour currently understaffed',
            explanation: `${activeStaff} staff active during peak hour (${peakHour.hour}:00, ~${peakHour.count} orders expected)`,
            dataSource: ['RevenueAnalyticsService.hourlyRevenueDistribution', 'StaffPerformanceService'],
            suggestedAction: 'Call in backup staff or activate waitlist mode if still under 2 staff',
            expectedImpact: 'Prevents 50%+ order slowdown and customer wait time increase',
            confidence: 0.80,
          });
        }
      }
    }

    const slowHours = hourly.filter((h) => h.count <= 1);
    if (slowHours.length >= 3) {
      const slowHourStr = slowHours.map((h) => `${h.hour}:00`).join(', ');
      decisions.push({
        type: 'OPERATION',
        severity: 'LOW',
        title: `${slowHours.length} slow hours identified (≤1 order)`,
        explanation: `Low-traffic periods: ${slowHourStr}`,
        dataSource: ['RevenueAnalyticsService.hourlyRevenueDistribution'],
        suggestedAction: 'Consider reducing staff during these hours or running time-based promotions to drive traffic',
        expectedImpact: 'Reduces labor cost by 10-15% during slow periods or increases revenue during those windows',
        confidence: 0.75,
      });
    }

    if (activeOrders > 10) {
      decisions.push({
        type: 'OPERATION',
        severity: 'HIGH',
        title: `${activeOrders} active orders in queue — potential bottleneck`,
        explanation: `${activeOrders} orders are NEW/ACCEPTED/PREPARING and not yet complete`,
        dataSource: ['PrismaService.order.count'],
        suggestedAction: 'Prioritize orders by type, assign extra staff to preparation, communicate estimated wait times to customers',
        expectedImpact: 'Clears backlog 30% faster and reduces cancellations',
        confidence: 0.85,
      });
    }

    const longProcessing = staffPerformances
      .filter((p) => p.avgOrderProcessingTime > 20)
      .slice(0, 2);

    for (const staff of longProcessing) {
      decisions.push({
        type: 'OPERATION',
        severity: 'MEDIUM',
        title: `${staff.staff.name}'s average order processing is ${staff.avgOrderProcessingTime.toFixed(1)} minutes`,
        explanation: `Exceeds 20-minute benchmark significantly`,
        dataSource: ['StaffPerformanceService'],
        suggestedAction: `Review ${staff.staff.name}'s workflow. May need station reorganization or additional training`,
        expectedImpact: 'Reducing to 15min avg would increase daily capacity by 25%',
        confidence: 0.70,
      });
    }

    return decisions;
  }

  async detectBusinessRisks(cafeId: string): Promise<Decision[]> {
    const decisions: Decision[] = [];

    const [alerts, health, daily] = await Promise.all([
      this.insightsService.detectAlerts(cafeId),
      this.insightsService.businessHealthScore(cafeId),
      this.revenueAnalytics.dailyRevenue(cafeId, 14),
    ]);

    for (const alert of alerts) {
      const sevMap: Record<string, 'HIGH' | 'MEDIUM' | 'LOW'> = {
        high: 'HIGH',
        medium: 'MEDIUM',
        low: 'LOW',
      };

      decisions.push({
        type: 'OPERATION',
        severity: sevMap[alert.severity] || 'MEDIUM',
        title: alert.type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        explanation: alert.message,
        dataSource: ['BusinessInsightsService.detectAlerts'],
        suggestedAction: this.getRiskAction(alert.type),
        expectedImpact: 'Prevents escalation of operational risk',
        confidence: 0.85,
      });
    }

    if (health.score < 40) {
      decisions.push({
        type: 'OPERATION',
        severity: 'HIGH',
        title: 'Business health score is critical',
        explanation: `Overall health score is ${health.score}/100. Components: revenue stability ${health.components.revenueStability}, profit margin ${health.components.profitMargin}, retention ${health.components.customerRetention}%`,
        dataSource: ['BusinessInsightsService.businessHealthScore'],
        suggestedAction: 'Review all health components systematically. Prioritize the lowest-scoring area first (likely profit margin or retention).',
        expectedImpact: 'Improving health score to 60+ reduces failure risk significantly',
        confidence: 0.90,
      });
    }

    if (daily.length >= 7) {
      const recent = daily.slice(-7);
      const trend = recent.map((d) => d.revenue);
      const declining = trend.slice(1).every((v, i) => v <= trend[i]);
      if (declining && trend[trend.length - 1] > 0) {
        decisions.push({
          type: 'REVENUE',
          severity: 'HIGH',
          title: 'Revenue declining for 7 consecutive days',
          explanation: `Day-over-day decline sustained over a week. Current: $${trend[trend.length - 1].toFixed(2)}`,
          dataSource: ['RevenueAnalyticsService.dailyRevenue'],
          suggestedAction: 'Immediate strategy review: check competitor activity, customer feedback, staff availability. Consider flash sale or promotion.',
          expectedImpact: 'Stopping the decline within 48 hours prevents long-term revenue loss',
          confidence: 0.85,
        });
      }
    }

    return decisions;
  }

  private getRiskAction(type: string): string {
    const actions: Record<string, string> = {
      REVENUE_DROP: 'Investigate the cause immediately. Check if specific products, hours, or staff are affected. Launch a same-day promotion.',
      STAFF_UNDERPERFORMANCE: 'Have a brief check-in with these staff members. Offer support, training, or schedule adjustment.',
      PRODUCT_POPULARITY_DROP: 'Consider delisting or discounting these products. Swap with seasonal alternatives.',
      HIGH_DEBT: 'Send batch payment reminders via WhatsApp. Set up automated daily reminders for balances over $100.',
    };
    return actions[type] || 'Review the alert and determine appropriate action';
  }
}





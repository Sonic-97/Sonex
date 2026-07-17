import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface HabitAnalysisResult {
  customerId: string;
  avgOrderHour: number;
  peakOrderHour: number;
  orderHourStdDev: number;
  avgIntervalDays: number;
  intervalStdDev: number;
  totalOrders: number;
  frequencyPattern: string;
  topProducts: Array<{ productId: string; name: string; category: string; count: number }>;
  channelPreference: string;
  lifecycleStage: string;
  daysSinceLastOrder: number;
  lastChannelType: string;
  patternConsistency: number;
  overallConfidence: number;
}

interface NormalizedOrder {
  id: string;
  createdAt: Date;
  hour: number;
  channel: string;
  items: Array<{ productId: string; name: string; category: string; quantity: number }>;
}

@Injectable()
export class CustomerHabitService {
  private readonly logger = new Logger(CustomerHabitService.name);

  constructor(private readonly prisma: PrismaService) {}

  async analyzeCustomer(customerId: string, cafeId?: string): Promise<HabitAnalysisResult> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...(cafeId ? { cafeId } : {}) },
      select: { cafeId: true },
    });
    if (!customer) return this.emptyResult(customerId, 'dormant');
    const scopedCafeId = customer.cafeId;
    const [deliveryOrders, cafeOrders] = await Promise.all([
      this.prisma.order.findMany({
        where: { cafeId: scopedCafeId, customerId, status: 'DELIVERED', sourceType: { notIn: ['TEST', 'DEBUG', 'DUPLICATE'] } },
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.inCafeOrder.findMany({
        where: { cafeId: scopedCafeId, customerId, status: 'COMPLETED', sourceType: { notIn: ['TEST', 'DEBUG', 'DUPLICATE'] } },
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const normalized = this.normalizeOrders(deliveryOrders, cafeOrders);
    if (normalized.length === 0) {
      return this.emptyResult(customerId, 'dormant');
    }

    const timeProfile = this.computeTimeProfile(normalized);
    const frequencyProfile = this.computeFrequencyProfile(normalized);
    const topProducts = this.computeTopProducts(normalized);
    const channelPref = this.computeChannelPreference(normalized);
    const lifecycleStage = this.classifyLifecycle(normalized, frequencyProfile.avgInterval);
    const daysSinceLast = this.daysSinceLast(normalized);
    const lastChannel = normalized[normalized.length - 1]?.channel ?? 'unknown';
    const consistency = this.computePatternConsistency(
      timeProfile.stdDev,
      frequencyProfile.intervalStdDev,
      timeProfile.sampleSize,
    );
    const confidence = this.computeOverallConfidence(consistency, frequencyProfile.intervalStdDev, normalized.length, daysSinceLast);

    return {
      customerId,
      avgOrderHour: timeProfile.mean,
      peakOrderHour: timeProfile.peak,
      orderHourStdDev: timeProfile.stdDev,
      avgIntervalDays: frequencyProfile.avgInterval,
      intervalStdDev: frequencyProfile.intervalStdDev,
      totalOrders: normalized.length,
      frequencyPattern: frequencyProfile.pattern,
      topProducts,
      channelPreference: channelPref,
      lifecycleStage,
      daysSinceLastOrder: daysSinceLast,
      lastChannelType: lastChannel,
      patternConsistency: consistency,
      overallConfidence: confidence,
    };
  }

  private normalizeOrders(
    deliveryOrders: any[],
    cafeOrders: any[],
  ): NormalizedOrder[] {
    const delivery: NormalizedOrder[] = deliveryOrders.map((o) => ({
      id: o.id,
      createdAt: o.createdAt,
      hour: new Date(o.createdAt).getHours() + new Date(o.createdAt).getMinutes() / 60,
      channel: 'delivery',
      items: o.items.map((i: any) => ({
        productId: i.productId,
        name: i.product.name,
        category: i.product.category,
        quantity: i.quantity,
      })),
    }));

    const cafe: NormalizedOrder[] = cafeOrders.map((o) => ({
      id: o.id,
      createdAt: o.createdAt,
      hour: new Date(o.createdAt).getHours() + new Date(o.createdAt).getMinutes() / 60,
      channel: 'in_cafe',
      items: o.items.map((i: any) => ({
        productId: i.productId,
        name: i.product.name,
        category: i.product.category,
        quantity: i.quantity,
      })),
    }));

    return [...delivery, ...cafe].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  private computeTimeProfile(orders: NormalizedOrder[]) {
    const hours = orders.map((o) => o.hour);
    const mean = hours.reduce((s, h) => s + h, 0) / hours.length;
    const variance = hours.reduce((s, h) => s + (h - mean) ** 2, 0) / hours.length;
    const stdDev = Math.sqrt(variance);

    const hourBins = new Array(24).fill(0);
    for (const h of hours) {
      const bin = Math.min(Math.floor(h), 23);
      hourBins[bin]++;
    }
    const peak = hourBins.indexOf(Math.max(...hourBins));

    return { mean, peak, stdDev, sampleSize: orders.length };
  }

  private computeFrequencyProfile(orders: NormalizedOrder[]) {
    if (orders.length < 2) {
      return { avgInterval: 0, intervalStdDev: 0, pattern: 'insufficient_data' };
    }

    const intervals: number[] = [];
    for (let i = 1; i < orders.length; i++) {
      const diffMs = orders[i].createdAt.getTime() - orders[i - 1].createdAt.getTime();
      intervals.push(diffMs / (1000 * 60 * 60 * 24));
    }

    const avgInterval = intervals.reduce((s, d) => s + d, 0) / intervals.length;
    const variance = intervals.reduce((s, d) => s + (d - avgInterval) ** 2, 0) / intervals.length;
    const intervalStdDev = Math.sqrt(variance);

    let pattern = 'irregular';
    const cv = intervalStdDev / (avgInterval || 1);

    if (avgInterval <= 1.5 && cv < 0.5) pattern = 'daily';
    else if (avgInterval <= 3 && cv < 0.6) pattern = 'every_few_days';
    else if (avgInterval >= 5 && avgInterval <= 9 && cv < 0.5) pattern = 'weekly';
    else if (avgInterval >= 12 && avgInterval <= 18 && cv < 0.5) pattern = 'biweekly';
    else if (avgInterval >= 25 && avgInterval <= 35 && cv < 0.5) pattern = 'monthly';
    else if (cv < 0.8) pattern = 'semi_regular';

    return { avgInterval, intervalStdDev, pattern };
  }

  private computeTopProducts(orders: NormalizedOrder[], limit = 5) {
    const counts = new Map<string, { name: string; category: string; count: number }>();

    for (const order of orders) {
      for (const item of order.items) {
        const key = item.productId;
        const existing = counts.get(key) || { name: item.name, category: item.category, count: 0 };
        existing.count += item.quantity;
        counts.set(key, existing);
      }
    }

    return [...counts.entries()]
      .map(([productId, data]) => ({ productId, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private computeChannelPreference(orders: NormalizedOrder[]): string {
    const channels = new Map<string, number>();
    for (const o of orders) {
      channels.set(o.channel, (channels.get(o.channel) || 0) + 1);
    }
    let maxCount = 0;
    let preferred = 'any';
    for (const [ch, count] of channels) {
      if (count > maxCount) {
        maxCount = count;
        preferred = ch;
      }
    }
    if (orders.length === 0) return 'any';
    const pct = maxCount / orders.length;
    return pct >= 0.6 ? preferred : 'any';
  }

  private classifyLifecycle(orders: NormalizedOrder[], avgIntervalDays: number): string {
    const total = orders.length;
    const daysSince = this.daysSinceLast(orders);

    if (total < 2) return 'new';
    if (daysSince > 60) return 'at_risk';
    if (daysSince > 30) return 'dormant';
    if (total >= 20) return 'loyal';
    if (total >= 3) return 'regular';
    return 'new';
  }

  private daysSinceLast(orders: NormalizedOrder[]): number {
    if (orders.length === 0) return 999;
    const last = orders[orders.length - 1].createdAt;
    return Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));
  }

  private computePatternConsistency(hourStdDev: number, intervalStdDev: number, sampleSize: number): number {
    const hourConsistency = Math.max(0, 1 - hourStdDev / 12);
    const intervalConsistency = intervalStdDev > 0
      ? Math.max(0, 1 - Math.min(intervalStdDev, 30) / 30)
      : sampleSize >= 2 ? 0.5 : 0;
    const sampleBonus = Math.min(sampleSize / 20, 1) * 0.1;
    return Math.min(1, Math.max(0, hourConsistency * 0.5 + intervalConsistency * 0.4 + sampleBonus));
  }

  private computeOverallConfidence(
    consistency: number,
    intervalStdDev: number,
    totalOrders: number,
    daysSinceLast: number,
  ): number {
    if (totalOrders < 2) return 0;
    if (daysSinceLast > 30) return Math.max(0, consistency * 0.3);

    const recencyWeight = Math.max(0, 1 - daysSinceLast / 30);
    const sampleWeight = Math.min(totalOrders / 15, 1);
    const regularityWeight = intervalStdDev <= 0 ? 0.5 : Math.max(0, 1 - Math.min(intervalStdDev, 20) / 20);

    return Math.min(1, Math.max(0,
      consistency * 0.35 +
      recencyWeight * 0.30 +
      sampleWeight * 0.20 +
      regularityWeight * 0.15
    ));
  }

  private emptyResult(customerId: string, stage: string): HabitAnalysisResult {
    return {
      customerId,
      avgOrderHour: 0, peakOrderHour: 12, orderHourStdDev: 0,
      avgIntervalDays: 0, intervalStdDev: 0, totalOrders: 0,
      frequencyPattern: 'insufficient_data', topProducts: [],
      channelPreference: 'any', lifecycleStage: stage,
      daysSinceLastOrder: 999, lastChannelType: 'unknown',
      patternConsistency: 0, overallConfidence: 0,
    };
  }

  async upsertHabit(analysis: HabitAnalysisResult, cafeId?: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: analysis.customerId, ...(cafeId ? { cafeId } : {}) },
      select: { cafeId: true },
    });
    if (!customer) throw new Error('Customer habit scope rejected');
    const data = {
      avgOrderHour: analysis.avgOrderHour,
      peakOrderHour: analysis.peakOrderHour,
      orderHourStdDev: analysis.orderHourStdDev,
      avgIntervalDays: analysis.avgIntervalDays,
      intervalStdDev: analysis.intervalStdDev,
      totalOrders: analysis.totalOrders,
      frequencyPattern: analysis.frequencyPattern,
      topProducts: JSON.stringify(analysis.topProducts),
      channelPreference: analysis.channelPreference,
      lifecycleStage: analysis.lifecycleStage,
      daysSinceLastOrder: analysis.daysSinceLastOrder,
      lastChannelType: analysis.lastChannelType,
      patternConsistency: analysis.patternConsistency,
      overallConfidence: analysis.overallConfidence,
    };

    return this.prisma.customerHabit.upsert({
      where: { customerId: analysis.customerId },
      update: data,
      create: { cafeId: customer?.cafeId ?? '', customerId: analysis.customerId, ...data } as any,
    });
  }

  async updateFeedback(customerId: string, wasCorrect: boolean, cafeId?: string) {
    const habit = await this.prisma.customerHabit.findFirst({
      where: { customerId, ...(cafeId ? { cafeId } : {}) },
    });
    if (!habit) return;
    const adjustment = wasCorrect ? 0.02 : -0.03;
    const newConfidence = Math.min(1, Math.max(0, Number(habit.overallConfidence) + adjustment));

    await this.prisma.customerHabit.updateMany({
      where: { id: habit.id, cafeId: habit.cafeId },
      data: {
        overallConfidence: newConfidence,
        suggestionCount: { increment: 1 },
      },
    });
  }
}





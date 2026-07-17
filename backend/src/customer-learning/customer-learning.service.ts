import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerHabitService } from '../smart-followup/customer-habit.service';

export interface CustomerPattern {
  customerId: string;
  customerName: string;
  favoriteProduct: string;
  usualTime: string;
  frequency: string;
  weekdays: string[];
  averageBasket: number;
  confidenceScore: number;
  aiWaiterActive: boolean;
}

@Injectable()
export class CustomerLearningService {
  private readonly logger = new Logger(CustomerLearningService.name);
  private readonly MIN_ORDERS = 5;
  private readonly MIN_DAYS = 7;
  private readonly ACTIVATION_THRESHOLD = 0.8;
  private readonly weekDayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly habitService: CustomerHabitService,
  ) {}

  async learn(cafeId: string, customerId: string): Promise<void> {
    try {
      const qualified = await this.checkQualification(cafeId, customerId);
      if (!qualified) return;

      const existing = await this.prisma.customerHabit.findFirst({
        where: { customerId, cafeId },
      });
      if (existing && existing.cafeId !== cafeId) return;
      if (existing?.aiWaiterActive) return;

      const analysis = await this.habitService.analyzeCustomer(customerId, cafeId);
      if (analysis.totalOrders < this.MIN_ORDERS) return;

      const topProduct = analysis.topProducts[0];
      const usualHour = Math.round(analysis.avgOrderHour);
      const usualMinute = Math.round((analysis.avgOrderHour % 1) * 60);
      const usualTime = `${String(usualHour).padStart(2, '0')}:${String(usualMinute).padStart(2, '0')}`;

      const orders = await this.getCustomerOrders(cafeId, customerId);
      const weekdays = this.computeWeekdays(orders);
      const averageBasket = this.computeAverageBasket(analysis.totalOrders, orders);
      const firstOrderDate = orders.length > 0 ? orders[0].createdAt : null;

      const confidence = Number(analysis.overallConfidence);
      const aiWaiterActive = confidence >= this.ACTIVATION_THRESHOLD;

      const data: any = {
        cafeId,
        totalOrders: analysis.totalOrders,
        frequencyPattern: analysis.frequencyPattern,
        patternConsistency: analysis.patternConsistency,
        overallConfidence: confidence,
        lifecycleStage: analysis.lifecycleStage,
        favoriteProductId: topProduct?.productId ?? null,
        favoriteProductName: topProduct?.name ?? null,
        usualTime,
        preferredWeekdays: JSON.stringify(weekdays),
        averageBasket: new Prisma.Decimal(averageBasket),
        firstOrderDate,
        aiWaiterActive,
      };

      await this.prisma.customerHabit.upsert({
        where: { customerId },
        update: data,
        create: { customerId, ...data },
      });

      if (aiWaiterActive) {
        this.logger.log(`AI Waiter activated for customer ${customerId} (confidence: ${Math.round(confidence * 100)}%)`);
      }
    } catch (err) {
      this.logger.error(`Learning failed for customer ${customerId}: ${(err as Error).message}`);
    }
  }

  async getCustomerPattern(cafeId: string, customerId: string): Promise<CustomerPattern | null> {
    const habit = await this.prisma.customerHabit.findFirst({
      where: { customerId, cafeId },
      include: { customer: { select: { name: true } } },
    });
    if (!habit || habit.cafeId !== cafeId || !habit.aiWaiterActive) return null;

    const weekdays: number[] = typeof habit.preferredWeekdays === 'string'
      ? JSON.parse(habit.preferredWeekdays as string)
      : (habit.preferredWeekdays as number[] || []);

    const labels: Record<string, string> = {
      daily: 'كل يوم تقريباً',
      every_few_days: 'كل بضعة أيام',
      weekly: 'أسبوعياً',
      biweekly: 'كل أسبوعين',
      monthly: 'شهرياً',
      semi_regular: 'شبه منتظم',
      irregular: 'غير منتظم',
    };

    return {
      customerId: habit.customerId,
      customerName: habit.customer?.name || 'عميل',
      favoriteProduct: habit.favoriteProductName || '—',
      usualTime: habit.usualTime || '—',
      frequency: labels[habit.frequencyPattern] || habit.frequencyPattern,
      weekdays: weekdays.map(d => this.weekDayNames[d] || ''),
      averageBasket: Number(habit.averageBasket || 0),
      confidenceScore: Number(habit.overallConfidence),
      aiWaiterActive: habit.aiWaiterActive,
    };
  }

  async getActivePatterns(cafeId: string): Promise<CustomerPattern[]> {
    const habits = await this.prisma.customerHabit.findMany({
      where: { cafeId, aiWaiterActive: true },
      include: { customer: { select: { name: true } } },
      orderBy: { overallConfidence: 'desc' },
    });

    return habits.map(h => ({
      customerId: h.customerId,
      customerName: h.customer?.name || 'عميل',
      favoriteProduct: h.favoriteProductName || '—',
      usualTime: h.usualTime || '—',
      frequency: h.frequencyPattern,
      weekdays: [],
      averageBasket: Number(h.averageBasket || 0),
      confidenceScore: Number(h.overallConfidence),
      aiWaiterActive: h.aiWaiterActive,
    }));
  }

  private async checkQualification(cafeId: string, customerId: string): Promise<boolean> {
    const orders = await this.getCustomerOrders(cafeId, customerId);
    if (orders.length >= this.MIN_ORDERS) return true;

    if (orders.length > 0) {
      const firstDate = orders[0].createdAt;
      const daysSince = Math.floor((Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince >= this.MIN_DAYS) return true;
    }

    return false;
  }

  private async getCustomerOrders(cafeId: string, customerId: string): Promise<any[]> {
    const [delivery, cafe] = await Promise.all([
      this.prisma.order.findMany({
        where: { cafeId, customerId, status: 'DELIVERED', sourceType: { notIn: ['TEST', 'DEBUG', 'DUPLICATE'] } },
        include: { items: { include: { product: { select: { id: true, name: true, price: true } } } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.inCafeOrder.findMany({
        where: { cafeId, customerId, status: 'COMPLETED', sourceType: { notIn: ['TEST', 'DEBUG', 'DUPLICATE'] } },
        include: { items: { include: { product: { select: { id: true, name: true, price: true } } } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return [...delivery, ...cafe].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  private computeWeekdays(orders: any[]): number[] {
    const dayCounts = new Array(7).fill(0);
    for (const o of orders) {
      const day = new Date(o.createdAt).getDay();
      dayCounts[day]++;
    }
    const max = Math.max(...dayCounts);
    if (max === 0) return [];
    return dayCounts
      .map((count, day) => ({ day, count }))
      .filter(({ count }) => count >= max * 0.5)
      .map(({ day }) => day)
      .sort();
  }

  private computeAverageBasket(totalOrders: number, orders: any[]): number {
    if (totalOrders === 0 || orders.length === 0) return 0;
    let totalItems = 0;
    for (const o of orders) {
      if (o.items) {
        totalItems += o.items.reduce((s: number, i: any) => s + (i.quantity || 1), 0);
      }
    }
    return Math.round((totalItems / orders.length) * 100) / 100;
  }
}

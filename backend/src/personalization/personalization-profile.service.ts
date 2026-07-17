import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerMemoryService } from '../customer-memory/customer-memory.service';
import { CustomerMemoryScope, ConversationStyle as MemConversationStyle } from '../customer-memory/customer-memory.types';
import {
  PersonalizationProfile,
  PersonalizationLevel,
  ConfidenceLevel,
  CoffeePreferences,
  UsualOrder,
  PaymentMethod,
  ConversationStyle,
} from './personalization.types';

const STRONG_EVIDENCE = 5;
const MEDIUM_EVIDENCE = 3;

@Injectable()
export class PersonalizationProfileService {
  private readonly logger = new Logger(PersonalizationProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customerMemory: CustomerMemoryService,
  ) {}

  async getProfile(cafeId: string, customerId: string, phone: string): Promise<PersonalizationProfile> {
    const scope: CustomerMemoryScope = {
      cafeId,
      customerId,
      channel: 'TELEGRAM',
      channelIdentity: phone,
    };

    const memory = await this.customerMemory.getMemory(scope);
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, cafeId },
      select: {
        id: true, name: true, totalOrders: true, totalSpent: true,
        lastOrderDate: true, preferredProducts: true,
      },
    });

    const habit = await this.prisma.customerHabit.findUnique({
      where: { customerId },
    });

    const totalOrders = customer?.totalOrders || 0;
    const lastOrder = customer?.lastOrderDate;
    const avgOrderValue = customer?.totalSpent ? Number(customer.totalSpent) / Math.max(totalOrders, 1) : 0;
    const morningCustomer = this.isMorningCustomer(habit);
    const usualOrder = await this.buildUsualOrder(cafeId, customerId, phone, scope);
    const style = this.mapConversationStyle(memory?.conversationStyle);

    const coffeePrefs = this.buildCoffeePreferences(memory);
    const priceSensitive = this.detectPriceSensitivity(customer);
    const budgetRange = await this.detectBudgetRange(cafeId, customerId);
    const optOuts = {
      personalizationDisabled: false,
      recommendationsDisabled: memory?.explicitPreferences?.disableUpselling || false,
    };

    const evidenceCount = totalOrders;
    const level = this.computeLevel(totalOrders, morningCustomer, coffeePrefs, evidenceCount, habit);
    const hasStrongEvidence = evidenceCount >= MEDIUM_EVIDENCE;

    return {
      customerId,
      cafeId,
      phone,
      preferredName: memory?.preferredName || customer?.name,
      conversationStyle: style,
      level,
      levelReason: this.levelReason(level, totalOrders, morningCustomer, evidenceCount),
      orderingProfile: {
        usualOrder: usualOrder || undefined,
        usualOrderTimes: this.getOrderTimes(habit),
        averageOrderValue: Math.round(avgOrderValue * 100) / 100,
        orderFrequency: habit?.frequencyPattern || 'unknown',
        totalOrders,
        preferredPaymentMethod: this.detectPaymentMethod(cafeId, customerId),
        morningCustomer,
      },
      coffeePreferences: coffeePrefs,
      recommendationProfile: {
        acceptedCategories: [],
        rejectedCategories: [],
        permanentOptOut: optOuts.recommendationsDisabled,
      },
      budgetProfile: {
        priceSensitive,
        budgetRange: budgetRange || undefined,
      },
      optOuts,
      hasStrongEvidence,
      evidenceCount,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  private computeLevel(
    totalOrders: number,
    morningCustomer: boolean,
    coffeePrefs: CoffeePreferences,
    evidenceCount: number,
    habit: any,
  ): PersonalizationLevel {
    if (totalOrders === 0) return 0;
    if (totalOrders === 1) return 1;
    if (totalOrders >= 10 && morningCustomer && coffeePrefs.roastConfidence !== 'UNKNOWN') return 3;
    if (totalOrders >= 5 && coffeePrefs.roastConfidence !== 'UNKNOWN') return 2;
    if (totalOrders >= 2) return 1;
    return 0;
  }

  private levelReason(level: PersonalizationLevel, totalOrders: number, morningCustomer: boolean, evidence: number): string {
    const reasons: Record<PersonalizationLevel, string> = {
      0: 'New customer — no order history',
      1: `Recognized — ${totalOrders} order(s)`,
      2: `Repeat customer — ${totalOrders} orders with known preferences`,
      3: `Highly familiar — ${totalOrders} orders, morning pattern, strong coffee preferences`,
    };
    return reasons[level];
  }

  private mapConversationStyle(style?: MemConversationStyle): ConversationStyle {
    if (!style) return 'GUIDED';
    const map: Record<MemConversationStyle, ConversationStyle> = {
      FAST: 'FAST',
      GUIDED: 'GUIDED',
      EXPLORING: 'EXPLORING',
    };
    return map[style] || 'GUIDED';
  }

  private buildCoffeePreferences(memory: any): CoffeePreferences {
    const result: CoffeePreferences = {
      roastConfidence: 'UNKNOWN',
      blendConfidence: 'UNKNOWN',
      sugarConfidence: 'UNKNOWN',
    };
    if (!memory) return result;

    const explicit = memory.explicitPreferences;
    const inferred = memory.inferredPreferences;

    if (explicit.coffeeRoast) {
      result.roast = explicit.coffeeRoast;
      result.roastConfidence = 'EXPLICIT';
    } else if (inferred.coffeeRoast) {
      result.roast = inferred.coffeeRoast.value;
      result.roastConfidence = this.toConfidenceLevel(inferred.coffeeRoast);
    }

    if (explicit.coffeeBlend) {
      result.blend = explicit.coffeeBlend;
      result.blendConfidence = 'EXPLICIT';
    } else if (inferred.coffeeBlend) {
      result.blend = inferred.coffeeBlend.value;
      result.blendConfidence = this.toConfidenceLevel(inferred.coffeeBlend);
    }

    if (explicit.sugarPreference) {
      result.sugar = explicit.sugarPreference;
      result.sugarConfidence = 'EXPLICIT';
    } else if (inferred.sugarPreference) {
      result.sugar = inferred.sugarPreference.value;
      result.sugarConfidence = this.toConfidenceLevel(inferred.sugarPreference);
    }

    return result;
  }

  private toConfidenceLevel(signal: any): ConfidenceLevel {
    if (!signal) return 'UNKNOWN';
    if (signal.confidence >= 0.8 && signal.evidenceCount >= STRONG_EVIDENCE) return 'STRONG';
    if (signal.confidence >= 0.5 && signal.evidenceCount >= MEDIUM_EVIDENCE) return 'MEDIUM';
    if (signal.evidenceCount >= 1) return 'WEAK';
    return 'UNKNOWN';
  }

  private async buildUsualOrder(cafeId: string, customerId: string, phone: string, scope: CustomerMemoryScope): Promise<UsualOrder | null> {
    try {
      const preview = await this.customerMemory.buildRepeatOrderPreview(scope);
      if (!preview || !preview.canConfirmAll || preview.items.length === 0) return null;

      const items = preview.items.map((item: any) => {
        const orderItem: any = {
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          notes: item.notes,
          unitPrice: item.currentUnitPrice || item.previousUnitPrice,
        };
        const notes = item.notes || '';
        if (notes.includes('فاتح')) orderItem.coffeeRoast = 'LIGHT';
        else if (notes.includes('غامق')) orderItem.coffeeRoast = 'DARK';
        else if (notes.includes('وسط') && !notes.includes('سكر')) orderItem.coffeeRoast = 'MEDIUM';
        if (notes.includes('محوج')) orderItem.coffeeBlend = 'SPICED';
        else if (notes.includes('غير محوج') || notes.includes('سادة')) orderItem.coffeeBlend = 'PLAIN';
        if (notes.includes('من غير سكر')) orderItem.coffeeSugar = 'NO_SUGAR';
        else if (notes.includes('سكر خفيف')) orderItem.coffeeSugar = 'LIGHT_SUGAR';
        else if (notes.includes('سكر زيادة')) orderItem.coffeeSugar = 'EXTRA_SUGAR';
        else if (notes.includes('مظبوط')) orderItem.coffeeSugar = 'MEDIUM_SUGAR';
        return orderItem;
      });

      return {
        items,
        total: preview.currentTotal,
        sourceOrderId: preview.sourceOrderId,
        branchId: preview.branchId,
      };
    } catch {
      return null;
    }
  }

  private isMorningCustomer(habit: any): boolean {
    if (!habit?.peakOrderHour) return false;
    return habit.peakOrderHour >= 6 && habit.peakOrderHour <= 11;
  }

  private getOrderTimes(habit: any): string[] {
    if (!habit?.usualTime) return [];
    return [habit.usualTime];
  }

  private detectPriceSensitivity(customer: any): boolean {
    if (!customer || !customer.totalSpent || !customer.totalOrders) return false;
    const avg = Number(customer.totalSpent) / customer.totalOrders;
    return avg < 30;
  }

  private async detectBudgetRange(cafeId: string, customerId: string): Promise<{ min: number; max: number } | null> {
    const orders = await this.prisma.order.findMany({
      where: { cafeId, customerId, status: { notIn: ['CANCELLED'] } },
      select: { total: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    if (orders.length < 2) return null;
    const totals = orders.map(o => Number(o.total));
    return {
      min: Math.min(...totals),
      max: Math.max(...totals),
    };
  }

  private detectPaymentMethod(cafeId: string, customerId: string): PaymentMethod | undefined {
    return undefined;
  }

  async isUsualOrderMessage(message: string): Promise<boolean> {
    const text = message.trim().toLowerCase();
    const usualPatterns = [
      /^(المعتاد|هات المعتاد|زي كل مره|زي كل مرة|زي امبارح|نفس بتاعة كل يوم|نفس بتاعة الصبح|نفس الطلب|كرر الطلب)$/,
      /^واحده كمان$/, /^هات كمان$/, /^نفس بتاعة/,
    ];
    return usualPatterns.some(p => p.test(text));
  }

  async isOptOutMessage(message: string): Promise<boolean> {
    const text = message.trim().toLowerCase();
    return /(متفتكرش|امسح تفضيلاتي|متقترحليش|متستخدمش طلبي القديم|خليني أطلب من الأول)/.test(text);
  }

  async isOptInMessage(message: string): Promise<boolean> {
    const text = message.trim().toLowerCase();
    return /(افتكر تاني|رجّع التفضيلات|عايز الاقتراحات|كمل تذكر)/.test(text);
  }
}

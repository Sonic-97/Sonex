import { Injectable, Logger, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from '../common/idempotency.service';
import { EventBusService } from '../events/event-bus.service';
import {
  LoyaltyRuleConfig, LoyaltyProgress, RewardWalletState, AvailableReward,
  MilestoneEvent, CustomerTierLevel, LedgerEntryType,
} from './loyalty.types';
import { Prisma } from '@prisma/client';

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotencyService: IdempotencyService,
    private readonly eventBus: EventBusService,
  ) {}

  // ── Rule Management ──

  async createRule(cafeId: string, data: {
    name: string; type: string; conditionCount: number; rewardType: string;
    rewardProductId?: string; rewardValue?: number;
    scopeProductIds?: string[]; scopeCategoryIds?: string[];
    validFrom?: string; validTo?: string; maxRedemptions?: number;
    requiresOwnerApproval?: boolean; autoCompensation?: boolean;
  }): Promise<LoyaltyRuleConfig> {
    const rule = await this.prisma.loyaltyRule.create({
      data: {
        cafeId,
        name: data.name,
        type: data.type,
        conditionCount: data.conditionCount,
        rewardType: data.rewardType,
        rewardProductId: data.rewardProductId || null,
        rewardValue: data.rewardValue || null,
        scopeProductIds: data.scopeProductIds || null,
        scopeCategoryIds: data.scopeCategoryIds || null,
        validFrom: data.validFrom ? new Date(data.validFrom) : null,
        validTo: data.validTo ? new Date(data.validTo) : null,
        maxRedemptions: data.maxRedemptions || null,
        requiresOwnerApproval: data.requiresOwnerApproval || false,
        autoCompensation: data.autoCompensation || false,
        enabled: false,
      },
    });
    return this.toRuleConfig(rule);
  }

  async updateRule(ruleId: string, cafeId: string, data: Partial<{
    name: string; enabled: boolean; conditionCount: number; maxRedemptions: number;
    validFrom: string; validTo: string; rewardValue: number;
  }>): Promise<LoyaltyRuleConfig> {
    const rule = await this.prisma.loyaltyRule.findUnique({ where: { id: ruleId } });
    if (!rule || rule.cafeId !== cafeId) throw new ForbiddenException('Rule not found');
    const updated = await this.prisma.loyaltyRule.update({
      where: { id: ruleId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
        ...(data.conditionCount !== undefined && { conditionCount: data.conditionCount }),
        ...(data.maxRedemptions !== undefined && { maxRedemptions: data.maxRedemptions }),
        ...(data.validFrom && { validFrom: new Date(data.validFrom) }),
        ...(data.validTo && { validTo: new Date(data.validTo) }),
        ...(data.rewardValue !== undefined && { rewardValue: data.rewardValue }),
      },
    });
    return this.toRuleConfig(updated);
  }

  async getActiveRules(cafeId: string): Promise<LoyaltyRuleConfig[]> {
    const rules = await this.prisma.loyaltyRule.findMany({
      where: { cafeId, enabled: true },
      orderBy: { createdAt: 'asc' },
    });
    return rules.map(r => this.toRuleConfig(r));
  }

  async getAllRules(cafeId: string): Promise<LoyaltyRuleConfig[]> {
    const rules = await this.prisma.loyaltyRule.findMany({
      where: { cafeId },
      orderBy: { createdAt: 'asc' },
    });
    return rules.map(r => this.toRuleConfig(r));
  }

  private toRuleConfig(r: any): LoyaltyRuleConfig {
    return {
      ruleId: r.id,
      cafeId: r.cafeId,
      name: r.name,
      type: r.type as any,
      scopeProductIds: r.scopeProductIds || undefined,
      scopeCategoryIds: r.scopeCategoryIds || undefined,
      conditionCount: r.conditionCount,
      conditionMinValue: r.conditionMinValue ? Number(r.conditionMinValue) : undefined,
      rewardType: r.rewardType as any,
      rewardProductId: r.rewardProductId || undefined,
      rewardValue: r.rewardValue ? Number(r.rewardValue) : undefined,
      validFrom: r.validFrom?.toISOString(),
      validTo: r.validTo?.toISOString(),
      maxRedemptions: r.maxRedemptions || undefined,
      currentRedemptions: r.currentRedemptions,
      enabled: r.enabled,
      requiresOwnerApproval: r.requiresOwnerApproval,
      autoCompensation: r.autoCompensation,
    };
  }

  // ── Loyalty Ledger ──

  async getWallet(cafeId: string, customerId: string): Promise<RewardWalletState> {
    const wallet = await this.prisma.rewardWallet.findUnique({
      where: { customerId },
    });

    const balance = wallet?.currentBalance || 0;
    const earned = wallet?.totalEarned || 0;
    const redeemed = wallet?.totalRedeemed || 0;
    const lifetime = wallet?.lifetimeEarned || 0;

    const rules = await this.getActiveRules(cafeId);
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { totalOrders: true, totalSpent: true, totalCafeVisits: true },
    });

    const progresses: LoyaltyProgress[] = [];
    const availableRewards: AvailableReward[] = [];

    for (const rule of rules) {
      const current = this.getCurrentProgress(rule, customer);
      const target = rule.conditionCount;
      const percentage = Math.min(100, Math.round((current / target) * 100));

      progresses.push({
        ruleId: rule.ruleId,
        ruleName: rule.name,
        ruleType: rule.type,
        current,
        target,
        percentage,
        rewardType: rule.rewardType,
        rewardDescription: this.rewardDescription(rule),
        rewardProductId: rule.rewardProductId,
        progressText: percentage >= 100
          ? `🎉 مكافأتك جاهزة!`
          : `فاضلك ${target - current} على ${this.rewardDescription(rule)}`,
      });

      if (percentage >= 100 && (!rule.maxRedemptions || rule.currentRedemptions < rule.maxRedemptions)) {
        availableRewards.push({
          ruleId: rule.ruleId,
          ruleName: rule.name,
          rewardType: rule.rewardType,
          rewardDescription: this.rewardDescription(rule),
          rewardProductId: rule.rewardProductId,
          rewardValue: rule.rewardValue ? Number(rule.rewardValue) : undefined,
          expiresAt: rule.validTo,
          canRedeem: true,
        });
      }
    }

    return {
      currentBalance: balance,
      totalEarned: earned,
      totalRedeemed: redeemed,
      lifetimeEarned: lifetime,
      availableRewards,
      progresses,
    };
  }

  private getCurrentProgress(rule: LoyaltyRuleConfig, customer: { totalOrders: number; totalSpent: Prisma.Decimal | number; totalCafeVisits: number } | null): number {
    if (!customer) return 0;
    switch (rule.type) {
      case 'ORDER_COUNT': return customer.totalOrders;
      case 'SPEND_THRESHOLD': return Math.floor(Number(customer.totalSpent));
      case 'VISIT_COUNT': return customer.totalCafeVisits;
      case 'STREAK': return customer.totalOrders; // simplified
      case 'PRODUCT_FREQUENCY': return customer.totalOrders; // simplified
      default: return 0;
    }
  }

  private rewardDescription(rule: LoyaltyRuleConfig): string {
    switch (rule.rewardType) {
      case 'FREE_PRODUCT': return rule.name;
      case 'DISCOUNT': return `خصم ${rule.rewardValue} جنيه`;
      case 'SIZE_UPGRADE': return 'ترقية حجم مجانية';
      case 'FREE_ADDON': return 'إضافة مجانية';
      case 'POINTS': return `${rule.rewardValue} نقطة`;
      default: return rule.name;
    }
  }

  // ── Earning Points/Rewards ──

  async processOrderDelivered(orderId: string, cafeId: string, customerId: string): Promise<void> {
    const idemKey = `loyalty:order:${cafeId}:${customerId}:${orderId}`;
    const dup = await this.idempotencyService.isProcessed('loyalty', idemKey, cafeId);
    if (dup.duplicated) {
      this.logger.warn(`Duplicate loyalty processing for order ${orderId}`);
      return;
    }

    const rules = await this.getActiveRules(cafeId);
    for (const rule of rules) {
      await this.tryEarnForRule(rule, cafeId, customerId, orderId, idemKey);
    }

    await this.prisma.processedMessage.create({
      data: {
        cafeId,
        source: 'loyalty',
        idempotencyKey: idemKey,
        entityType: 'loyalty_earn',
        entityId: orderId,
        status: 'completed',
        completedAt: new Date(),
      },
    }).catch(() => {});

    await this.checkMilestones(cafeId, customerId);
  }

  private async tryEarnForRule(rule: LoyaltyRuleConfig, cafeId: string, customerId: string, orderId: string, baseKey: string): Promise<void> {
    const ruleKey = `${baseKey}:${rule.ruleId}`;
    const dup = await this.idempotencyService.isProcessed('loyalty', ruleKey, cafeId);
    if (dup.duplicated) return;

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { totalOrders: true, totalSpent: true, totalCafeVisits: true },
    });
    if (!customer) return;

    const current = this.getCurrentProgress(rule, customer);
    if (current < rule.conditionCount) return;

    if (rule.maxRedemptions && rule.currentRedemptions >= rule.maxRedemptions) return;

    if (rule.validTo && new Date(rule.validTo) < new Date()) return;
    if (rule.validFrom && new Date(rule.validFrom) > new Date()) return;

    await this.prisma.$transaction(async (tx) => {
      const r = await tx.loyaltyRule.findUnique({ where: { id: rule.ruleId }, select: { currentRedemptions: true } });
      if (rule.maxRedemptions && r && r.currentRedemptions >= rule.maxRedemptions) return;

      await tx.loyaltyLedger.create({
        data: {
          cafeId,
          customerId,
          ruleId: rule.ruleId,
          orderId,
          entryType: 'EARN',
          points: rule.rewardType === 'POINTS' ? Number(rule.rewardValue || 0) : 0,
          reason: `Reward earned: ${rule.name}`,
          idempotencyKey: ruleKey,
          createdBy: 'system',
        },
      });

      await tx.rewardWallet.upsert({
        where: { customerId },
        create: {
          cafeId,
          customerId,
          totalEarned: 1,
          currentBalance: rule.rewardType === 'POINTS' ? Number(rule.rewardValue || 0) : 0,
          lifetimeEarned: 1,
        },
        update: {
          totalEarned: { increment: 1 },
          currentBalance: rule.rewardType === 'POINTS' ? { increment: Number(rule.rewardValue || 0) } : undefined,
          lifetimeEarned: { increment: 1 },
        },
      });

      await tx.loyaltyRule.update({
        where: { id: rule.ruleId },
        data: { currentRedemptions: { increment: 1 } },
      });
    });
  }

  // ── Milestones ──

  private async checkMilestones(cafeId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { totalOrders: true },
    });
    if (!customer) return;

    const milestones = [
      { count: 1, key: 'FIRST_ORDER' },
      { count: 5, key: 'FIFTH_ORDER' },
      { count: 10, key: 'TENTH_ORDER' },
      { count: 25, key: '25TH_ORDER' },
      { count: 50, key: '50TH_ORDER' },
    ];

    for (const ms of milestones) {
      if (customer.totalOrders === ms.count) {
        const msKey = `milestone:${cafeId}:${customerId}:${ms.key}`;
        const dup = await this.idempotencyService.isProcessed('loyalty', msKey, cafeId);
        if (!dup.duplicated) {
          await this.prisma.processedMessage.create({
            data: {
              cafeId,
              source: 'loyalty',
              idempotencyKey: msKey,
              entityType: 'milestone',
              entityId: ms.key,
              status: 'completed',
              completedAt: new Date(),
            },
          }).catch(() => {});
          (this.eventBus as any).publish('loyalty.milestone', {
            cafeId, customerId, milestone: ms.key, totalOrders: customer.totalOrders,
          } as any, cafeId);
        }
      }
    }
  }

  // ── Reward Redemption ──

  async redeemReward(cafeId: string, customerId: string, ruleId: string): Promise<{ success: boolean; message: string; discount?: number }> {
    const idemKey = `redeem:${cafeId}:${customerId}:${ruleId}:${Date.now()}`;
    const dup = await this.idempotencyService.isProcessed('loyalty', idemKey, cafeId);
    if (dup.duplicated) {
      return { success: false, message: 'المكافأة sudah استخدمت.' };
    }

    const rule = await this.prisma.loyaltyRule.findUnique({
      where: { id: ruleId },
    });
    if (!rule || rule.cafeId !== cafeId || !rule.enabled) {
      return { success: false, message: 'المكافأة غير متاحة.' };
    }

    if (rule.maxRedemptions && rule.currentRedemptions >= rule.maxRedemptions) {
      return { success: false, message: 'المكافأة خلصت.' };
    }

    if (rule.validTo && new Date(rule.validTo) < new Date()) {
      return { success: false, message: 'المكافأة انتهت صلاحيتها.' };
    }

    if (rule.rewardProductId) {
      const product = await this.prisma.product.findUnique({
        where: { id: rule.rewardProductId },
        select: { active: true },
      });
      if (!product || !product.active) {
        return { success: false, message: 'المنتج غير متاح حالياً.' };
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.loyaltyLedger.create({
        data: {
          cafeId,
          customerId,
          ruleId: rule.id,
          entryType: 'REDEEM',
          points: 0,
          reason: `Redeemed: ${rule.name}`,
          idempotencyKey: idemKey,
          createdBy: 'customer',
        },
      });

      await tx.rewardWallet.update({
        where: { customerId },
        data: {
          totalRedeemed: { increment: 1 },
          currentBalance: { decrement: 1 },
        },
      });

      await tx.loyaltyRule.update({
        where: { id: rule.id },
        data: { currentRedemptions: { increment: 1 } },
      });
    });

    return {
      success: true,
      message: `🎉 تم استخدام المكافأة: ${rule.name}`,
      discount: rule.rewardType === 'DISCOUNT' ? Number(rule.rewardValue || 0) : undefined,
    };
  }

  // ── Tier Management ──

  async getCustomerTier(cafeId: string, customerId: string): Promise<{ tier: string; totalOrders: number }> {
    const tier = await this.prisma.customerTier.findUnique({ where: { customerId } });
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { totalOrders: true },
    });
    return {
      tier: tier?.tier || 'STANDARD',
      totalOrders: customer?.totalOrders || 0,
    };
  }

  async computeTier(customerId: string, cafeId: string): Promise<string> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { totalOrders: true, totalSpent: true },
    });
    if (!customer) return 'STANDARD';

    let tier = 'STANDARD';
    if (customer.totalOrders >= 50 || Number(customer.totalSpent) >= 5000) tier = 'VIP';
    else if (customer.totalOrders >= 20 || Number(customer.totalSpent) >= 2000) tier = 'LOYAL';
    else if (customer.totalOrders >= 10 || Number(customer.totalSpent) >= 500) tier = 'REGULAR';

    await this.prisma.customerTier.upsert({
      where: { customerId },
      create: { cafeId, customerId, tier, totalOrdersAtTier: customer.totalOrders },
      update: { tier, totalOrdersAtTier: customer.totalOrders },
    });

    return tier;
  }

  // ── Analytics ──

  async getLoyaltyAnalytics(cafeId: string): Promise<{
    activeCustomers: number;
    earnRate: number;
    redemptionRate: number;
    unredeemedRewards: number;
    compensationCost: number;
  }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const ledgerEntries = await this.prisma.loyaltyLedger.findMany({
      where: { cafeId, createdAt: { gte: thirtyDaysAgo } },
    });

    const earnCount = ledgerEntries.filter(e => e.entryType === 'EARN').length;
    const redeemCount = ledgerEntries.filter(e => e.entryType === 'REDEEM').length;
    const activeCustomers = new Set(ledgerEntries.map(e => e.customerId)).size;

    const unredeemed = await this.prisma.loyaltyLedger.count({
      where: { cafeId, entryType: 'EARN' },
    });

    const compensations = await this.prisma.compensation.findMany({
      where: { cafeId, createdAt: { gte: thirtyDaysAgo } },
      select: { value: true },
    });
    const compCost = compensations.reduce((s, c) => s + Number(c.value || 0), 0);

    return {
      activeCustomers,
      earnRate: ledgerEntries.length > 0 ? Math.round((earnCount / ledgerEntries.length) * 100) : 0,
      redemptionRate: earnCount > 0 ? Math.round((redeemCount / earnCount) * 100) : 0,
      unredeemedRewards: unredeemed,
      compensationCost: compCost,
    };
  }
}

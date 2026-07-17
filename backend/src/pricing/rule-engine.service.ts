import { Injectable } from '@nestjs/common';
import { DynamicPricingRule, DynamicPricingRuleType } from '@prisma/client';
import {
  RuleEvaluationContext,
  ApplicableRule,
  PricingBreakdown,
  PricingRuleConditions,
} from './interfaces/pricing.interface';

@Injectable()
export class RuleEngine {
  evaluate(
    rules: DynamicPricingRule[],
    context: RuleEvaluationContext,
    currency: string = 'SAR',
  ): PricingBreakdown {
    const applicable: ApplicableRule[] = [];

    const sorted = [...rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sorted) {
      if (!rule.enabled) continue;
      if (!this.isInDateRange(rule, context.dateTime)) continue;
      if (!this.meetsConditions(rule, context)) continue;
      if (!this.appliesToProduct(rule, context)) continue;

      const result = this.applyRule(rule, context.currentPrice);
      if (result) {
        applicable.push(result);
      }
    }

    const resolved = this.resolveConflicts(applicable);
    const finalPrice = this.calculateFinalPrice(context.currentPrice, resolved);

    return {
      basePrice: context.currentPrice,
      finalPrice,
      totalDiscount: context.currentPrice - finalPrice,
      appliedRules: resolved,
      currency,
    };
  }

  private isInDateRange(rule: DynamicPricingRule, dateTime: Date): boolean {
    if (rule.validFrom && dateTime < rule.validFrom) return false;
    if (rule.validTo && dateTime > rule.validTo) return false;
    if (rule.maxRedemptions !== null && rule.maxRedemptions !== undefined &&
        rule.currentRedemptions >= rule.maxRedemptions) return false;
    return true;
  }

  private meetsConditions(rule: DynamicPricingRule, context: RuleEvaluationContext): boolean {
    const conditions = rule.conditions as PricingRuleConditions;
    if (!conditions) return true;

    if (rule.ruleType === DynamicPricingRuleType.TIME_WINDOW) {
      if (conditions.startTime || conditions.endTime) {
        const hour = context.hour;
        const minute = context.dateTime.getMinutes();
        const currentMinutes = hour * 60 + minute;

        if (conditions.startTime) {
          const [sh, sm] = conditions.startTime.split(':').map(Number);
          if (currentMinutes < sh * 60 + (sm || 0)) return false;
        }
        if (conditions.endTime) {
          const [eh, em] = conditions.endTime.split(':').map(Number);
          if (currentMinutes > eh * 60 + (em || 0)) return false;
        }
      }
    }

    if (rule.ruleType === DynamicPricingRuleType.DAY_OF_WEEK) {
      if (conditions.daysOfWeek && conditions.daysOfWeek.length > 0) {
        if (!conditions.daysOfWeek.includes(context.dayOfWeek)) return false;
      }
    }

    if (rule.ruleType === DynamicPricingRuleType.MINIMUM_QUANTITY) {
      if (conditions.minQuantity !== undefined && context.quantity < conditions.minQuantity) return false;
      if (conditions.maxQuantity !== undefined && context.quantity > conditions.maxQuantity) return false;
    }

    return true;
  }

  private appliesToProduct(rule: DynamicPricingRule, context: RuleEvaluationContext): boolean {
    if (rule.productIds && Array.isArray(rule.productIds) && rule.productIds.length > 0) {
      if (!context.productId) return false;
      const ids = rule.productIds as string[];
      if (!ids.includes(context.productId)) return false;
    }

    if (rule.categoryIds && Array.isArray(rule.categoryIds) && rule.categoryIds.length > 0) {
      if (!context.categoryId) return false;
      const ids = rule.categoryIds as string[];
      if (!ids.includes(context.categoryId)) return false;
    }

    return true;
  }

  private applyRule(rule: DynamicPricingRule, currentPrice: number): ApplicableRule | null {
    const val = Number(rule.value);

    switch (rule.ruleType) {
      case DynamicPricingRuleType.FIXED_DISCOUNT: {
        const discount = Math.min(val, currentPrice);
        return {
          rule,
          adjustedPrice: currentPrice - discount,
          discount,
          discountType: 'fixed',
          reason: `Fixed discount of ${val} ${rule.currency}`,
        };
      }
      case DynamicPricingRuleType.PERCENTAGE_DISCOUNT: {
        const pct = Math.min(val, 100);
        const discount = Math.round((currentPrice * pct) / 100 * 100) / 100;
        return {
          rule,
          adjustedPrice: currentPrice - discount,
          discount,
          discountType: 'percentage',
          reason: `${pct}% discount`,
        };
      }
      case DynamicPricingRuleType.PRICE_OVERRIDE: {
        return {
          rule,
          adjustedPrice: val,
          discount: currentPrice - val,
          discountType: 'override',
          reason: `Price override to ${val} ${rule.currency}`,
        };
      }
      case DynamicPricingRuleType.CATEGORY_DISCOUNT: {
        const pct = Math.min(val, 100);
        const discount = Math.round((currentPrice * pct) / 100 * 100) / 100;
        return {
          rule,
          adjustedPrice: currentPrice - discount,
          discount,
          discountType: 'percentage',
          reason: `Category discount: ${pct}% off`,
        };
      }
      case DynamicPricingRuleType.TIME_WINDOW: {
        const pct = Math.min(val, 100);
        const discount = Math.round((currentPrice * pct) / 100 * 100) / 100;
        return {
          rule,
          adjustedPrice: currentPrice - discount,
          discount,
          discountType: 'percentage',
          reason: `Time window: ${pct}% off`,
        };
      }
      case DynamicPricingRuleType.DAY_OF_WEEK: {
        const pct = Math.min(val, 100);
        const discount = Math.round((currentPrice * pct) / 100 * 100) / 100;
        return {
          rule,
          adjustedPrice: currentPrice - discount,
          discount,
          discountType: 'percentage',
          reason: `Day of week: ${pct}% off`,
        };
      }
      case DynamicPricingRuleType.MINIMUM_QUANTITY: {
        const pct = Math.min(val, 100);
        const discount = Math.round((currentPrice * pct) / 100 * 100) / 100;
        return {
          rule,
          adjustedPrice: currentPrice - discount,
          discount,
          discountType: 'percentage',
          reason: `Quantity discount: ${pct}% off`,
        };
      }
    }
  }

  private resolveConflicts(rules: ApplicableRule[]): ApplicableRule[] {
    const seenTypes = new Set<DynamicPricingRuleType>();
    const result: ApplicableRule[] = [];

    const overrideRule = rules.find(r => r.rule.ruleType === DynamicPricingRuleType.PRICE_OVERRIDE);
    if (overrideRule) {
      return [overrideRule];
    }

    for (const rule of rules) {
      if (seenTypes.has(rule.rule.ruleType)) continue;
      seenTypes.add(rule.rule.ruleType);
      result.push(rule);
    }

    return result;
  }

  private calculateFinalPrice(basePrice: number, rules: ApplicableRule[]): number {
    let price = basePrice;

    for (const rule of rules) {
      switch (rule.discountType) {
        case 'fixed':
        case 'percentage':
          price -= rule.discount;
          break;
        case 'override':
          price = rule.adjustedPrice;
          break;
      }
    }

    return Math.max(0, Math.round(price * 100) / 100);
  }
}

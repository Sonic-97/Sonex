import { DynamicPricingRule, DynamicPricingRuleType } from '@prisma/client';

export interface RuleEvaluationContext {
  productId?: string;
  categoryId?: string;
  category?: string;
  quantity: number;
  currentPrice: number;
  dateTime: Date;
  dayOfWeek: number;
  hour: number;
}

export interface ApplicableRule {
  rule: DynamicPricingRule;
  adjustedPrice: number;
  discount: number;
  discountType: 'fixed' | 'percentage' | 'override';
  reason: string;
}

export interface PricingBreakdown {
  basePrice: number;
  finalPrice: number;
  totalDiscount: number;
  appliedRules: ApplicableRule[];
  currency: string;
}

export interface PricingRuleConditions {
  startTime?: string;
  endTime?: string;
  daysOfWeek?: number[];
  minQuantity?: number;
  maxQuantity?: number;
  minOrderValue?: number;
  productIds?: string[];
  categoryIds?: string[];
}

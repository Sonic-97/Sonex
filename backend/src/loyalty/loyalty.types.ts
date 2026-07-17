export type LoyaltyRuleType = 'ORDER_COUNT' | 'SPEND_THRESHOLD' | 'VISIT_COUNT' | 'STREAK' | 'PRODUCT_FREQUENCY';
export type RewardType = 'FREE_PRODUCT' | 'DISCOUNT' | 'SIZE_UPGRADE' | 'FREE_ADDON' | 'POINTS';
export type LedgerEntryType = 'EARN' | 'REDEEM' | 'EXPIRE' | 'ADJUST' | 'REVERSE' | 'COMPENSATE';
export type CustomerTierLevel = 'STANDARD' | 'REGULAR' | 'LOYAL' | 'VIP';
export type ComplaintCategory = 'MISSING_ITEM' | 'WRONG_ITEM' | 'WRONG_CUSTOMIZATION' | 'TEMPERATURE' | 'QUALITY' | 'DELAY' | 'PAYMENT' | 'DELIVERY' | 'OTHER';
export type CompensationType = 'FREE_PRODUCT' | 'DISCOUNT' | 'ACCOUNT_CREDIT' | 'DELIVERY_FEE_REFUND' | 'HUMAN_CONTACT';

export interface LoyaltyRuleConfig {
  ruleId: string;
  cafeId: string;
  name: string;
  type: LoyaltyRuleType;
  scopeProductIds?: string[];
  scopeCategoryIds?: string[];
  conditionCount: number;
  conditionMinValue?: number;
  rewardType: RewardType;
  rewardProductId?: string;
  rewardValue?: number;
  validFrom?: string;
  validTo?: string;
  maxRedemptions?: number;
  currentRedemptions: number;
  enabled: boolean;
  requiresOwnerApproval: boolean;
  autoCompensation: boolean;
}

export interface LoyaltyProgress {
  ruleId: string;
  ruleName: string;
  ruleType: LoyaltyRuleType;
  current: number;
  target: number;
  percentage: number;
  rewardType: RewardType;
  rewardDescription: string;
  rewardProductId?: string;
  progressText: string;
}

export interface RewardWalletState {
  currentBalance: number;
  totalEarned: number;
  totalRedeemed: number;
  lifetimeEarned: number;
  availableRewards: AvailableReward[];
  progresses: LoyaltyProgress[];
}

export interface AvailableReward {
  ruleId: string;
  ruleName: string;
  rewardType: RewardType;
  rewardDescription: string;
  rewardProductId?: string;
  rewardValue?: number;
  expiresAt?: string;
  canRedeem: boolean;
}

export interface MilestoneEvent {
  type: string;
  customerId: string;
  cafeId: string;
  orderId?: string;
  totalOrders: number;
}

export interface PostOrderFeedback {
  orderId: string;
  customerId: string;
  cafeId: string;
  satisfied: boolean;
  category?: string;
  comment?: string;
}

export interface ComplaintInput {
  cafeId: string;
  customerId: string;
  orderId?: string;
  category?: ComplaintCategory;
  description?: string;
}

export interface CompensationInput {
  cafeId: string;
  customerId: string;
  complaintId?: string;
  orderId?: string;
  type: CompensationType;
  productId?: string;
  value?: number;
  ownerApproved: boolean;
}

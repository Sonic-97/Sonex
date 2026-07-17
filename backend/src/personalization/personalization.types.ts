export type PersonalizationLevel = 0 | 1 | 2 | 3;
export type ConversationStyle = 'FAST' | 'GUIDED' | 'EXPLORING' | 'MINIMAL';
export type ConfidenceLevel = 'EXPLICIT' | 'STRONG' | 'MEDIUM' | 'WEAK' | 'UNKNOWN';
export type PaymentMethod = 'CASH' | 'INSTANT_PAYMENT' | 'WEEKLY_ACCOUNT' | 'MONTHLY_ACCOUNT' | 'PREPAID_BALANCE';

export interface DeliveryLocation {
  name: string;
  description?: string;
  notes?: string;
}

export interface UsualOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  coffeeRoast?: string;
  coffeeBlend?: string;
  coffeeSugar?: string;
  notes?: string;
  unitPrice: number;
}

export interface UsualOrder {
  items: UsualOrderItem[];
  total: number;
  deliveryLocation?: DeliveryLocation;
  paymentMethod?: PaymentMethod;
  sourceOrderId: string;
  branchId: string;
}

export interface CoffeePreferences {
  roast?: string;
  blend?: string;
  sugar?: string;
  roastConfidence: ConfidenceLevel;
  blendConfidence: ConfidenceLevel;
  sugarConfidence: ConfidenceLevel;
}

export interface PersonalizationProfile {
  customerId: string;
  cafeId: string;
  phone: string;
  telegramUserId?: string;
  preferredName?: string;
  deliveryLocation?: DeliveryLocation;
  conversationStyle: ConversationStyle;
  level: PersonalizationLevel;
  levelReason: string;

  orderingProfile: {
    usualOrder?: UsualOrder;
    usualOrderTimes: string[];
    averageOrderValue: number;
    orderFrequency: string;
    totalOrders: number;
    preferredPaymentMethod?: PaymentMethod;
    morningCustomer: boolean;
  };

  coffeePreferences: CoffeePreferences;

  recommendationProfile: {
    acceptedCategories: string[];
    rejectedCategories: string[];
    permanentOptOut: boolean;
  };

  budgetProfile: {
    priceSensitive: boolean;
    budgetRange?: { min: number; max: number };
  };

  optOuts: {
    personalizationDisabled: boolean;
    recommendationsDisabled: boolean;
  };

  hasStrongEvidence: boolean;
  evidenceCount: number;
  lastUpdatedAt: string;
}

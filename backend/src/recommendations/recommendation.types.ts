import { ConversationStyle, CustomerMemoryScope } from '../customer-memory/customer-memory.types';

export type RecommendationType =
  | 'SIZE_UPGRADE'
  | 'PREMIUM_VARIANT'
  | 'ADD_ON'
  | 'EXTRA_SHOT'
  | 'MILK_UPGRADE'
  | 'COMBO_UPGRADE'
  | 'COMPLEMENTARY_PRODUCT'
  | 'ALTERNATIVE_PRODUCT'
  | 'BUDGET_RECOMMENDATION'
  | 'PERSONALIZED_RECOMMENDATION'
  | 'TIME_BASED_RECOMMENDATION'
  | 'OFFER_BASED_RECOMMENDATION'
  | 'AVAILABILITY_ALTERNATIVE';

export type RecommendationMode = 'PROACTIVE' | 'CUSTOMER_REQUEST' | 'UNAVAILABLE_ALTERNATIVE';
export type RecommendationRejectionType = 'CURRENT_ORDER_ONLY' | 'TEMPORARY' | 'PERMANENT';

export interface RecommendationRelationship {
  primaryProductId: string;
  recommendedProductId: string;
  relationshipType: 'COMPLEMENTARY' | 'PREMIUM_VARIANT' | 'ALTERNATIVE';
  priority: number;
  enabled: boolean;
  branchRestrictions?: string[];
  allowedHours?: number[];
  fulfillmentMethods?: string[];
}

export interface RecommendationComboOffer {
  id: string;
  productIds: string[];
  comboPrice: number;
  enabled: boolean;
  startsAt?: string;
  endsAt?: string;
  branchRestrictions?: string[];
}

export interface RecommendationWeights {
  customerPreference: number;
  compatibility: number;
  orderRelevance: number;
  offerValue: number;
  priceSuitability: number;
  historicalAcceptance: number;
  timeRelevance: number;
  inventoryHealth: number;
  marginContribution: number;
  preparationSimplicity: number;
  customerExperience: number;
}

export interface OwnerRecommendationRules {
  enableUpselling: boolean;
  enableCrossSelling: boolean;
  enableComboSuggestions: boolean;
  enableOptOutMemory: boolean;
  maximumSuggestionsPerOrder: number;
  maximumPriceIncrease: number;
  minimumConfidence: number;
  blockedProductIds: string[];
  blockedCategories: string[];
  allowedHours: number[];
  allowedBranchIds: string[];
  useProfitabilityWeight: boolean;
  useCustomerHistoryWeight: boolean;
  overloadedQueueThreshold: number;
  relationships: RecommendationRelationship[];
  comboOffers: RecommendationComboOffer[];
  weights: RecommendationWeights;
  experimentsEnabled: boolean;
}

export interface RecommendationCartItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  variantId?: string;
  variantName?: string;
  category?: string;
  addOnIds?: string[];
}

export interface RecommendationConstraints {
  budget?: number;
  cheapest?: boolean;
  temperature?: 'HOT' | 'COLD';
  sweetness?: 'NO_SUGAR' | 'LOW_SUGAR' | 'SWEET';
  caffeine?: 'CAFFEINATED' | 'DECAF';
  category?: string;
  size?: 'SMALL' | 'MEDIUM' | 'LARGE';
  light?: boolean;
}

export interface RecommendationSessionState {
  commercialSuggestionsShown: number;
  upsellShown: boolean;
  crossSellShown: boolean;
  rejectedCandidateKeys: string[];
  shownCandidateKeys: string[];
  optOut: boolean;
  complaint: boolean;
  frustrated: boolean;
  repeatedMisunderstanding: boolean;
  urgent: boolean;
  queueDepth?: number;
}

export interface RecommendationContext {
  cafeId: string;
  branchId: string;
  customerId?: string;
  memoryScope?: CustomerMemoryScope;
  channel: 'TELEGRAM' | 'WHATSAPP' | 'WEB' | 'IN_CAFE';
  mode: RecommendationMode;
  currentMessage?: string;
  cart: RecommendationCartItem[];
  constraints?: RecommendationConstraints;
  unavailableProductId?: string;
  fulfillmentMethod?: string;
  deliveryFee?: number;
  conversationStyle?: ConversationStyle;
  session: RecommendationSessionState;
  now?: Date;
}

export interface RecommendationCandidate {
  type: RecommendationType;
  productId: string;
  productName: string;
  category: string;
  variantId?: string;
  variantName?: string;
  baseProductId?: string;
  reason: string;
  currentPrice: number;
  discountedPrice: number | null;
  estimatedAddedValue: number;
  customerRelevance: number;
  businessRelevance: number;
  confidence: number;
  expiresAt: string | null;
  trackingKey: string;
  trackingId?: string;
  bundleItems?: Array<{ productId: string; productName: string; quantity: number; unitPrice: number }>;
  metadata?: {
    compatibility?: number;
    lowStock?: boolean;
    inferredRelationship?: boolean;
    priceBefore?: number;
    regularBundlePrice?: number;
  };
}

export interface RecommendationDecision {
  recommendations: RecommendationCandidate[];
  suppressedReason?: string;
  clarification?: string;
  latencyMs: number;
}

export interface RecommendationMetrics {
  recommendationOpportunities: number;
  recommendationsShown: number;
  recommendationsAccepted: number;
  recommendationsRejected: number;
  upsellAcceptanceRate: number;
  crossSellAcceptanceRate: number;
  incrementalOrderValue: number;
  averageOrderValueBefore: number;
  averageOrderValueAfter: number;
  orderCompletionRate: number;
  abandonmentRate: number;
  averageMessagesPerOrder: number;
  repeatedSuggestionViolations: number;
  unavailableRecommendationRate: number;
  optOutRate: number;
  complaintsAfterSuggestions: number;
  averageRecommendationLatencyMs: number;
  averageRecommendationConfidence: number;
}

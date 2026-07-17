export const DEEP_CUSTOMER_INTENTS = [
  'QUICK_ORDER',
  'REPEAT_USUAL_ORDER',
  'ENERGY_REQUEST',
  'MOOD_IMPROVEMENT_REQUEST',
  'LIGHT_DRINK_REQUEST',
  'STRONG_DRINK_REQUEST',
  'COLD_DRINK_REQUEST',
  'HOT_DRINK_REQUEST',
  'LOW_SUGAR_REQUEST',
  'SWEET_REQUEST',
  'BUDGET_REQUEST',
  'BREAKFAST_REQUEST',
  'LIGHT_FOOD_REQUEST',
  'FILLING_FOOD_REQUEST',
  'GROUP_ORDER_REQUEST',
  'EXPLORATION_REQUEST',
  'NEW_PRODUCT_REQUEST',
  'SAFE_FAMILIAR_CHOICE',
  'SCHEDULED_ORDER',
  'URGENT_DELIVERY_REQUEST',
  'HELP_ME_CHOOSE',
  'CUSTOMIZATION_REQUEST',
  'COMPLAINT',
  'HUMAN_ASSISTANCE',
  'UNKNOWN_NEED',
] as const;

export type DeepCustomerIntent = (typeof DEEP_CUSTOMER_INTENTS)[number];
export type DesiredEffect = 'ENERGY' | 'RELAXATION' | 'REFRESHMENT' | 'HUNGER_RELIEF' | 'SWEET_CRAVING' | 'QUICK_BREAK' | 'SOCIAL_SHARING' | 'ROUTINE';
export type NeedUrgency = 'LOW' | 'NORMAL' | 'HIGH' | 'IMMEDIATE';
export type BudgetSensitivity = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXPLICIT_LIMIT';
export type NoveltyPreference = 'FAMILIAR' | 'OPEN_TO_NEW' | 'WANTS_NEW' | 'UNSURE';
export type NeedConversationStyle = 'FAST' | 'GUIDED' | 'EXPLORING';
export type TemperaturePreference = 'HOT' | 'COLD' | 'ANY';
export type SweetnessPreference = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'ANY';
export type CaffeinePreference = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type FoodPreference = 'NONE' | 'LIGHT' | 'BREAKFAST' | 'FILLING';
export type TimingPreference = 'NOW' | 'SCHEDULED' | 'FLEXIBLE';
export type NeedConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export const PRODUCT_UNDERSTANDING_TAGS = [
  'CAFFEINATED',
  'HIGH_CAFFEINE',
  'LOW_CAFFEINE',
  'CAFFEINE_FREE',
  'HOT',
  'COLD',
  'LOW_SUGAR',
  'SWEET',
  'LIGHT',
  'FILLING',
  'BREAKFAST',
  'QUICK_PREP',
  'PORTABLE',
  'BUDGET',
  'PREMIUM',
  'FAMILIAR',
  'NEW',
] as const;

export type ProductUnderstandingTag = (typeof PRODUCT_UNDERSTANDING_TAGS)[number];

export interface CustomerNeed {
  primaryIntent: DeepCustomerIntent;
  intents: DeepCustomerIntent[];
  desiredEffect: DesiredEffect | null;
  urgency: NeedUrgency | null;
  budgetSensitivity: BudgetSensitivity | null;
  budgetMax: number | null;
  novelty: NoveltyPreference | null;
  conversationStyle: NeedConversationStyle | null;
  temperature: TemperaturePreference | null;
  sweetness: SweetnessPreference | null;
  caffeine: CaffeinePreference | null;
  food: FoodPreference | null;
  timing: TimingPreference | null;
  scheduledFor: string | null;
  groupSize: number | null;
  confidence: number;
  confidenceLevel: NeedConfidence;
  evidence: string[];
  currentOverrides: string[];
  morningFastMode: boolean;
}

export type NeedClarificationField = 'requestType' | 'temperature' | 'foodWeight' | 'groupSize' | 'scheduledFor' | 'budget' | 'goal';

export interface NeedClarification {
  field: NeedClarificationField;
  question: string;
}

export interface CustomerNeedMemory {
  conversationStyle?: NeedConversationStyle;
  temperature?: TemperaturePreference;
  sweetness?: SweetnessPreference;
  novelty?: NoveltyPreference;
}

export interface NeedRecommendation {
  productId: string;
  productName: string;
  category: string;
  categoryId: string | null;
  unitPrice: number;
  deliveryFee: number;
  finalPrice: number;
  currency: 'EGP';
  tags: ProductUnderstandingTag[];
  matchedTags: ProductUnderstandingTag[];
  reason: string;
  score: number;
}

export interface NeedCatalogProduct {
  id: string;
  cafeId: string;
  branchId: string | null;
  name: string;
  category: string;
  categoryId: string | null;
  active: boolean;
  price: number;
  branchPrice?: number;
  branchAvailable?: boolean;
  tags: ProductUnderstandingTag[];
  recentOrderCount?: number;
}

export type CustomerUnderstandingAction =
  | 'PASS_THROUGH'
  | 'ASK_CLARIFICATION'
  | 'SEARCH_RELEVANT_PRODUCTS'
  | 'REPEAT_USUAL_ORDER'
  | 'OFFER_HUMAN_HANDOFF'
  | 'HUMAN_HANDOFF_CREATED'
  | 'ACKNOWLEDGE_COMPLAINT'
  | 'SCHEDULED_ORDER_UNSUPPORTED';

export interface CustomerUnderstandingInput {
  cafeId: string;
  branchId: string;
  customerId?: string;
  channel: 'TELEGRAM' | 'WHATSAPP' | 'WEB';
  channelIdentity: string;
  message: string;
  lastBotQuestion?: NeedClarificationField;
  draftNeed?: CustomerNeed;
  clarificationCount?: number;
  memory?: CustomerNeedMemory;
  recentProductIds?: string[];
  addressLabel?: string;
  deliveryFee?: number;
  now?: Date;
}

export interface CustomerUnderstandingResult {
  handled: boolean;
  action: CustomerUnderstandingAction;
  need: CustomerNeed;
  clarification?: NeedClarification;
  recommendations: NeedRecommendation[];
  reply: string;
  handoffAvailable: boolean;
}

export interface CustomerUnderstandingMetrics {
  messagesToProductSelectionAverage: number;
  clarificationCount: number;
  recommendationRelevance: number;
  customerRejectionRate: number;
  fullMenuDumpRate: number;
  orderCompletionRate: number;
  averageOrderCompletionMs: number;
  abandonedConversations: number;
  repeatedMisunderstandings: number;
  humanHandoffRate: number;
  successfulUsualOrderUsage: number;
  budgetConstraintViolations: number;
  urgencyResponseSuccess: number;
  customerFeedbackPositiveRate: number;
  totalUnderstandingRequests: number;
  recommendationsShown: number;
  productSelections: number;
  completedOrders: number;
  tenantScope: string;
}

export function emptyCustomerNeed(): CustomerNeed {
  return {
    primaryIntent: 'UNKNOWN_NEED',
    intents: ['UNKNOWN_NEED'],
    desiredEffect: null,
    urgency: null,
    budgetSensitivity: null,
    budgetMax: null,
    novelty: null,
    conversationStyle: null,
    temperature: null,
    sweetness: null,
    caffeine: null,
    food: null,
    timing: null,
    scheduledFor: null,
    groupSize: null,
    confidence: 0.25,
    confidenceLevel: 'LOW',
    evidence: [],
    currentOverrides: [],
    morningFastMode: false,
  };
}

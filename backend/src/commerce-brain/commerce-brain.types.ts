export interface BusinessConfiguration {
  personality?: string;
  language?: string;
  greetingStyle?: string;
  workingNow?: boolean;
  deliveryAvailable?: boolean;
  pickupAvailable?: boolean;
  promotionEnabled?: boolean;
}

export interface BusinessContext {
  id: string;
  name: string;
  businessType: string;
  language: string;
  timezone: string;
  personality: string;
  greetingStyle: string;
  workingNow: boolean;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  promotionEnabled: boolean;
}

export interface CustomerContext {
  customerId: string;
  firstName: string;
  preferredLanguage: string;
  favoriteProducts: string[];
  recentOrders: Array<{ items: string[]; date: string; total: string }>;
  savedAddresses: string[];
  loyaltySummary: { totalOrders: number; totalSpent: string };
}

export interface ConversationContext {
  currentIntent?: string;
  currentStep: string;
  collectedInformation: Record<string, unknown>;
  missingInformation: string[];
}

export interface CatalogProduct {
  productId: string;
  name: string;
  category: string;
  available: boolean;
  variants: Array<{ name: string; type: string; priceAdjust?: number }>;
  requiredOptions: Array<{ name: string; choices: string[] }>;
  optionalOptions: Array<{ name: string; choices: string[] }>;
}

export interface CatalogContext {
  products: CatalogProduct[];
  totalCount: number;
}

export interface ActiveOrderItem {
  productName: string;
  quantity: number;
  selectedOptions: Array<{ optionId: string; choiceLabel: string }>;
  lineTotal: string;
}

export interface ActiveOrderContext {
  items: ActiveOrderItem[];
  runningTotal: string;
  deliveryMethod: string;
}

export interface CommerceContext {
  business: BusinessContext;
  customer?: CustomerContext;
  conversation: ConversationContext;
  catalog: CatalogContext;
  activeOrder?: ActiveOrderContext;
}

export interface BuildContextInput {
  cafeId: string;
  customerId?: string;
  message: string;
  currentStep?: string;
  collectedInformation?: Record<string, unknown>;
  missingInformation?: string[];
  currentIntent?: string;
}

export type CommerceIntent =
  | 'ORDER'
  | 'MODIFY_ORDER'
  | 'CANCEL_ORDER'
  | 'REORDER'
  | 'ASK_PRODUCT'
  | 'ASK_PRICE'
  | 'ASK_HOURS'
  | 'ASK_DELIVERY'
  | 'ASK_PAYMENT'
  | 'ASK_PROMOTION'
  | 'SMALL_TALK'
  | 'UNKNOWN';

export type NextAction =
  | 'ASK_OPTION'
  | 'ASK_QUANTITY'
  | 'CONFIRM_ORDER'
  | 'CREATE_ORDER'
  | 'MODIFY_ORDER'
  | 'CANCEL_ORDER'
  | 'SHOW_PRODUCTS'
  | 'SHOW_RECOMMENDATIONS'
  | 'ANSWER_INFORMATION'
  | 'ESCALATE_TO_HUMAN'
  | 'NO_ACTION';

export interface MissingField {
  field: string;
  required: boolean;
  choices?: string[];
  reason?: string;
}

export interface Recommendation {
  productId: string;
  reason: string;
  priority: number;
}

export interface StructuredReplyData {
  title?: string;
  bodyKey: string;
  buttonIds?: string[];
  variables?: Record<string, string>;
}

export interface ExtractedEntities {
  productNames?: string[];
  quantities?: Array<{ productName: string; quantity: number }>;
  variant?: string;
  option?: string;
  paymentMethod?: string;
  address?: string;
  phone?: string;
  language?: string;
}

export type ReasoningCode =
  | 'PRODUCT_NOT_FOUND'
  | 'OPTION_REQUIRED'
  | 'LOW_CONFIDENCE'
  | 'BUSINESS_CLOSED'
  | 'CUSTOMER_NOT_FOUND'
  | 'ORDER_READY'
  | 'PAYMENT_REQUIRED'
  | 'MULTIPLE_MATCHES'
  | 'AMBIGUOUS_INTENT'
  | 'PRICE_NOT_FOUND'
  | 'REORDER_FOUND'
  | 'PROMOTION_AVAILABLE'
  | 'DELIVERY_UNAVAILABLE'
  | 'HOURS_KNOWN'
  | 'CONTINUE_CONVERSATION'
  | 'NO_ACTION_NEEDED';

export interface AiCommerceDecision {
  intent: CommerceIntent;
  confidence: number;
  requiredConfirmation: boolean;
  missingInformation: MissingField[];
  recommendations: Recommendation[];
  nextAction: NextAction;
  structuredReplyData: StructuredReplyData;
  extractedEntities: ExtractedEntities;
  reasoningCode: ReasoningCode;
}

export const ALL_INTENTS: CommerceIntent[] = [
  'ORDER', 'MODIFY_ORDER', 'CANCEL_ORDER', 'REORDER',
  'ASK_PRODUCT', 'ASK_PRICE', 'ASK_HOURS', 'ASK_DELIVERY',
  'ASK_PAYMENT', 'ASK_PROMOTION', 'SMALL_TALK', 'UNKNOWN',
];

export const ALL_NEXT_ACTIONS: NextAction[] = [
  'ASK_OPTION', 'ASK_QUANTITY', 'CONFIRM_ORDER', 'CREATE_ORDER',
  'MODIFY_ORDER', 'CANCEL_ORDER', 'SHOW_PRODUCTS', 'SHOW_RECOMMENDATIONS',
  'ANSWER_INFORMATION', 'ESCALATE_TO_HUMAN', 'NO_ACTION',
];

export const ALL_REASONING_CODES: ReasoningCode[] = [
  'PRODUCT_NOT_FOUND', 'OPTION_REQUIRED', 'LOW_CONFIDENCE',
  'BUSINESS_CLOSED', 'CUSTOMER_NOT_FOUND', 'ORDER_READY',
  'PAYMENT_REQUIRED', 'MULTIPLE_MATCHES', 'AMBIGUOUS_INTENT',
  'PRICE_NOT_FOUND', 'REORDER_FOUND', 'PROMOTION_AVAILABLE',
  'DELIVERY_UNAVAILABLE', 'HOURS_KNOWN', 'CONTINUE_CONVERSATION',
  'NO_ACTION_NEEDED',
];

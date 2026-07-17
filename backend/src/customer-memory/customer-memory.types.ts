export const CUSTOMER_MEMORY_KEY = '__sonexMemoryV2';

export type MemoryChannel = 'TELEGRAM' | 'WHATSAPP' | 'WEB' | 'IN_CAFE';
export type ConversationStyle = 'FAST' | 'GUIDED' | 'EXPLORING';
export type CoffeePreferenceField = 'roast' | 'blend' | 'sugar';

export interface CustomerMemoryScope {
  cafeId: string;
  customerId: string;
  channel: MemoryChannel;
  channelIdentity: string;
  botIdentity?: string;
}

export interface PreferenceCandidate {
  count: number;
  firstObservedAt: string;
  lastObservedAt: string;
}

export interface InferredPreferenceSignal {
  value: string;
  confidence: number;
  evidenceCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
  expiresAt: string;
  candidates: Record<string, PreferenceCandidate>;
}

export interface ExplicitCustomerPreferences {
  preferredProducts: string[];
  preferredSizes: Record<string, string>;
  preferredTemperature: Record<string, string>;
  coffeeRoast?: string;
  coffeeBlend?: string;
  sugarPreference?: string;
  preferredAddOns: string[];
  dislikedIngredients: string[];
  disableUpselling: boolean;
}

export interface InferredCustomerPreferences {
  preferredProducts: Record<string, InferredPreferenceSignal>;
  preferredSizes: Record<string, InferredPreferenceSignal>;
  preferredTemperature: Record<string, InferredPreferenceSignal>;
  coffeeRoast?: InferredPreferenceSignal;
  coffeeBlend?: InferredPreferenceSignal;
  sugarPreference?: InferredPreferenceSignal;
  preferredAddOns: Record<string, InferredPreferenceSignal>;
  rejectedAddOns: Record<string, InferredPreferenceSignal>;
  typicalOrderTimes: Record<string, InferredPreferenceSignal>;
}

export interface MemoryAuditEntry {
  action: string;
  fields: string[];
  at: string;
}

export interface CustomerMemoryRecord {
  version: 2;
  cafeId: string;
  customerId: string;
  channel: MemoryChannel;
  channelIdentityHash: string;
  preferredName?: string;
  preferredLanguage?: string;
  conversationStyle?: ConversationStyle;
  explicitPreferences: ExplicitCustomerPreferences;
  inferredPreferences: InferredCustomerPreferences;
  processedOrderHashes: string[];
  audit: MemoryAuditEntry[];
  lastUpdatedAt: string;
}

export interface CustomerMemoryEnvelope {
  version: 2;
  channels: Record<string, CustomerMemoryRecord>;
}

export interface OrderMemoryObservation {
  orderId: string;
  status: string;
  occurredAt?: Date;
  isTest?: boolean;
  isDuplicate?: boolean;
  products?: string[];
  preferredSize?: string;
  preferredTemperature?: string;
  coffeeRoast?: string;
  coffeeBlend?: string;
  sugarPreference?: string;
  addOns?: string[];
  rejectedAddOns?: string[];
}

export interface CoffeeMemoryDraft {
  roast?: string;
  blend?: string;
  sugar?: string;
}

export interface CoffeeMemoryAssist {
  draft: CoffeeMemoryDraft;
  memoryFields: CoffeePreferenceField[];
  sources: Partial<Record<CoffeePreferenceField, 'EXPLICIT' | 'INFERRED' | 'CURRENT'>>;
  requiresConfirmation: boolean;
}

export interface RepeatOrderItemPreview {
  productId: string;
  productName: string;
  quantity: number;
  notes?: string;
  previousUnitPrice: number;
  currentUnitPrice?: number;
  priceChanged: boolean;
  available: boolean;
}

export interface RepeatOrderPreview {
  sourceOrderId: string;
  branchId: string;
  items: RepeatOrderItemPreview[];
  currentTotal: number;
  unavailableItems: RepeatOrderItemPreview[];
  priceChanged: boolean;
  requiresConfirmation: true;
  canConfirmAll: boolean;
}

export type ExplicitMemoryCommand =
  | { type: 'SET_NAME'; value: string }
  | { type: 'SET_LANGUAGE'; value: string }
  | { type: 'SET_STYLE'; value: ConversationStyle }
  | { type: 'SET_SUGAR'; value: string }
  | { type: 'SET_ROAST'; value: string }
  | { type: 'SET_BLEND'; value: string }
  | { type: 'SET_SIZE'; value: string }
  | { type: 'SET_TEMPERATURE'; value: string }
  | { type: 'ADD_DISLIKED_INGREDIENT'; value: string }
  | { type: 'REMOVE_DISLIKED_INGREDIENT'; value: string }
  | { type: 'DISABLE_SUGGESTIONS' }
  | { type: 'REMOVE_PREFERENCE'; field: string }
  | { type: 'RESET_PREFERENCES' };

export interface ExplicitCommandResult {
  handled: boolean;
  response?: string;
  command?: ExplicitMemoryCommand;
  preferredName?: string;
}

export interface CustomerMemorySummary {
  preferredName?: string;
  language?: string;
  conversationStyle?: ConversationStyle;
  strongPreferences: Record<string, string | boolean | string[]>;
}

export interface CustomerMemoryMetrics {
  knownCustomerPercentage: number;
  repeatOrderUsage: number;
  averageQuestionsPerCompletedOrder: number;
  memoryAssistedOrderCompletionRate: number;
  customerCorrections: number;
  quickOrderAcceptanceRate: number;
  memoryRejectionRate: number;
  failedMemoryLookups: number;
  crossTenantAccessRejections: number;
  averageOrderCompletionMs: number;
}

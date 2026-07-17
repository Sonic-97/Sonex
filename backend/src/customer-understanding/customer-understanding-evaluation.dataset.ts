import { DeepCustomerIntent } from './customer-need.types';

export interface CustomerUnderstandingEvaluationCase {
  id: string;
  message: string;
  stateBefore: Record<string, unknown>;
  customerMemory: Record<string, unknown>;
  expectedPrimaryIntent: DeepCustomerIntent;
  expectedNeed: Record<string, unknown>;
  expectedAction: string;
  forbiddenActions: string[];
  acceptableReplyCharacteristics: string[];
}

export const CUSTOMER_UNDERSTANDING_EVALUATION_DATASET: CustomerUnderstandingEvaluationCase[] = [
  {
    id: 'morning-quick-order', message: 'صباح الخير عايز حاجة تفوقني على السريع', stateBefore: {}, customerMemory: {},
    expectedPrimaryIntent: 'ENERGY_REQUEST', expectedNeed: { desiredEffect: 'ENERGY', urgency: 'HIGH' }, expectedAction: 'SEARCH_RELEVANT_PRODUCTS',
    forbiddenActions: ['SHOW_FULL_MENU'], acceptableReplyCharacteristics: ['short', 'maximum_three_options'],
  },
  {
    id: 'tired-customer', message: 'انا تعبان وعايز حاجة تفوقني', stateBefore: {}, customerMemory: {},
    expectedPrimaryIntent: 'ENERGY_REQUEST', expectedNeed: { desiredEffect: 'ENERGY' }, expectedAction: 'SEARCH_RELEVANT_PRODUCTS',
    forbiddenActions: ['DIAGNOSE_CUSTOMER'], acceptableReplyCharacteristics: ['grounded_products'],
  },
  {
    id: 'budget-request', message: 'معايا 70 جنيه بس', stateBefore: {}, customerMemory: {},
    expectedPrimaryIntent: 'BUDGET_REQUEST', expectedNeed: { budgetMax: 70 }, expectedAction: 'ASK_CLARIFICATION',
    forbiddenActions: ['IGNORE_BUDGET'], acceptableReplyCharacteristics: ['one_question'],
  },
  {
    id: 'mood-request', message: 'مخنوق وعايز حاجة تروقني', stateBefore: {}, customerMemory: {},
    expectedPrimaryIntent: 'MOOD_IMPROVEMENT_REQUEST', expectedNeed: { desiredEffect: 'RELAXATION' }, expectedAction: 'SEARCH_RELEVANT_PRODUCTS',
    forbiddenActions: ['MEDICAL_CLAIM', 'EMOTIONAL_UPSELL'], acceptableReplyCharacteristics: ['empathetic'],
  },
  {
    id: 'light-breakfast', message: 'عايز فطار خفيف', stateBefore: {}, customerMemory: {},
    expectedPrimaryIntent: 'BREAKFAST_REQUEST', expectedNeed: { food: 'LIGHT' }, expectedAction: 'SEARCH_RELEVANT_PRODUCTS',
    forbiddenActions: ['SHOW_FULL_MENU'], acceptableReplyCharacteristics: ['maximum_three_options'],
  },
  {
    id: 'cold-low-sugar', message: 'عايز حاجة ساقعة ومش مسكرة', stateBefore: {}, customerMemory: {},
    expectedPrimaryIntent: 'COLD_DRINK_REQUEST', expectedNeed: { temperature: 'COLD', sweetness: 'LOW' }, expectedAction: 'SEARCH_RELEVANT_PRODUCTS',
    forbiddenActions: ['INVENT_PRODUCT_EFFECT'], acceptableReplyCharacteristics: ['verified_tags'],
  },
  {
    id: 'new-product', message: 'عايز اجرب حاجة جديدة', stateBefore: {}, customerMemory: {},
    expectedPrimaryIntent: 'NEW_PRODUCT_REQUEST', expectedNeed: { novelty: 'WANTS_NEW' }, expectedAction: 'SEARCH_RELEVANT_PRODUCTS',
    forbiddenActions: ['REPEAT_USUAL'], acceptableReplyCharacteristics: ['new_tag_only'],
  },
  {
    id: 'familiar-order', message: 'هات المعتاد', stateBefore: {}, customerMemory: {},
    expectedPrimaryIntent: 'REPEAT_USUAL_ORDER', expectedNeed: { novelty: 'FAMILIAR' }, expectedAction: 'REPEAT_USUAL_ORDER',
    forbiddenActions: ['SHOW_FULL_MENU'], acceptableReplyCharacteristics: ['confirm_current_price'],
  },
  {
    id: 'urgent-order', message: 'الطلب يوصل حالا ضروري', stateBefore: {}, customerMemory: {},
    expectedPrimaryIntent: 'URGENT_DELIVERY_REQUEST', expectedNeed: { urgency: 'IMMEDIATE', timing: 'NOW' }, expectedAction: 'SEARCH_RELEVANT_PRODUCTS',
    forbiddenActions: ['PROMISE_UNVERIFIED_ETA'], acceptableReplyCharacteristics: ['quick_prep_only'],
  },
  {
    id: 'unclear-phrase', message: 'هاتلي الحكاية اللي في دماغي', stateBefore: {}, customerMemory: {},
    expectedPrimaryIntent: 'UNKNOWN_NEED', expectedNeed: {}, expectedAction: 'ASK_CLARIFICATION',
    forbiddenActions: ['SHOW_FULL_MENU'], acceptableReplyCharacteristics: ['one_question'],
  },
  {
    id: 'mixed-language', message: 'عايز cold drink low sugar under 100', stateBefore: {}, customerMemory: {},
    expectedPrimaryIntent: 'COLD_DRINK_REQUEST', expectedNeed: { temperature: 'COLD', sweetness: 'LOW', budgetMax: 100 }, expectedAction: 'SEARCH_RELEVANT_PRODUCTS',
    forbiddenActions: ['IGNORE_BUDGET'], acceptableReplyCharacteristics: ['maximum_three_options'],
  },
  {
    id: 'spelling-mistake', message: 'عايز حاجه تصحصهني ومش مسكره', stateBefore: {}, customerMemory: {},
    expectedPrimaryIntent: 'ENERGY_REQUEST', expectedNeed: { desiredEffect: 'ENERGY', sweetness: 'LOW' }, expectedAction: 'SEARCH_RELEVANT_PRODUCTS',
    forbiddenActions: ['SHOW_FULL_MENU'], acceptableReplyCharacteristics: ['egyptian_arabic'],
  },
  {
    id: 'voice-text-error', message: 'عايز حاجه تفوق ني علي السريع', stateBefore: {}, customerMemory: {},
    expectedPrimaryIntent: 'ENERGY_REQUEST', expectedNeed: { urgency: 'HIGH' }, expectedAction: 'SEARCH_RELEVANT_PRODUCTS',
    forbiddenActions: ['LONG_CONVERSATION'], acceptableReplyCharacteristics: ['short'],
  },
  {
    id: 'multi-constraint', message: 'عايز حاجة تفوقني ومش مسكرة وتحت 100', stateBefore: {}, customerMemory: {},
    expectedPrimaryIntent: 'ENERGY_REQUEST', expectedNeed: { sweetness: 'LOW', budgetMax: 100 }, expectedAction: 'SEARCH_RELEVANT_PRODUCTS',
    forbiddenActions: ['SHOW_FULL_MENU', 'IGNORE_BUDGET'], acceptableReplyCharacteristics: ['mentions_real_prices'],
  },
  {
    id: 'second-order-same-day', message: 'كمان واحد زي اللي فات', stateBefore: { ordersToday: 1 }, customerMemory: {},
    expectedPrimaryIntent: 'REPEAT_USUAL_ORDER', expectedNeed: { desiredEffect: 'ROUTINE' }, expectedAction: 'REPEAT_USUAL_ORDER',
    forbiddenActions: ['USE_OTHER_CUSTOMER_ORDER'], acceptableReplyCharacteristics: ['recent_order'],
  },
  {
    id: 'current-overrides-memory', message: 'النهارده عايزها ساقعة ومش مسكرة', stateBefore: {}, customerMemory: { temperature: 'HOT', sweetness: 'HIGH' },
    expectedPrimaryIntent: 'COLD_DRINK_REQUEST', expectedNeed: { temperature: 'COLD', sweetness: 'LOW' }, expectedAction: 'SEARCH_RELEVANT_PRODUCTS',
    forbiddenActions: ['PREFER_MEMORY_OVER_CURRENT'], acceptableReplyCharacteristics: ['current_request_wins'],
  },
  {
    id: 'shop-address-only', message: 'وصل الطلب عند كافيه النور', stateBefore: { addressLabel: 'كافيه النور' }, customerMemory: {},
    expectedPrimaryIntent: 'UNKNOWN_NEED', expectedNeed: {}, expectedAction: 'PASS_THROUGH',
    forbiddenActions: ['MERGE_CUSTOMERS_BY_SHOP'], acceptableReplyCharacteristics: ['individual_identity'],
  },
];

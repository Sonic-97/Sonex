export interface RecommendationEvaluationCase {
  id: string;
  stateBefore: Record<string, unknown>;
  customerMessage: string;
  currentCart: Array<Record<string, unknown>>;
  customerMemory: Record<string, unknown>;
  availableProducts: string[];
  ownerRules: Record<string, unknown>;
  expectedRecommendationType: string | null;
  allowedCandidates: string[];
  forbiddenCandidates: string[];
  expectedStateAfter: string;
  acceptableReplyCharacteristics: string[];
}

export const RECOMMENDATION_EVALUATION_DATASET: RecommendationEvaluationCase[] = [
  {
    id: 'size-upgrade-accepted', stateBefore: { step: 'RECOMMENDATION_PENDING' },
    customerMessage: 'أيوه خليها وسط', currentCart: [{ productId: 'latte', size: 'SMALL', price: 60 }],
    customerMemory: {}, availableProducts: ['latte:MEDIUM'], ownerRules: { maximumPriceIncrease: 20 },
    expectedRecommendationType: 'SIZE_UPGRADE', allowedCandidates: ['latte:MEDIUM'], forbiddenCandidates: ['latte:LARGE'],
    expectedStateAfter: 'SUMMARY', acceptableReplyCharacteristics: ['updated size', 'real total', 'confirmation required'],
  },
  {
    id: 'size-upgrade-rejected', stateBefore: { step: 'RECOMMENDATION_PENDING' },
    customerMessage: 'لا', currentCart: [{ productId: 'latte', size: 'SMALL' }], customerMemory: {},
    availableProducts: ['latte:MEDIUM'], ownerRules: {}, expectedRecommendationType: null,
    allowedCandidates: [], forbiddenCandidates: ['latte:MEDIUM'], expectedStateAfter: 'SUMMARY',
    acceptableReplyCharacteristics: ['order preserved', 'no cancellation'],
  },
  {
    id: 'cross-sell-rejected', stateBefore: { step: 'RECOMMENDATION_PENDING' }, customerMessage: 'مش عايز كرواسون',
    currentCart: [{ productId: 'coffee' }], customerMemory: {}, availableProducts: ['croissant'], ownerRules: {},
    expectedRecommendationType: null, allowedCandidates: [], forbiddenCandidates: ['croissant'], expectedStateAfter: 'SUMMARY',
    acceptableReplyCharacteristics: ['brief acknowledgement', 'no repeated pressure'],
  },
  {
    id: 'customer-opt-out', stateBefore: { step: 'NOTES' }, customerMessage: 'من غير اقتراحات',
    currentCart: [{ productId: 'coffee' }], customerMemory: {}, availableProducts: ['croissant'], ownerRules: {},
    expectedRecommendationType: null, allowedCandidates: [], forbiddenCandidates: ['croissant'], expectedStateAfter: 'SUMMARY',
    acceptableReplyCharacteristics: ['opt-out acknowledged', 'ordering continues'],
  },
  {
    id: 'price-sensitive', stateBefore: { step: 'CATEGORY' }, customerMessage: 'معايا 50 جنيه', currentCart: [],
    customerMemory: {}, availableProducts: ['tea', 'coffee', 'cake'], ownerRules: {},
    expectedRecommendationType: 'BUDGET_RECOMMENDATION', allowedCandidates: ['tea'], forbiddenCandidates: ['cake'],
    expectedStateAfter: 'RECOMMENDATION_CHOICES', acceptableReplyCharacteristics: ['price visible', 'within budget'],
  },
  {
    id: 'cheapest-item', stateBefore: { step: 'CATEGORY' }, customerMessage: 'عايز الأرخص', currentCart: [],
    customerMemory: {}, availableProducts: ['tea', 'coffee'], ownerRules: {}, expectedRecommendationType: 'BUDGET_RECOMMENDATION',
    allowedCandidates: ['tea'], forbiddenCandidates: [], expectedStateAfter: 'RECOMMENDATION_CHOICES',
    acceptableReplyCharacteristics: ['current price', 'short list'],
  },
  {
    id: 'asked-recommendation', stateBefore: { step: 'CATEGORY' }, customerMessage: 'اقترحلي حاجة ساقعة', currentCart: [],
    customerMemory: {}, availableProducts: ['iced-americano', 'hot-coffee'], ownerRules: {},
    expectedRecommendationType: 'TIME_BASED_RECOMMENDATION', allowedCandidates: ['iced-americano'], forbiddenCandidates: ['hot-coffee'],
    expectedStateAfter: 'RECOMMENDATION_CHOICES', acceptableReplyCharacteristics: ['at most three choices'],
  },
  {
    id: 'favorite-unavailable', stateBefore: { step: 'PRODUCT_SELECT' }, customerMessage: 'لاتيه', currentCart: [],
    customerMemory: { preferredProducts: ['latte'] }, availableProducts: ['cappuccino'], ownerRules: {},
    expectedRecommendationType: 'AVAILABILITY_ALTERNATIVE', allowedCandidates: ['cappuccino'], forbiddenCandidates: ['latte'],
    expectedStateAfter: 'RECOMMENDATION_CHOICES', acceptableReplyCharacteristics: ['unavailable explained', 'no silent replacement'],
  },
  {
    id: 'complaint-state', stateBefore: { complaint: true }, customerMessage: 'الطلب اتأخر',
    currentCart: [{ productId: 'coffee' }], customerMemory: {}, availableProducts: ['croissant'], ownerRules: {},
    expectedRecommendationType: null, allowedCandidates: [], forbiddenCandidates: ['croissant'], expectedStateAfter: 'SUMMARY',
    acceptableReplyCharacteristics: ['no commercial suggestion'],
  },
  {
    id: 'overloaded-cafe', stateBefore: { queueDepth: 15 }, customerMessage: '', currentCart: [{ productId: 'coffee' }],
    customerMemory: {}, availableProducts: ['simple-cookie', 'complex-dessert'], ownerRules: { overloadedQueueThreshold: 10 },
    expectedRecommendationType: 'COMPLEMENTARY_PRODUCT', allowedCandidates: ['simple-cookie'], forbiddenCandidates: ['complex-dessert'],
    expectedStateAfter: 'RECOMMENDATION_PENDING', acceptableReplyCharacteristics: ['no time guarantee'],
  },
  {
    id: 'low-stock-product', stateBefore: {}, customerMessage: '', currentCart: [{ productId: 'coffee' }],
    customerMemory: {}, availableProducts: ['low-stock-cake', 'croissant'], ownerRules: {},
    expectedRecommendationType: 'COMPLEMENTARY_PRODUCT', allowedCandidates: ['croissant'], forbiddenCandidates: ['low-stock-cake'],
    expectedStateAfter: 'RECOMMENDATION_PENDING', acceptableReplyCharacteristics: ['available item only'],
  },
  {
    id: 'explicit-combo', stateBefore: {}, customerMessage: '', currentCart: [{ productId: 'coffee', price: 60 }],
    customerMemory: {}, availableProducts: ['coffee', 'croissant'], ownerRules: { comboPrice: 80 },
    expectedRecommendationType: 'COMBO_UPGRADE', allowedCandidates: ['combo-coffee-croissant'], forbiddenCandidates: [],
    expectedStateAfter: 'RECOMMENDATION_PENDING', acceptableReplyCharacteristics: ['real saving', 'confirmation requested'],
  },
  {
    id: 'foreign-cafe-product', stateBefore: {}, customerMessage: '', currentCart: [{ productId: 'coffee' }],
    customerMemory: {}, availableProducts: ['foreign-pastry'], ownerRules: {}, expectedRecommendationType: null,
    allowedCandidates: [], forbiddenCandidates: ['foreign-pastry'], expectedStateAfter: 'SUMMARY',
    acceptableReplyCharacteristics: ['tenant isolation'],
  },
  {
    id: 'repeated-suggestion', stateBefore: { shownCandidateKeys: ['SIZE_UPGRADE:latte:medium'] }, customerMessage: '',
    currentCart: [{ productId: 'latte' }], customerMemory: {}, availableProducts: ['latte:medium'], ownerRules: {},
    expectedRecommendationType: null, allowedCandidates: [], forbiddenCandidates: ['latte:medium'], expectedStateAfter: 'SUMMARY',
    acceptableReplyCharacteristics: ['no repetition'],
  },
  {
    id: 'multi-item-order', stateBefore: {}, customerMessage: '',
    currentCart: [{ productId: 'coffee', quantity: 2 }, { productId: 'croissant', quantity: 2 }], customerMemory: {},
    availableProducts: ['croissant'], ownerRules: {}, expectedRecommendationType: null, allowedCandidates: [],
    forbiddenCandidates: ['croissant'], expectedStateAfter: 'SUMMARY', acceptableReplyCharacteristics: ['no duplicate cross-sell'],
  },
  {
    id: 'contextual-no', stateBefore: { step: 'RECOMMENDATION_PENDING' }, customerMessage: 'لا',
    currentCart: [{ productId: 'coffee' }], customerMemory: {}, availableProducts: ['croissant'], ownerRules: {},
    expectedRecommendationType: null, allowedCandidates: [], forbiddenCandidates: ['croissant'], expectedStateAfter: 'SUMMARY',
    acceptableReplyCharacteristics: ['suggestion rejected', 'order not cancelled'],
  },
  {
    id: 'reject-and-modify', stateBefore: { step: 'RECOMMENDATION_PENDING' }, customerMessage: 'لا، خليها كبيرة',
    currentCart: [{ productId: 'latte', size: 'SMALL' }], customerMemory: {}, availableProducts: ['croissant', 'latte:LARGE'],
    ownerRules: {}, expectedRecommendationType: 'SIZE_UPGRADE', allowedCandidates: ['latte:LARGE'], forbiddenCandidates: ['croissant'],
    expectedStateAfter: 'SUMMARY', acceptableReplyCharacteristics: ['cross-sell rejected', 'requested size applied'],
  },
];

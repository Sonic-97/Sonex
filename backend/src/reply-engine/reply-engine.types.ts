export type ReplyMode =
  | 'FAST'
  | 'NORMAL'
  | 'GUIDED'
  | 'EXPLORING'
  | 'COMPLAINT'
  | 'ACCOUNT'
  | 'TRACKING'
  | 'ERROR_RECOVERY';

export type ReplyPurpose =
  | 'UNDERSTAND'
  | 'CLARIFY'
  | 'CONFIRM'
  | 'INFORM'
  | 'RECOMMEND'
  | 'CORRECT'
  | 'APOLOGIZE'
  | 'TRACK'
  | 'SUPPORT'
  | 'CLOSE';

export interface ReplyButton {
  label: string;
  action: string;
  extra?: string;
}

export interface StructuredReply {
  mode: ReplyMode;
  purpose: ReplyPurpose;
  message: string;
  buttons?: ReplyButton[][];
  factsUsed: string[];
  requiresHuman: boolean;
  contextPreserved: boolean;
}

export interface ReplyContext {
  customerName?: string;
  customerId?: string;
  isNewCustomer: boolean;
  isReturningCustomer: boolean;
  isMorning: boolean;
  hasUsualOrder: boolean;
  hasActiveOrder: boolean;
  hasUrgentSignal: boolean;
  currentDraft?: {
    items?: { name: string; quantity: number; price: number }[];
    total?: number;
    deliveryLocation?: string;
    paymentMethod?: string;
  };
  lastBotQuestion?: string;
  lastBotPurpose?: ReplyPurpose;
  customerMessage: string;
  rejectedSuggestions: string[];
  clarificationCount: number;
  orderStatus?: string;
  deliveryEstimate?: string;
  balance?: number;
  balanceDueDate?: string;
  productUnavailable?: string;
  priceChanged?: { product: string; oldPrice: number; newPrice: number };
  errorMessage?: string;
  cafeName?: string;
  customerGender?: 'male' | 'female' | 'unknown';
  conversationStyle?: string;
  loyaltyPoints?: number;
  hasComplaint?: boolean;
  hasMisunderstanding?: boolean;
  isFirstMessage: boolean;
  sessionActive: boolean;
}

export interface YesNoResult {
  isYes: boolean;
  isNo: boolean;
  confidence: number;
  rawInput: string;
}

export const EGYPTIAN_ACKNOWLEDGMENTS = [
  'تمام',
  'حاضر',
  'وصلت',
  'ماشي',
  'أيوه كده',
  'تمام فهمتك',
  'حلو',
  'تم',
];

export const EGYPTIAN_YES_PATTERNS = [
  'ايوه', 'أيوه', 'اه', 'آه', 'أه', 'yeah', 'yes', 'yep',
  'طيب', 'ماشي', 'ok', 'okay', 'تمام',
  'قصدى كده', 'قصدي كده',
];

export const EGYPTIAN_NO_PATTERNS = [
  'لا', 'لأ', 'na', 'no', 'nope',
  'مش', 'مش كده', 'مش ده',
  'غير', 'لا شكرا', 'لا مش عايز',
  'متقترحليش',
];

export const URGENT_SIGNAL_PATTERNS = [
  'مستعجل', 'بسرعة', 'ورايا شغل', 'خلصني', 'بسرعه',
  'please fast', 'hurry', 'asap',
];

export const GREETING_RESPONSES = {
  firstTime: [
    'أهلًا بيك 👋\nأنا مساعد Sonex للطلبات.\nتحب تطلب مشروب ولا فطار خفيف؟',
  ],
  morningReturning: [
    'صباح الخير يا {name} ☀️\nأكرر المعتاد؟',
    'صباح النور يا {name}\nنكرر طلبك المعتاد؟',
  ],
  returning: [
    'أهلًا يا {name} ☕\نورتنا مرة تانية.\nنكرر المعتاد ولا حاجة جديدة؟',
  ],
  activeOrder: [
    'طلبك بيتجهز دلوقتي.\nتحب تتابعه؟',
  ],
};

export const ORDER_CONFIRMED_RESPONSES = [
  'طلبك اتأكد ✅',
  'اتأكد طلبك ✅',
  'تمام، طلبك اتأكد ✅',
];

export const CLOSING_RESPONSES = {
  afterConfirm: [
    'تمام، طلبك اتأكد.',
    'تم.',
    'ماشي.',
  ],
  afterDeliveryFeedback: [
    'بالهنا والشفا.',
    'صحة وهنا.',
    'هنيًا.',
  ],
  afterRejectedSuggestion: [
    'تمام.',
    'ماشي.',
    'حاضر.',
  ],
};

export const CONFIRMATION_QUESTIONS = [
  'أأكد؟',
  'أثبت الطلب؟',
  'نطلبه كده؟',
  'نأكد؟',
];

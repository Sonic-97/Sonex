import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { Prisma } from '@prisma/client';
import { IdempotencyService } from '../common/idempotency.service';
import { CustomerLearningService } from '../customer-learning/customer-learning.service';
import { CoffeeAttributeExtractor, CoffeeAttributes, CoffeeIntent } from './coffee-attribute-extractor';
import { StructuredUnderstandingService } from '../ai-orchestration/structured-understanding.service';
import { CustomerMemoryService } from '../customer-memory/customer-memory.service';
import { CoffeePreferenceField, CustomerMemoryScope } from '../customer-memory/customer-memory.types';
import { RecommendationService } from '../recommendations/recommendation.service';
import { RecommendationCandidate, RecommendationContext } from '../recommendations/recommendation.types';
import { PersonalizationProfileService } from '../personalization/personalization-profile.service';
import { PersonalizationProfile, PersonalizationLevel, ConversationStyle } from '../personalization/personalization.types';
import { ReplyEngineService } from '../reply-engine/reply-engine.service';
import { ReplyContext } from '../reply-engine/reply-engine.types';

export enum CoffeeStep {
  AWAITING_CUSTOMER_NAME = 'COFFEE_AWAITING_CUSTOMER_NAME',
  AWAITING_ORDER = 'COFFEE_AWAITING_ORDER',
  AWAITING_COFFEE_ROAST = 'COFFEE_AWAITING_COFFEE_ROAST',
  AWAITING_COFFEE_BLEND = 'COFFEE_AWAITING_COFFEE_BLEND',
  AWAITING_COFFEE_SUGAR = 'COFFEE_AWAITING_COFFEE_SUGAR',
  AWAITING_QUANTITY = 'COFFEE_AWAITING_QUANTITY',
  AWAITING_CONFIRMATION = 'COFFEE_AWAITING_CONFIRMATION',
  AWAITING_MODIFICATION = 'COFFEE_AWAITING_MODIFICATION',
  AWAITING_RECOMMENDATION = 'COFFEE_AWAITING_RECOMMENDATION',
  ORDER_CONFIRMED = 'COFFEE_ORDER_CONFIRMED',
  CANCELLED = 'COFFEE_CANCELLED',
}

export interface CoffeeOrderSession {
  phone: string;
  replyJid?: string;
  cafeId?: string;
  branchId?: string;
  step: CoffeeStep;
  customerName?: string;
  customerId?: string;
  lastBotQuestion?: string;

  intent?: string;
  coffeeRoast?: string;
  coffeeBlend?: string;
  coffeeSugar?: string;
  quantity: number;
  notes: string[];

  productId?: string;
  productName?: string;
  productPrice?: number;

  pendingModification?: string;
  memoryPrefilledFields?: CoffeePreferenceField[];
  startedAt?: number;
  questionCount?: number;
  recommendationAttempted?: boolean;
  recommendationOptOut?: boolean;
  pendingRecommendation?: RecommendationCandidate;
  shownRecommendationKeys?: string[];
  rejectedRecommendationKeys?: string[];
  commercialSuggestionsShown?: number;
  selectedSizeId?: string;
  selectedSizeName?: string;
  recommendationItems?: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;

  personalizationLevel?: PersonalizationLevel;
  conversationStyle?: ConversationStyle;
  personalizationOptOut?: boolean;
  profileLoaded?: boolean;
}

@Injectable()
export class CoffeeOrderService {
  private readonly logger = new Logger(CoffeeOrderService.name);
  private readonly useRedis: boolean;

  private sessions: Map<string, CoffeeOrderSession> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly idempotencyService: IdempotencyService,
    private readonly customerLearningService: CustomerLearningService,
    private readonly extractor: CoffeeAttributeExtractor,
    private readonly understanding: StructuredUnderstandingService,
    private readonly customerMemory: CustomerMemoryService,
    private readonly recommendations: RecommendationService,
    private readonly personalization: PersonalizationProfileService,
    private readonly replyEngine: ReplyEngineService,
  ) {
    this.useRedis = process.env.ORDERFLOW_USE_REDIS === 'true';
  }

  private buildReplyCtx(overrides: Partial<ReplyContext> = {}): ReplyContext {
    return {
      customerName: undefined,
      customerId: undefined,
      isNewCustomer: false,
      isReturningCustomer: false,
      isMorning: false,
      hasUsualOrder: false,
      hasActiveOrder: false,
      hasUrgentSignal: false,
      customerMessage: '',
      rejectedSuggestions: [],
      clarificationCount: 0,
      isFirstMessage: true,
      sessionActive: true,
      ...overrides,
    };
  }

  async hasSession(phone: string): Promise<boolean> {
    if (this.useRedis) return false; // Redis not yet wired for coffee sessions
    return this.sessions.has(phone);
  }

  async getSession(phone: string): Promise<CoffeeOrderSession | null> {
    if (this.useRedis) return null;
    return this.sessions.get(phone) ?? null;
  }

  private async saveSession(phone: string, session: CoffeeOrderSession): Promise<void> {
    if (this.useRedis) {
      // TODO: wire Redis for coffee sessions
    }
    this.sessions.set(phone, session);
  }

  async deleteSession(phone: string): Promise<void> {
    if (this.useRedis) {
      // TODO: wire Redis
    }
    this.sessions.delete(phone);
  }

  async startCoffeeFlow(phone: string, cafeId: string, replyJid?: string, knownName?: string): Promise<string> {
    let branchId: string | undefined;
    const branch = await this.prisma.branch.findFirst({ where: { cafeId }, select: { id: true } });
    branchId = branch?.id;

    let customerId: string | undefined;
    if (knownName && cafeId && branchId) {
      const existing = await this.prisma.customer.findUnique({
        where: { cafeId_branchId_phone: { cafeId, branchId: branchId, phone } },
        select: { id: true, name: true },
      });
      if (existing) {
        knownName = existing.name || knownName;
        customerId = existing.id;
      }
    }

    let profile: PersonalizationProfile | undefined;
    let level: PersonalizationLevel = 0;
    let style: ConversationStyle = 'GUIDED';
    if (customerId && cafeId) {
      try {
        profile = await this.personalization.getProfile(cafeId, customerId, phone);
        level = profile.level;
        style = profile.conversationStyle;
      } catch {}
    }

    const session: CoffeeOrderSession = {
      phone,
      replyJid: replyJid && !replyJid.includes('@lid') ? replyJid : undefined,
      cafeId,
      branchId,
      step: knownName ? CoffeeStep.AWAITING_ORDER : CoffeeStep.AWAITING_CUSTOMER_NAME,
      customerName: knownName,
      customerId,
      quantity: 1,
      notes: [],
      startedAt: Date.now(),
      questionCount: 0,
      recommendationAttempted: false,
      recommendationItems: [],
      shownRecommendationKeys: [],
      rejectedRecommendationKeys: [],
      commercialSuggestionsShown: 0,
      personalizationLevel: level,
      conversationStyle: style,
      personalizationOptOut: profile?.optOuts?.personalizationDisabled || false,
      profileLoaded: true,
    };

    session.profileLoaded = true;
    await this.saveSession(phone, session);

    if (knownName) {
      session.lastBotQuestion = 'order';
      if (style === 'FAST') {
        return `أهلًا ${knownName}، تحب تشرب إيه؟`;
      }
      if (style === 'MINIMAL') {
        return 'عايز إيه؟';
      }
      const isMorning = profile?.orderingProfile?.morningCustomer;
      if (level >= 2 && isMorning && profile?.orderingProfile?.usualOrder) {
        return `صباح الخير يا ${knownName} ☀️\nأكرر طلبك المعتاد؟`;
      }
      return `أهلًا يا ${knownName} 👋 تحب تشرب إيه؟`;
    }

    session.lastBotQuestion = 'name';
    return 'أهلًا بيك في Sonex 👋 ممكن أعرف اسمك؟';
  }

  async handleMessage(phone: string, message: string): Promise<string> {
    const session = this.sessions.get(phone);
    if (!session) {
      return 'عذراً، حدث خطأ. ارسل أي حاجة عشان نبدأ من أول.';
    }

    const trimmed = message.trim();
    if (this.recommendations.isOptOutMessage(trimmed)) {
      session.recommendationOptOut = true;
      this.recommendations.recordOptOut();
      if (session.customerId && session.cafeId) {
        await this.customerMemory.applyExplicitCommand(this.memoryScope(session), trimmed).catch(() => ({ handled: false }));
      }
      if (session.pendingRecommendation) {
        await this.recommendations.recordOutcome(
          this.coffeeRecommendationContext(session, trimmed),
          session.pendingRecommendation,
          false,
          'CURRENT_ORDER_ONLY',
        ).catch(() => undefined);
        session.pendingRecommendation = undefined;
        session.recommendationAttempted = true;
        return `تمام، هنكمل من غير اقتراحات.\n\n${await this.goToConfirmation(session)}`;
      }
      await this.saveSession(phone, session);
      return 'تمام، هنكمل الطلب من غير اقتراحات.';
    }
    if (this.recommendations.isComplaintMessage(trimmed) && session.pendingRecommendation) {
      this.recommendations.recordComplaintAfterSuggestion();
      session.pendingRecommendation = undefined;
      session.recommendationAttempted = true;
      return `حقك عليا، نكمل من غير أي اقتراح.\n\n${await this.goToConfirmation(session)}`;
    }
    if (session.step !== CoffeeStep.AWAITING_CUSTOMER_NAME && session.customerId && session.cafeId) {
      try {
        const memoryResult = await this.customerMemory.applyExplicitCommand(this.memoryScope(session), trimmed);
        if (memoryResult.handled) {
          if (memoryResult.preferredName) session.customerName = memoryResult.preferredName;
          await this.saveSession(phone, session);
          return memoryResult.response!;
        }
      } catch {
        // Preference updates are non-critical to the active order.
      }
    }
    const reply = await this.processStep(session, trimmed);

    if (
      session.step !== CoffeeStep.ORDER_CONFIRMED &&
      session.step !== CoffeeStep.CANCELLED
    ) {
      await this.saveSession(phone, session);
    }

    return reply;
  }

  private async processStep(session: CoffeeOrderSession, message: string): Promise<string> {
    switch (session.step) {
      case CoffeeStep.AWAITING_CUSTOMER_NAME:
        return this.handleNameInput(session, message);
      case CoffeeStep.AWAITING_ORDER:
        return this.handleOrderInput(session, message);
      case CoffeeStep.AWAITING_COFFEE_ROAST:
        return this.handleRoastInput(session, message);
      case CoffeeStep.AWAITING_COFFEE_BLEND:
        return this.handleBlendInput(session, message);
      case CoffeeStep.AWAITING_COFFEE_SUGAR:
        return this.handleSugarInput(session, message);
      case CoffeeStep.AWAITING_QUANTITY:
        return this.handleQuantityInput(session, message);
      case CoffeeStep.AWAITING_CONFIRMATION:
        return this.handleConfirmation(session, message);
      case CoffeeStep.AWAITING_MODIFICATION:
        return this.handleModification(session, message);
      case CoffeeStep.AWAITING_RECOMMENDATION:
        return this.handleRecommendationResponse(session, message);
      default:
        await this.deleteSession(session.phone);
        return 'عذراً، حدث خطأ. ارسل أي حاجة عشان نبدأ من أول.';
    }
  }

  private async handleNameInput(session: CoffeeOrderSession, message: string): Promise<string> {
    const name = message.trim();
    // Reject coffee/food words as names
    if (!name || /^(لا|no|cancel|الغي|moh)|^\d+$/.test(name) || /^(قهوة|قهوه|شاي|نسكافيه|عايز|هات|ممكن)$/.test(name.toLowerCase())) {
      session.lastBotQuestion = 'name';
      return 'اسمك إيه عشان أقدر أخدمك؟';
    }

    session.customerName = name;
    session.step = CoffeeStep.AWAITING_ORDER;

    if (session.cafeId && session.branchId) {
      try {
        const customer = await this.prisma.customer.upsert({
          where: {
            cafeId_branchId_phone: {
              cafeId: session.cafeId,
              branchId: session.branchId,
              phone: session.phone,
            },
          },
          update: { name },
          create: {
            cafeId: session.cafeId,
            branchId: session.branchId,
            phone: session.phone,
            name,
          },
        });
        session.customerId = customer.id;
        await this.customerMemory.savePreferredName(this.memoryScope(session), name);
      } catch {
        // Non-critical — session has name
      }
    }

    session.lastBotQuestion = 'order';
    return `تشرفنا يا ${name}، تحب تشرب إيه؟`;
  }

  private async handleOrderInput(session: CoffeeOrderSession, message: string): Promise<string> {
    const lower = message.toLowerCase().trim();
    const style = session.conversationStyle || 'GUIDED';

    // Check for usual order messages first
    if (await this.personalization.isUsualOrderMessage(message)) {
      return this.handleUsualOrder(session);
    }

    // Check for opt-out/opt-in
    if (session.customerId && session.cafeId) {
      if (await this.personalization.isOptOutMessage(message)) {
        session.personalizationOptOut = true;
        session.recommendationOptOut = true;
        return 'تمام، مش هاستخدم تفضيلاتك القديمة. هعتبر كل طلب جديد من أول وجديد.';
      }
      if (await this.personalization.isOptInMessage(message)) {
        session.personalizationOptOut = false;
        session.recommendationOptOut = false;
        return 'تمام، رجعت التخصيص تاني. هاستخدم تفضيلاتك عشان أخدمك أحسن.';
      }
    }

    const understanding = this.understanding.analyze(message, 'AWAITING_ORDER', {
      roast: session.coffeeRoast,
      blend: session.coffeeBlend,
      sugar: session.coffeeSugar,
      quantity: session.quantity,
    });

    // Check for explicit menu request
    if (understanding.intent === 'SHOW_MENU') {
      return this.showMenu(session);
    }

    // Check for cancellation
    if (understanding.intent === 'CANCEL_ORDER') {
      await this.deleteSession(session.phone);
      session.step = CoffeeStep.CANCELLED;
      return 'تمام، ألغي الطلب. لو عايز حاجة تاني، أنا موجود.';
    }

    // Extract coffee intent
    const intent: CoffeeIntent = this.extractor.extractIntent(lower);
    if (!intent.isCoffee) {
      // Not coffee-related — show menu
      return this.showMenu(session);
    }

    session.intent = 'CREATE_ORDER';
    session.coffeeRoast = understanding.entities.coffee?.roast || intent.roast || undefined;
    session.coffeeBlend = understanding.entities.coffee?.blend || intent.blend || undefined;
    session.coffeeSugar = understanding.entities.coffee?.sugar || intent.sugar || undefined;
    session.quantity = understanding.entities.coffee?.quantity || session.quantity;

    // Apply memory preferences unless opt-out
    if (session.customerId && session.cafeId && !session.personalizationOptOut) {
      try {
        const assisted = await this.customerMemory.resolveCoffeePreferences(this.memoryScope(session), {
          roast: session.coffeeRoast,
          blend: session.coffeeBlend,
          sugar: session.coffeeSugar,
        });
        session.coffeeRoast = assisted.draft.roast;
        session.coffeeBlend = assisted.draft.blend;
        session.coffeeSugar = assisted.draft.sugar;
        session.memoryPrefilledFields = assisted.memoryFields;
      } catch {
        session.memoryPrefilledFields = [];
      }
    }

    // Determine what's missing
    const missing = this.getMissingCoffeeFields(session);

    if (missing.length === 0) {
      return this.goToConfirmation(session);
    }

    // Ask for the first missing field
    return this.askForMissingField(session, missing[0], style);
  }

  private async handleRoastInput(session: CoffeeOrderSession, message: string): Promise<string> {
    const lower = message.toLowerCase().trim();

    if (this.isExplicitCancellation(lower)) {
      await this.deleteSession(session.phone);
      session.step = CoffeeStep.CANCELLED;
      return 'تمام، ألغي الطلب.';
    }

    // Interpret contextually based on lastBotQuestion
    if (this.isNoWord(lower)) {
      // "لا" after roast question doesn't make sense — repeat
      session.lastBotQuestion = 'roast';
      return 'تحب القهوة فاتح، وسط، ولا غامق؟';
    }

    const roast = this.extractor.extractRoast(lower);
    if (!roast) {
      session.lastBotQuestion = 'roast';
      return `أنا فكرتك تقول فاتح ولا وسط ولا غامق. تحب القهوة إيه؟`;
    }

    session.coffeeRoast = roast;
    this.removeMemoryField(session, 'roast');

    const missing = this.getMissingCoffeeFields(session);
    if (missing.length === 0) {
      return this.goToConfirmation(session);
    }

    return this.askForMissingField(session, missing[0], session.conversationStyle);
  }

  private async handleBlendInput(session: CoffeeOrderSession, message: string): Promise<string> {
    const lower = message.toLowerCase().trim();

    if (this.isExplicitCancellation(lower)) {
      await this.deleteSession(session.phone);
      session.step = CoffeeStep.CANCELLED;
      return 'تمام، ألغي الطلب.';
    }

    // Contextual "لا"
    if (this.isNoWord(lower)) {
      // "لا" after "تحبها محوج ولا غير محوج?" means "غير محوج" i.e. PLAIN
      session.coffeeBlend = 'PLAIN';
      this.removeMemoryField(session, 'blend');
      const missing = this.getMissingCoffeeFields(session);
      if (missing.length === 0) {
        return this.goToConfirmation(session);
      }
      return this.askForMissingField(session, missing[0], session.conversationStyle);
    }

    // Try to also check if this message contains roast or sugar info
    const roast = this.extractor.extractRoast(lower);
    const sugar = this.extractor.extractSugar(lower);
    if (roast) session.coffeeRoast = roast;
    if (roast) this.removeMemoryField(session, 'roast');
    if (sugar && !session.coffeeSugar) {
      session.coffeeSugar = sugar;
      this.removeMemoryField(session, 'sugar');
    }

    const blend = this.extractor.extractBlend(lower);
    if (blend) {
      session.coffeeBlend = blend;
      this.removeMemoryField(session, 'blend');
    } else {
      // Could be a plain "لا" missed above, or gibberish
      session.lastBotQuestion = 'blend';
      return 'تحبها محوج ولا غير محوج؟';
    }

    const missing = this.getMissingCoffeeFields(session);
    if (missing.length === 0) {
      return this.goToConfirmation(session);
    }

    return this.askForMissingField(session, missing[0], session.conversationStyle);
  }

  private async handleSugarInput(session: CoffeeOrderSession, message: string): Promise<string> {
    const lower = message.toLowerCase().trim();

    if (this.isExplicitCancellation(lower)) {
      await this.deleteSession(session.phone);
      session.step = CoffeeStep.CANCELLED;
      return 'تمام، ألغي الطلب.';
    }

    // Contextual "لا" after sugar question
    if (this.isNoWord(lower)) {
      session.coffeeSugar = 'NO_SUGAR';
      this.removeMemoryField(session, 'sugar');
      const missing = this.getMissingCoffeeFields(session);
      if (missing.length === 0) {
        return this.goToConfirmation(session);
      }
      return this.askForMissingField(session, missing[0], session.conversationStyle);
    }

    // Try extracting sugar, roast, blend from reply
    const roast = this.extractor.extractRoast(lower);
    const blend = this.extractor.extractBlend(lower);
    if (roast) session.coffeeRoast = roast;
    if (roast) this.removeMemoryField(session, 'roast');
    if (blend) {
      session.coffeeBlend = blend;
      this.removeMemoryField(session, 'blend');
    }

    const sugar = this.extractor.extractSugar(lower);
    if (sugar) {
      session.coffeeSugar = sugar;
      this.removeMemoryField(session, 'sugar');
    } else {
      session.lastBotQuestion = 'sugar';
      return 'السكر من غير، خفيف، مظبوط، ولا زيادة؟';
    }

    const missing = this.getMissingCoffeeFields(session);
    if (missing.length === 0) {
      return this.goToConfirmation(session);
    }

    return this.askForMissingField(session, missing[0], session.conversationStyle);
  }

  private async handleQuantityInput(session: CoffeeOrderSession, message: string): Promise<string> {
    const lower = message.toLowerCase().trim();

    if (this.isExplicitCancellation(lower)) {
      await this.deleteSession(session.phone);
      session.step = CoffeeStep.CANCELLED;
      return 'تمام، ألغي الطلب.';
    }

    const qty = this.extractor.extractQuantity(lower);
    if (qty !== null && qty >= 1) {
      session.quantity = qty;
    } else if (this.isNoWord(lower)) {
      // "لا" after quantity means 1 (keep default)
      session.quantity = 1;
    }

    return this.goToConfirmation(session);
  }

  private async handleConfirmation(session: CoffeeOrderSession, message: string): Promise<string> {
    const lower = message.toLowerCase().trim();

    if (this.isExplicitCancellation(lower)) {
      await this.deleteSession(session.phone);
      session.step = CoffeeStep.CANCELLED;
      return 'تمام، ألغي الطلب. لو عايز حاجة تاني، أنا موجود.';
    }

    // "لا" after confirmation -> modification mode
    if (this.isNoWord(lower)) {
      if (session.memoryPrefilledFields?.length) {
        for (const field of session.memoryPrefilledFields) {
          if (field === 'roast') session.coffeeRoast = undefined;
          if (field === 'blend') session.coffeeBlend = undefined;
          if (field === 'sugar') session.coffeeSugar = undefined;
        }
        session.memoryPrefilledFields = [];
        this.customerMemory.recordMemoryRejection();
      }
      session.step = CoffeeStep.AWAITING_MODIFICATION;
      session.lastBotQuestion = 'modification';
      return 'تمام، تحب تعدل إيه في الطلب؟';
    }

    // Positive confirmation
    if (
      lower === '1' ||
      lower.includes('نعم') ||
      lower.includes('ايوه') ||
      lower.includes('أيوه') ||
      lower.includes('أكد') ||
      lower.includes('confirm') ||
      lower.includes('yes') ||
      lower.includes('ok') ||
      lower.includes('oke') ||
      lower.includes('تمام')
    ) {
      return this.confirmOrder(session);
    }

    // Unknown response — stay in confirmation
    session.lastBotQuestion = 'confirmation';
    return `${this.buildOrderSummary(session)}\n\nأأكد الطلب؟ (نعم/لا)`;
  }

  private async handleModification(session: CoffeeOrderSession, message: string): Promise<string> {
    const lower = message.toLowerCase().trim();

    if (this.isExplicitCancellation(lower)) {
      await this.deleteSession(session.phone);
      session.step = CoffeeStep.CANCELLED;
      return 'تمام، ألغي الطلب.';
    }

    // Extract attributes directly from modification message
    const roast = this.extractor.extractRoast(lower);
    const blend = this.extractor.extractBlend(lower);
    const sugar = this.extractor.extractSugar(lower);

    if (roast) {
      session.coffeeRoast = roast;
      this.removeMemoryField(session, 'roast');
    }
    if (blend) {
      session.coffeeBlend = blend;
      this.removeMemoryField(session, 'blend');
    }
    if (sugar) {
      session.coffeeSugar = sugar;
      this.removeMemoryField(session, 'sugar');
    }

    // Check for specific modification patterns
    if (/^(شيل|من غير|بدون|بلاش)\s/.test(lower)) {
      if (lower.includes('سكر')) {
        session.coffeeSugar = 'NO_SUGAR';
      } else if (lower.includes('محوج') || lower.includes('حوج')) {
        session.coffeeBlend = 'PLAIN';
      }
      return this.goToConfirmation(session);
    }

    if (/زود|زيادة/.test(lower) && /واحد|واحدة/.test(lower)) {
      session.quantity = (session.quantity || 1) + 1;
    }

    // If direct extraction found something, go to confirmation
    if (roast || blend || sugar) {
      return this.goToConfirmation(session);
    }

    // Re-check missing fields
    const missing = this.getMissingCoffeeFields(session);
    if (missing.length > 0) {
      return this.askForMissingField(session, missing[0], session.conversationStyle);
    }

    return this.goToConfirmation(session);
  }

  private getMissingCoffeeFields(session: CoffeeOrderSession): string[] {
    const missing: string[] = [];
    if (!session.coffeeRoast) missing.push('roast');
    if (!session.coffeeBlend) missing.push('blend');
    if (!session.coffeeSugar) missing.push('sugar');
    return missing;
  }

  private async handleUsualOrder(session: CoffeeOrderSession): Promise<string> {
    if (!session.cafeId || !session.customerId) {
      return 'مفيش طلب سابق لسه. تحب تطلب قهوة؟';
    }
    try {
      const profile = await this.personalization.getProfile(session.cafeId, session.customerId, session.phone);
      const usual = profile.orderingProfile.usualOrder;
      if (!usual || usual.items.length === 0) {
        return 'مفيش طلب معتاد لسه. تحب تبدأ طلب جديد؟';
      }
      const items = usual.items.map(i =>
        `${i.quantity}× ${i.productName}${i.coffeeRoast ? ' ' + i.coffeeRoast : ''}${i.coffeeBlend ? ' ' + i.coffeeBlend : ''}${i.coffeeSugar ? ' سكر ' + i.coffeeSugar : ''}`,
      ).join('\n');
      session.coffeeRoast = usual.items[0].coffeeRoast || session.coffeeRoast;
      session.coffeeBlend = usual.items[0].coffeeBlend || session.coffeeBlend;
      session.coffeeSugar = usual.items[0].coffeeSugar || session.coffeeSugar;
      session.quantity = usual.items[0].quantity;
      session.productId = usual.items[0].productId;
      session.productName = usual.items[0].productName;
      session.productPrice = usual.items[0].unitPrice;
      const total = usual.total;
      const loc = usual.deliveryLocation?.name ? `\nالتوصيل: ${usual.deliveryLocation.name}` : '';
      const pay = profile.orderingProfile.preferredPaymentMethod ? `\nالدفع: ${this.paymentLabel(profile.orderingProfile.preferredPaymentMethod)}` : '';
      return `طلبك المعتاد:\n${items}\nالإجمالي: ${total} جنيه${loc}${pay}\n\nأأكد؟`;
    } catch {
      return 'مفيش طلب معتاد لسه. تحب تبدأ طلب جديد؟';
    }
  }

  private async askForMissingField(session: CoffeeOrderSession, field: string, style?: string): Promise<string> {
    session.questionCount = (session.questionCount || 0) + 1;
    const ctx = this.buildReplyCtx({ customerName: session.customerName });
    if (field === 'roast') {
      session.step = CoffeeStep.AWAITING_COFFEE_ROAST;
      session.lastBotQuestion = 'roast';
      return this.replyEngine.clarificationReply(ctx, 'roast').message;
    }

    if (field === 'blend') {
      session.step = CoffeeStep.AWAITING_COFFEE_BLEND;
      session.lastBotQuestion = 'blend';
      return this.replyEngine.clarificationReply(ctx, 'blend').message;
    }

    if (field === 'sugar') {
      session.step = CoffeeStep.AWAITING_COFFEE_SUGAR;
      session.lastBotQuestion = 'sugar';
      return this.replyEngine.clarificationReply(ctx, 'sugar').message;
    }

    return this.goToConfirmation(session);
  }

  private buildOrderSummary(session: CoffeeOrderSession): string {
    const lines: string[] = [session.memoryPrefilledFields?.length ? 'طلبك حسب تفضيلاتك المحفوظة:' : 'طلبك:'];

    const roastMap: Record<string, string> = { LIGHT: 'فاتح', MEDIUM: 'وسط', DARK: 'غامق' };
    const blendMap: Record<string, string> = { PLAIN: 'غير محوج', SPICED: 'محوج' };
    const sugarMap: Record<string, string> = {
      NO_SUGAR: 'من غير سكر',
      LIGHT_SUGAR: 'سكر خفيف',
      MEDIUM_SUGAR: 'مظبوط',
      EXTRA_SUGAR: 'سكر زيادة',
    };

    lines.push(`☕ قهوة ${roastMap[session.coffeeRoast] || ''}`);
    lines.push(`   ${blendMap[session.coffeeBlend] || ''}`);
    lines.push(`   ${sugarMap[session.coffeeSugar] || ''}`);
    lines.push(`   الكمية: ${session.quantity}`);
    if (session.selectedSizeName) lines.push(`   الحجم: ${session.selectedSizeName}`);
    for (const item of session.recommendationItems || []) {
      lines.push(`+ ${item.productName} × ${item.quantity}`);
    }
    if (session.productPrice !== undefined) {
      const total = session.productPrice * session.quantity + (session.recommendationItems || []).reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );
      lines.push(`   الإجمالي: ${total.toFixed(2)} ج`);
    }

    return lines.join('\n');
  }

  private async goToConfirmation(session: CoffeeOrderSession): Promise<string> {
    if (!session.recommendationAttempted && !session.recommendationOptOut && session.cafeId && session.branchId) {
      session.recommendationAttempted = true;
      try {
        const product = await this.matchCoffeeProduct(session.cafeId);
        if (product) {
          session.productId = product.id;
          session.productName = product.name;
          session.productPrice = Number(product.price);
          const context = this.coffeeRecommendationContext(session);
          context.session.queueDepth = await this.loadActiveQueueDepth(session.cafeId, session.branchId);
          const decision = await this.recommendations.recommend(context);
          const candidate = decision.recommendations[0];
          if (candidate) {
            const message = this.recommendations.formatRecommendations([candidate]);
            session.pendingRecommendation = await this.recommendations.markShown(context, candidate, message);
            session.shownRecommendationKeys = [...(session.shownRecommendationKeys || []), candidate.trackingKey];
            session.commercialSuggestionsShown = (session.commercialSuggestionsShown || 0) + 1;
            session.step = CoffeeStep.AWAITING_RECOMMENDATION;
            session.lastBotQuestion = 'recommendation';
            return message;
          }
        }
      } catch {
        // Recommendation failure must never block confirmation.
      }
    }
    session.step = CoffeeStep.AWAITING_CONFIRMATION;
    session.lastBotQuestion = 'confirmation';
    const summary = this.buildOrderSummary(session);
    const confirmQ = this.replyEngine.varyConfirmationQuestion();
    return `${summary}\n\n${confirmQ}`;
  }

  private async handleRecommendationResponse(session: CoffeeOrderSession, message: string): Promise<string> {
    const candidate = session.pendingRecommendation;
    if (!candidate) return this.goToConfirmation(session);
    const lower = message.toLowerCase().trim();
    const context = this.coffeeRecommendationContext(session, message);

    if (/^(لا|no|بلاش|مش عايز)/.test(lower)) {
      await this.recommendations.recordOutcome(context, candidate, false, 'CURRENT_ORDER_ONLY').catch(() => undefined);
      session.rejectedRecommendationKeys = [...(session.rejectedRecommendationKeys || []), candidate.trackingKey];
      session.pendingRecommendation = undefined;
      return `تمام، نكمل الطلب كده.\n\n${await this.goToConfirmation(session)}`;
    }

    if (/^(1|نعم|ايوه|أيوه|yes|ok|تمام|موافق)/.test(lower)) {
      const verified = await this.recommendations.revalidateForAcceptance(context, candidate);
      if (!verified) {
        session.pendingRecommendation = undefined;
        return `الاقتراح مش متاح دلوقتي، نكمل الطلب زي ما هو.\n\n${await this.goToConfirmation(session)}`;
      }
      if (verified.type === 'SIZE_UPGRADE') {
        session.productPrice = verified.currentPrice;
        session.selectedSizeId = verified.variantId;
        session.selectedSizeName = verified.variantName;
      } else if (['ADD_ON', 'EXTRA_SHOT', 'MILK_UPGRADE'].includes(verified.type)) {
        session.productPrice = (session.productPrice || 0) + verified.currentPrice;
        session.notes.push(`إضافة: ${verified.variantName || verified.productName}`);
      } else if (verified.type === 'COMPLEMENTARY_PRODUCT' || verified.type === 'OFFER_BASED_RECOMMENDATION') {
        session.recommendationItems = [
          ...(session.recommendationItems || []),
          { productId: verified.productId, productName: verified.productName, quantity: 1, unitPrice: verified.currentPrice },
        ];
      }
      await this.recommendations.recordOutcome(context, verified, true).catch(() => undefined);
      session.pendingRecommendation = undefined;
      return `تمام، عدلت الطلب.\n\n${await this.goToConfirmation(session)}`;
    }

    return `${this.recommendations.formatRecommendations([candidate])}\nرد بنعم أو لا.`;
  }

  private coffeeRecommendationContext(session: CoffeeOrderSession, currentMessage = ''): RecommendationContext {
    if (!session.cafeId || !session.branchId || !session.productId || session.productPrice === undefined) {
      throw new Error('Missing coffee recommendation scope');
    }
    return {
      cafeId: session.cafeId,
      branchId: session.branchId,
      customerId: session.customerId,
      memoryScope: session.customerId ? this.memoryScope(session) : undefined,
      channel: session.phone.startsWith('tg_') ? 'TELEGRAM' : 'WHATSAPP',
      mode: 'PROACTIVE',
      currentMessage,
      cart: [{
        productId: session.productId,
        quantity: session.quantity,
        unitPrice: session.productPrice,
        variantId: session.selectedSizeId,
        variantName: session.selectedSizeName,
      }],
      fulfillmentMethod: 'DELIVERY',
      session: {
        commercialSuggestionsShown: session.commercialSuggestionsShown || 0,
        upsellShown: Boolean(session.selectedSizeId),
        crossSellShown: Boolean(session.recommendationItems?.length),
        rejectedCandidateKeys: [...(session.rejectedRecommendationKeys || [])],
        shownCandidateKeys: [...(session.shownRecommendationKeys || [])],
        optOut: Boolean(session.recommendationOptOut),
        complaint: false,
        frustrated: false,
        repeatedMisunderstanding: false,
        urgent: false,
      },
    };
  }

  private async loadActiveQueueDepth(cafeId: string, branchId: string): Promise<number> {
    try {
      const [deliveryOrders, inCafeOrders] = await Promise.all([
        this.prisma.order.count({
          where: {
            cafeId,
            branchId,
            status: { in: ['NEW', 'CONFIRMED', 'ACCEPTED', 'PREPARING'] },
          },
        }),
        this.prisma.inCafeOrder.count({
          where: {
            cafeId,
            branchId,
            status: { in: ['NEW', 'PREPARING'] },
          },
        }),
      ]);
      return deliveryOrders + inCafeOrders;
    } catch {
      return 0;
    }
  }

  private async confirmOrder(session: CoffeeOrderSession): Promise<string> {
    try {
      const cafeId = session.cafeId;
      const branchId = session.branchId;
      if (!cafeId || !branchId) throw new Error('Missing cafe or branch');

      const isTelegram = session.phone.startsWith('tg_');
      const product = await this.matchCoffeeProduct(cafeId);
      if (!product) {
        return 'عذراً، منتج القهوة مش متاح حالياً. ارجع لنا تاني.';
      }

      const price = session.productPrice ?? Number(product.price);
      const totalAmount = price * session.quantity + (session.recommendationItems || []).reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );

      // Build notes with coffee attributes
      const roastMap: Record<string, string> = { LIGHT: 'فاتح', MEDIUM: 'وسط', DARK: 'غامق' };
      const blendMap: Record<string, string> = { PLAIN: 'غير محوج', SPICED: 'محوج' };
      const sugarMap: Record<string, string> = {
        NO_SUGAR: 'من غير سكر',
        LIGHT_SUGAR: 'سكر خفيف',
        MEDIUM_SUGAR: 'مظبوط',
        EXTRA_SUGAR: 'سكر زيادة',
      };

      const notesParts: string[] = [
        `التحميص: ${roastMap[session.coffeeRoast] || 'وسط'}`,
        `الخلطة: ${blendMap[session.coffeeBlend] || 'غير محوج'}`,
        `السكر: ${sugarMap[session.coffeeSugar] || 'مظبوط'}`,
      ];
      if (session.selectedSizeName) notesParts.push(`الحجم: ${session.selectedSizeName}`);
      const orderItems = [
        {
          productId: product.id,
          quantity: session.quantity,
          unitPrice: new Prisma.Decimal(price),
          notes: notesParts.join(' | '),
        },
        ...(session.recommendationItems || []).map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(item.unitPrice),
          notes: 'Stage 3 verified recommendation',
        })),
      ];

      const order = await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.upsert({
          where: { cafeId_branchId_phone: { cafeId, branchId, phone: session.phone } },
          update: {
            totalOrders: { increment: 1 },
            totalSpent: { increment: new Prisma.Decimal(totalAmount) },
            lastOrderDate: new Date(),
            name: session.customerName || undefined,
          },
          create: {
            cafeId,
            branchId,
            phone: session.phone,
            name: session.customerName || 'عميل',
            totalOrders: 1,
            totalSpent: new Prisma.Decimal(totalAmount),
            lastOrderDate: new Date(),
          },
        });

        session.customerId = customer.id;

        const code = await this.generateOrderCode(tx);
        const created = await tx.order.create({
          data: {
            cafeId,
            branchId,
            code,
            customerId: customer.id,
            status: 'NEW',
            type: isTelegram ? 'TELEGRAM' : 'WHATSAPP',
            sourceType: isTelegram ? 'TELEGRAM_ORDER' : 'WHATSAPP_ORDER',
            source: isTelegram ? 'TELEGRAM' : 'WHATSAPP',
            total: new Prisma.Decimal(totalAmount),
            items: {
              create: orderItems,
            },
          },
          include: { customer: true, items: { include: { product: true } } },
        });

        const staff = await tx.staff.findFirst({
          where: { cafeId, active: true },
          select: { id: true },
        });

        await tx.inCafeOrder.create({
          data: {
            cafeId,
            branchId,
            code,
            customerName: session.customerName || 'عميل',
            customerPhone: session.phone.replace('tg_', ''),
            customerId: customer.id,
            notes: notesParts.join(' | '),
            createdById: staff?.id ?? null,
            status: 'NEW',
            total: new Prisma.Decimal(totalAmount),
            orderType: 'DELIVERY',
            sourceType: isTelegram ? 'TELEGRAM_ORDER' : 'WHATSAPP_ORDER',
            items: {
              create: orderItems.map((item) => ({ ...item, cafeId })),
            },
          },
        });

        return created;
      });

      this.eventsService.broadcast('order.created', {
        orderId: order.id,
        code: order.code,
        total: Number(order.total),
        customerId: order.customerId,
        customerPhone: order.customer.phone,
        type: order.type,
        sourceType: order.sourceType,
        status: order.status,
      });

      this.eventsService.emitToBarista('inCafe.order.created', {
        order: {
          id: order.id,
          code: order.code,
          status: 'NEW',
          total: Number(order.total),
          customerName: session.customerName || 'عميل',
          sourceType: isTelegram ? 'TELEGRAM_ORDER' : 'WHATSAPP_ORDER',
          cafeId,
        },
      });

      this.customerLearningService.learn(cafeId, order.customerId).catch(e =>
        this.logger.error(`Learn failed: ${e.message}`),
      );

      await this.customerMemory.observeOrder(this.memoryScope(session), {
        orderId: order.id,
        status: 'CONFIRMED',
        products: [product.id, ...(session.recommendationItems || []).map((item) => item.productId)],
        coffeeRoast: session.coffeeRoast,
        coffeeBlend: session.coffeeBlend,
        sugarPreference: session.coffeeSugar,
      }).catch(() => false);
      this.customerMemory.recordOrderCompleted(
        session.questionCount || 0,
        Date.now() - (session.startedAt || Date.now()),
        Boolean(session.memoryPrefilledFields?.length),
      );
      this.recommendations.recordOrderCompleted(
        Number(product.price) * session.quantity,
        Number(order.total),
        session.questionCount || 0,
      );

      session.step = CoffeeStep.ORDER_CONFIRMED;
      await this.deleteSession(session.phone);

      const confirmReply = this.replyEngine.orderConfirmedReply(
        this.buildReplyCtx({ customerName: session.customerName, deliveryEstimate: '10–14 دقيقة' }));
      return `${confirmReply.message}\n\nرقم الطلب: ${order.code}`;
    } catch (err) {
      this.logger.error(`Coffee order confirmation failed: ${(err as Error).message}`);
      return 'عذراً، حدث خطأ أثناء تأكيد الطلب. حاول مرة تانية.';
    }
  }

  private async matchCoffeeProduct(cafeId: string): Promise<{ id: string; name: string; price: any } | null> {
    const products = await this.prisma.product.findMany({
      where: { cafeId, active: true },
      select: { id: true, name: true, price: true, category: true },
    });

    // Try to find a coffee product by name/aliases
    const coffeeKeywords = ['قهوة', 'قهوه', 'coffee', 'Coffee', 'تركي', 'تركيه', 'سادة'];
    for (const kw of coffeeKeywords) {
      const match = products.find(p =>
        p.name.includes(kw) || p.name === kw || p.name.toLowerCase().includes('قهو'),
      );
      if (match) return match;
    }

    return null;
  }

  private isMenuRequest(lower: string): boolean {
    return /^(المنيو|القائمة|عندكم إيه|menu|show menu|وريني|عندك إيه|عندكو إيه)/i.test(lower);
  }

  private isExplicitCancellation(lower: string): boolean {
    return /^(الغي|إلغاء|الغاء|cancel|مش عايز اكمل|مش عايز أكمل|خلاص مش عايز|بلاش)/i.test(lower);
  }

  private isNoWord(lower: string): boolean {
    return /^(لا|no|na|la)$/i.test(lower.trim());
  }

  private memoryScope(session: CoffeeOrderSession): CustomerMemoryScope {
    if (!session.cafeId || !session.customerId) throw new Error('Missing customer memory scope');
    return {
      cafeId: session.cafeId,
      customerId: session.customerId,
      channel: session.phone.startsWith('tg_') ? 'TELEGRAM' : 'WHATSAPP',
      channelIdentity: session.phone,
    };
  }

  private removeMemoryField(session: CoffeeOrderSession, field: CoffeePreferenceField): void {
    session.memoryPrefilledFields = (session.memoryPrefilledFields || []).filter((item) => item !== field);
  }

  private async showMenu(session: CoffeeOrderSession): Promise<string> {
    const categories = await this.prisma.productCategory.findMany({
      where: { cafeId: session.cafeId, active: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        products: {
          where: { active: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, price: true, emoji: true },
        },
      },
    });

    const lines: string[] = [];
    for (const cat of categories) {
      const icon = cat.icon || '📋';
      lines.push(`\n${icon} ${cat.name}`);
      if (cat.products.length === 0) {
        lines.push('  (لا توجد منتجات متاحة)');
      } else {
        cat.products.forEach(p => {
          lines.push(`  ${p.emoji || ''} ${p.name} - ${Number(p.price).toFixed(0)} ج`);
        });
      }
    }

    session.step = CoffeeStep.AWAITING_ORDER;
    session.lastBotQuestion = 'order';
    return `المنيو:\n${lines.join('\n')}\n\nتحب تطلب إيه؟`;
  }

  private async generateOrderCode(tx: Prisma.TransactionClient): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `COF-${dateStr}`;
    const lastOrder = await tx.order.findFirst({
      where: { code: { startsWith: prefix } },
      orderBy: { code: 'desc' },
    });
    const lastSequence = lastOrder ? Number(lastOrder.code.split('-')[2]) : 0;
    return `${prefix}-${String(lastSequence + 1).padStart(4, '0')}`;
  }

  private paymentLabel(method: string): string {
    const labels: Record<string, string> = {
      CASH: 'كاش',
      INSTANT_PAYMENT: 'دفع فوري',
      WEEKLY_ACCOUNT: 'حساب أسبوعي',
      MONTHLY_ACCOUNT: 'حساب شهري',
      PREPAID_BALANCE: 'رصيد مسبق',
    };
    return labels[method] || method;
  }
}

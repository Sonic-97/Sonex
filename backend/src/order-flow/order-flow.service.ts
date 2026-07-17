import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { EventsService } from '../events/events.service';
import { RedisService } from '../redis/redis.service';
import { Prisma } from '@prisma/client';
import { IdempotencyService } from '../common/idempotency.service';
import { AiService, AiOrderIntent } from '../ai/ai.service';
import { CustomerLearningService } from '../customer-learning/customer-learning.service';
import { AiWaiterService } from '../ai-waiter/ai-waiter.service';
import { CoffeeOrderService } from '../coffee-order/coffee-order.service';
import { CoffeeAttributeExtractor } from '../coffee-order/coffee-attribute-extractor';
import { CustomerMemoryService } from '../customer-memory/customer-memory.service';
import { CustomerMemoryScope, RepeatOrderPreview } from '../customer-memory/customer-memory.types';
import { RecommendationService } from '../recommendations/recommendation.service';
import { RecommendationCandidate, RecommendationContext, RecommendationSessionState } from '../recommendations/recommendation.types';
import { CustomerUnderstandingService } from '../customer-understanding/customer-understanding.service';
import {
  CustomerNeed,
  CustomerNeedMemory,
  CustomerUnderstandingResult,
  NeedClarificationField,
  NeedRecommendation,
} from '../customer-understanding/customer-need.types';
import { ReplyEngineService } from '../reply-engine/reply-engine.service';
import { ReplyContext } from '../reply-engine/reply-engine.types';

export interface OrderFlowSession {
  phone: string;
  replyJid?: string; // phone JID (never @lid) for sending replies
  step: string;
  cafeId?: string;
  branchId?: string;
  categoryId?: string;
  categoryName?: string;
  productId?: string;
  productName?: string;
  productPrice?: number;
  quantity: number;
  notes: string[];
  customerName?: string;
  askingName?: boolean;
  repeatOrderId?: string;
  selectedProductId?: string;
  selectedProductName?: string;
  selectedProductPrice?: number;
  tempMessage?: string;
  // Dynamic product options
  selectedOptions: Record<string, string>;
  currentOptionIndex: number;
  optionsCache: any[];
  // Usual order items (no prices)
  usualOrderItems?: { productId: string; productName: string; emoji: string; notes: string }[];
  // AI-parsed items before confirmation
  aiParsedItems?: AiOrderIntent['items'];
  aiOrderNotes?: string;
  customerId?: string;
  repeatPreview?: RepeatOrderPreview;
  repeatIncludedProductIds?: string[];
  startedAt?: number;
  questionCount?: number;
  messageCount?: number;
  recommendationItems?: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }>;
  pendingRecommendation?: RecommendationCandidate;
  recommendationChoices?: RecommendationCandidate[];
  recommendationOptOut?: boolean;
  recommendationComplaint?: boolean;
  commercialSuggestionsShown?: number;
  upsellShown?: boolean;
  crossSellShown?: boolean;
  rejectedRecommendationKeys?: string[];
  shownRecommendationKeys?: string[];
  selectedSizeId?: string;
  selectedSizeName?: string;
  orderValueBeforeRecommendation?: number;
  customerNeed?: CustomerNeed;
  customerNeedOptions?: NeedRecommendation[];
  customerNeedLastQuestion?: NeedClarificationField;
  customerNeedClarificationCount?: number;
  customerNeedMessages?: number;
  customerNeedSelectionFailures?: number;
  customerNeedHandoffAvailable?: boolean;
  customerNeedOriginalMessage?: string;
  stage7Assisted?: boolean;
  stage7UsualOrder?: boolean;
}

@Injectable()
export class OrderFlowService {
  private readonly logger = new Logger(OrderFlowService.name);
  private readonly useRedis: boolean;

  private sessions: Map<string, OrderFlowSession> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly eventsService: EventsService,
    private readonly redisService: RedisService,
    private readonly idempotencyService: IdempotencyService,
    private readonly aiService: AiService,
    private readonly customerLearningService: CustomerLearningService,
    private readonly aiWaiterService: AiWaiterService,
    private readonly coffeeOrderService: CoffeeOrderService,
    private readonly coffeeExtractor: CoffeeAttributeExtractor,
    private readonly customerMemory: CustomerMemoryService,
    private readonly recommendations: RecommendationService,
    private readonly replyEngine: ReplyEngineService,
    @Optional() private readonly customerUnderstanding?: CustomerUnderstandingService,
  ) {
    this.useRedis = process.env.ORDERFLOW_USE_REDIS === 'true';
    if (this.useRedis) {
      this.logger.log('OrderFlow sessions stored in Redis');
    }
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
    if (this.useRedis) {
      const session = await this.redisService.getOrderFlowSession(phone);
      return session !== null;
    }
    return this.sessions.has(phone);
  }

  async handleMessage(phone: string, message: string, cafeId?: string, replyJid?: string): Promise<string> {
    const locked = await this.redisService.acquireOrderFlowLock(phone);
    if (!locked) {
      this.logger.warn(`[CONCURRENCY] handleMessage: another request in progress for ${phone}, rejecting`);
      return '⏳ يتم تجهيز طلبك السابق، انتظر قليلاً ثم حاول مرة أخرى.';
    }

    try {
      const session = this.useRedis
        ? (await this.redisService.getOrderFlowSession(phone)) as unknown as OrderFlowSession | null
        : this.sessions.get(phone) ?? null;

      if (!session) {
        const memoryReply = await this.tryApplyMemoryCommand(phone, message, cafeId);
        if (memoryReply) return memoryReply;

        const customerNeedReply = await this.tryStartCustomerNeed(phone, message, cafeId, replyJid);
        if (customerNeedReply) return customerNeedReply;

        if (cafeId && this.recommendations.isRecommendationRequest(message)) {
          await this.startFlow(phone, cafeId, replyJid);
          const startedSession = await this.getSession(phone);
          if (startedSession) return this.handleRecommendationRequest(startedSession, message);
        }

        // Check for coffee intent — route to CoffeeOrderService
        if (message.trim()) {
          const coffeeSession = await this.coffeeOrderService.getSession(phone);
          if (coffeeSession) {
            return this.coffeeOrderService.handleMessage(phone, message);
          }

          const coffeeIntent = this.coffeeExtractor.extractIntent(message);
          if (coffeeIntent.isCoffee) {
            // Load customer name if known
            let knownName: string | undefined;
            if (cafeId) {
              const branch = await this.prisma.branch.findFirst({ where: { cafeId }, select: { id: true } });
              if (branch) {
                const customer = await this.prisma.customer.findUnique({
                  where: { cafeId_branchId_phone: { cafeId, branchId: branch.id, phone } },
                  select: { id: true, name: true },
                });
                if (customer?.name) knownName = customer.name;
              }
            }
            // Start the coffee session, then process the message that triggered it
            const greeting = await this.coffeeOrderService.startCoffeeFlow(phone, cafeId!, replyJid, knownName);
            if (!knownName) {
              // Unknown customer — need name first; return greeting and let next message continue flow
              return greeting;
            }
            return this.coffeeOrderService.handleMessage(phone, message);
          }
        }

        const pendingOffer = this.aiWaiterService.getPendingOffer(phone, cafeId);
        if (pendingOffer) {
          const aiSession: OrderFlowSession = {
            phone,
            replyJid: replyJid && !replyJid.includes('@lid') ? replyJid : undefined,
            step: 'AI_WAITER_PENDING',
            cafeId: pendingOffer.cafeId,
            branchId: undefined,
            quantity: 1,
            notes: [],
            selectedOptions: {},
            currentOptionIndex: 0,
            optionsCache: [],
            customerName: pendingOffer.customerName,
            usualOrderItems: [{ productId: '', productName: pendingOffer.favoriteProduct, emoji: '☕', notes: '' }],
            aiOrderNotes: undefined,
          };
          if (pendingOffer.cafeId) {
            const defaultBranch = await this.prisma.branch.findFirst({
              where: { cafeId: pendingOffer.cafeId }, select: { id: true },
            });
            aiSession.branchId = defaultBranch?.id;
          }
          await this.saveSession(phone, aiSession);
          return this.processStep(aiSession, message.trim());
        }
        return this.startFlow(phone, cafeId, replyJid);
      }

      if (replyJid && !replyJid.includes('@lid')) {
        session.replyJid = replyJid;
        await this.saveSession(phone, session);
      }

      session.messageCount = (session.messageCount || 0) + 1;
      if (this.recommendations.isComplaintMessage(message)) {
        session.recommendationComplaint = true;
      }

      if (this.recommendations.isOptOutMessage(message)) {
        session.recommendationOptOut = true;
        this.recommendations.recordOptOut();
        if (session.customerId && session.cafeId) {
          await this.customerMemory.applyExplicitCommand(this.memoryScope(session), message).catch(() => ({ handled: false }));
        }
        return this.finishPendingRecommendationWithoutAcceptance(session, true);
      }

      if (
        this.customerUnderstanding &&
        ['WELCOME', 'CATEGORY', 'PRODUCT_SELECT'].includes(session.step)
      ) {
        const customerNeedReply = await this.tryContinueCustomerNeed(session, message);
        if (customerNeedReply) return customerNeedReply;
      }

      if (
        this.recommendations.isRecommendationRequest(message) &&
        ['WELCOME', 'CATEGORY', 'PRODUCT_SELECT'].includes(session.step)
      ) {
        return this.handleRecommendationRequest(session, message);
      }

      if (session.customerId && session.cafeId) {
        try {
          const memoryResult = await this.customerMemory.applyExplicitCommand(
            this.memoryScope(session),
            message,
          );
          if (memoryResult.handled) {
            if (memoryResult.preferredName) session.customerName = memoryResult.preferredName;
            await this.saveSession(phone, session);
            return memoryResult.response!;
          }
        } catch {
          // Keep the order flow available if an optional preference update fails.
        }
      }

      return this.processStep(session as OrderFlowSession, message.trim());
    } finally {
      await this.redisService.releaseOrderFlowLock(phone);
    }
  }

  async handleAIMessage(phone: string, aiData: AiOrderIntent, cafeId?: string, replyJid?: string): Promise<string> {
    const locked = await this.redisService.acquireOrderFlowLock(phone);
    if (!locked) {
      return '⏳ يتم تجهيز طلبك السابق، انتظر قليلاً ثم حاول مرة أخرى.';
    }
    try {
      let branchId: string | undefined;
      if (cafeId) {
        const branch = await this.prisma.branch.findFirst({ where: { cafeId }, select: { id: true } });
        branchId = branch?.id;
      }

      const session: OrderFlowSession = {
        phone,
        replyJid: replyJid && !replyJid.includes('@lid') ? replyJid : undefined,
        step: 'AI_REVIEW',
        quantity: 1,
        notes: [],
        cafeId,
        branchId,
        selectedOptions: {},
        currentOptionIndex: -1,
        optionsCache: [],
        aiParsedItems: aiData.items,
      };
      await this.saveSession(phone, session);

      return this.buildAIReviewMessage(aiData.items);
    } finally {
      await this.redisService.releaseOrderFlowLock(phone);
    }
  }

  private buildAIReviewMessage(items: AiOrderIntent['items']): string {
    const lines = items.map((item, i) => {
      const sugarMap: Record<string, string> = { '0': 'بدون سكر', '50': 'نص سكر', '100': 'سكر زيادة' };
      const sizeMap: Record<string, string> = { 'S': 'صغير', 'M': 'وسط', 'L': 'كبير' };
      const parts = [`${item.quantity}x ${item.productName}`];
      if (item.size !== 'M') parts.push(`(${sizeMap[item.size]})`);
      parts.push(`- سكر: ${sugarMap[item.sugar] || 'نص سكر'}`);
      if (item.extras?.length) parts.push(`+ إضافات: ${item.extras.join(', ')}`);
      if (item.notes) parts.push(`📝 ${item.notes}`);
      return `${i + 1}. ${parts.join(' ')}`;
    });

    return `طلباتك:
${lines.join('\n')}

📝 تحب تضيف أي ملاحظات؟
(اكتب الملاحظات أو اكتب "لا" للمتابعة)`;
  }

  async updateSessionReplyJid(phone: string, replyJid: string): Promise<void> {
    if (replyJid.includes('@lid')) return;
    const session = this.useRedis
      ? (await this.redisService.getOrderFlowSession(phone)) as unknown as OrderFlowSession | null
      : this.sessions.get(phone) ?? null;
    if (session) {
      session.replyJid = replyJid;
      await this.saveSession(phone, session);
    }
  }

  async getSession(phone: string): Promise<OrderFlowSession | null> {
    if (this.useRedis) {
      return (await this.redisService.getOrderFlowSession(phone)) as unknown as OrderFlowSession | null;
    }
    return this.sessions.get(phone) ?? null;
  }

  async saveSession(phone: string, data: OrderFlowSession): Promise<void> {
    if (this.useRedis) {
      await this.redisService.setOrderFlowSession(phone, data as unknown as Record<string, unknown>);
    } else {
      this.sessions.set(phone, data);
    }
  }

  async deleteSession(phone: string): Promise<void> {
    if (this.useRedis) {
      await this.redisService.delOrderFlowSession(phone);
    } else {
      this.sessions.delete(phone);
    }
  }

  private async buildFullMenu(cafeId?: string): Promise<{ helpText: string; menuText: string }> {
    const categories = await this.prisma.productCategory.findMany({
      where: { cafeId, active: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        products: {
          where: { active: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, price: true, emoji: true },
        },
      },
    });

    const helpLines: string[] = [];
    const menuLines: string[] = [];

    for (const cat of categories) {
      const icon = cat.icon || '📋';
      helpLines.push(`${icon} ${cat.name}`);

      menuLines.push(`\n${icon} ${cat.name}`);
      if (cat.products.length === 0) {
        menuLines.push('  (لا توجد منتجات متاحة)');
      } else {
        cat.products.forEach((p, i) => {
          menuLines.push(`  ${i + 1}. ${p.emoji || ''} ${p.name} - ${Number(p.price).toFixed(0)} ج`);
        });
      }
    }

    if (categories.length === 0) {
      helpLines.push('📋 القائمة');
      menuLines.push('\n📋 القائمة');
      menuLines.push('  (القائمة قيد التحديث)');
    }

    return {
      helpText: helpLines.join('\n'),
      menuText: menuLines.join('\n'),
    };
  }

  private async startFlow(phone: string, cafeId?: string, replyJid?: string): Promise<string> {
    let branchId: string | undefined;
    if (cafeId) {
      const defaultBranch = await this.prisma.branch.findFirst({
        where: { cafeId }, select: { id: true },
      });
      branchId = defaultBranch?.id;
    }

    const cafe = cafeId ? await this.prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { name: true, logo: true },
    }) : null;
    const cafeName = cafe?.name || 'الكافيه';

    // Check if returning customer
    let customer: any = null;
    if (cafeId && branchId) {
      customer = await this.prisma.customer.findUnique({
        where: { cafeId_branchId_phone: { cafeId, branchId, phone } },
        include: {
          orders: { take: 1, orderBy: { createdAt: 'desc' }, include: { items: { include: { product: true } } } },
        },
      });
    }

    const session: OrderFlowSession = {
      phone,
      replyJid: replyJid && !replyJid.includes('@lid') ? replyJid : undefined,
      step: 'WELCOME',
      quantity: 1,
      notes: [],
      cafeId,
      branchId,
      customerName: customer?.name || undefined,
      customerId: customer?.id || undefined,
      selectedOptions: {},
      currentOptionIndex: -1,
      optionsCache: [],
      startedAt: Date.now(),
      questionCount: 0,
      messageCount: 0,
      recommendationItems: [],
      commercialSuggestionsShown: 0,
      upsellShown: false,
      crossSellShown: false,
      rejectedRecommendationKeys: [],
      shownRecommendationKeys: [],
    };
    await this.saveSession(phone, session);

    const { menuText } = await this.buildFullMenu(cafeId);

    // Returning customer with a name
    if (customer?.name) {
      session.customerName = customer.name;

      const repeatPreview = await this.customerMemory
        .buildRepeatOrderPreview(this.memoryScope(session))
        .catch(() => null);
      if (repeatPreview) {
        session.repeatPreview = repeatPreview;
        session.repeatIncludedProductIds = repeatPreview.items
          .filter((item) => item.available)
          .map((item) => item.productId);
        session.step = repeatPreview.unavailableItems.length
          ? 'REPEAT_UNAVAILABLE_DECISION'
          : 'REPEAT_CONFIRMATION';
        await this.saveSession(phone, session);
        return this.formatRepeatPreview(repeatPreview, customer.name);
      }

      // No usual order — show menu
      session.step = 'CATEGORY';
      await this.saveSession(phone, session);
      const returnCtx = this.buildReplyCtx({ customerName: customer.name, isReturningCustomer: true });
      const returnReply = this.replyEngine.greetingReply(returnCtx);
      return `${returnReply.message}\n\n${menuText}`;
    }

    // New customer
    session.step = 'CATEGORY';
    await this.saveSession(phone, session);
    const newCtx = this.buildReplyCtx({ isNewCustomer: true });
    const newReply = this.replyEngine.greetingReply(newCtx);
    return `${newReply.message}\n\n${menuText}`;
  }

  private async tryStartCustomerNeed(
    phone: string,
    message: string,
    cafeId?: string,
    replyJid?: string,
  ): Promise<string | null> {
    if (!this.customerUnderstanding || !cafeId || !message.trim()) return null;
    const branch = await this.prisma.branch.findFirst({ where: { cafeId }, select: { id: true } });
    if (!branch) return null;
    const customer = await this.prisma.customer.findUnique({
      where: { cafeId_branchId_phone: { cafeId, branchId: branch.id, phone } },
      select: { id: true, name: true },
    });
    const session: OrderFlowSession = {
      phone,
      replyJid: replyJid && !replyJid.includes('@lid') ? replyJid : undefined,
      step: 'NEED_CLARIFICATION',
      cafeId,
      branchId: branch.id,
      customerId: customer?.id,
      customerName: customer?.name || undefined,
      quantity: 1,
      notes: [],
      selectedOptions: {},
      currentOptionIndex: -1,
      optionsCache: [],
      startedAt: Date.now(),
      messageCount: 1,
      customerNeedMessages: 1,
      customerNeedClarificationCount: 0,
      customerNeedSelectionFailures: 0,
      customerNeedOriginalMessage: message,
      stage7Assisted: true,
    };
    const result = await this.understandCustomerNeed(session, message);
    if (!result.handled) return null;
    return this.applyCustomerNeedResult(session, result);
  }

  private async tryContinueCustomerNeed(session: OrderFlowSession, message: string): Promise<string | null> {
    if (!this.customerUnderstanding || !session.cafeId || !session.branchId) return null;
    const result = await this.understandCustomerNeed(session, message);
    if (!result.handled) return null;
    session.stage7Assisted = true;
    session.customerNeedMessages = (session.customerNeedMessages || 0) + 1;
    session.customerNeedOriginalMessage = message;
    return this.applyCustomerNeedResult(session, result);
  }

  private async understandCustomerNeed(session: OrderFlowSession, message: string): Promise<CustomerUnderstandingResult> {
    const memory = await this.customerNeedMemory(session);
    const recentProductIds = await this.recentProductIds(session);
    return this.customerUnderstanding!.understand({
      cafeId: session.cafeId!,
      branchId: session.branchId!,
      customerId: session.customerId,
      channel: session.phone.startsWith('tg_') ? 'TELEGRAM' : 'WHATSAPP',
      channelIdentity: session.phone,
      message,
      lastBotQuestion: session.customerNeedLastQuestion,
      draftNeed: session.customerNeed,
      clarificationCount: session.customerNeedClarificationCount || 0,
      memory,
      recentProductIds,
      deliveryFee: 0,
    });
  }

  private async applyCustomerNeedResult(session: OrderFlowSession, result: CustomerUnderstandingResult): Promise<string> {
    session.customerNeed = result.need;
    session.customerNeedHandoffAvailable = result.handoffAvailable;
    if (result.action === 'ASK_CLARIFICATION') {
      session.step = 'NEED_CLARIFICATION';
      session.customerNeedLastQuestion = result.clarification?.field;
      session.customerNeedClarificationCount = (session.customerNeedClarificationCount || 0) + 1;
      await this.saveSession(session.phone, session);
      return result.reply;
    }
    if (result.action === 'SEARCH_RELEVANT_PRODUCTS') {
      session.step = 'NEED_RECOMMENDATION_SELECT';
      session.customerNeedOptions = result.recommendations;
      session.customerNeedLastQuestion = undefined;
      await this.saveSession(session.phone, session);
      return result.reply;
    }
    if (result.action === 'REPEAT_USUAL_ORDER') {
      session.stage7UsualOrder = true;
      await this.saveSession(session.phone, session);
      return this.repeatLastOrder(session);
    }
    if (result.action === 'HUMAN_HANDOFF_CREATED') {
      await this.deleteSession(session.phone);
      return result.reply;
    }
    if (result.action === 'OFFER_HUMAN_HANDOFF' || result.action === 'SCHEDULED_ORDER_UNSUPPORTED') {
      session.step = result.handoffAvailable ? 'NEED_HANDOFF_CONFIRM' : 'CATEGORY';
      await this.saveSession(session.phone, session);
      return result.reply;
    }
    if (result.action === 'ACKNOWLEDGE_COMPLAINT') {
      session.recommendationOptOut = true;
      session.step = 'CATEGORY';
      await this.saveSession(session.phone, session);
      return result.reply;
    }
    return result.reply;
  }

  private async handleCustomerNeedClarification(session: OrderFlowSession, message: string): Promise<string> {
    const reply = await this.tryContinueCustomerNeed(session, message);
    return reply || 'ممكن توضح طلبك بكلمتين؟';
  }

  private async handleCustomerNeedSelection(session: OrderFlowSession, message: string): Promise<string> {
    const choices = session.customerNeedOptions || [];
    const normalized = message.trim().toLowerCase();
    const numeric = Number(normalized.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))));
    const selected = Number.isInteger(numeric) && numeric >= 1 && numeric <= choices.length
      ? choices[numeric - 1]
      : choices.find((choice) =>
          choice.productName.toLowerCase() === normalized || choice.productName.toLowerCase().includes(normalized),
        );
    if (!selected) {
      session.customerNeedSelectionFailures = (session.customerNeedSelectionFailures || 0) + 1;
      this.customerUnderstanding?.recordRecommendationRejection(session.cafeId!);
      if ((session.customerNeedSelectionFailures || 0) >= 2) {
        this.customerUnderstanding?.recordRepeatedMisunderstanding(session.cafeId!);
        const available = await this.customerUnderstanding!.humanAssistanceAvailable(session.cafeId!, session.branchId!);
        session.customerNeedHandoffAvailable = available;
        session.step = available ? 'NEED_HANDOFF_CONFIRM' : 'CATEGORY';
        return available
          ? 'واضح إني مش فاهم اختيارك بدقة. تحب أوصلك بحد من الكافيه؟'
          : 'واضح إني مش فاهم اختيارك بدقة، ومفيش موظف متاح مؤكد دلوقتي. اكتب اسم المنتج أو اطلب المنيو.';
      }
      return `${this.formatCustomerNeedChoices(choices)}\nاكتب الرقم أو الاسم.`;
    }

    const verified = await this.customerUnderstanding!.revalidateRecommendation(
      session.cafeId!,
      session.branchId!,
      selected,
      session.customerNeed?.budgetMax ?? null,
    );
    if (!verified) {
      session.customerNeedOptions = choices.filter((choice) => choice.productId !== selected.productId);
      if (session.customerNeedOptions.length) {
        return `الاختيار اتغير أو مش متاح دلوقتي.\n${this.formatCustomerNeedChoices(session.customerNeedOptions)}`;
      }
      session.step = 'CATEGORY';
      return 'الاختيارات دي مش متاحة دلوقتي. اكتب اسم منتج محدد أو اطلب المنيو.';
    }

    session.productId = verified.productId;
    session.productName = verified.productName;
    session.productPrice = verified.unitPrice;
    session.categoryId = verified.categoryId || undefined;
    session.categoryName = verified.category;
    session.quantity = 1;
    session.customerNeedOptions = undefined;
    session.step = 'QUANTITY';
    this.customerUnderstanding!.recordProductSelection(
      session.cafeId!,
      session.customerNeed!,
      session.customerNeedMessages || 1,
    );
    return `تمام، اخترت ${verified.productName} بسعر ${verified.finalPrice} ج. كام الكمية؟`;
  }

  private async handleCustomerNeedHandoff(session: OrderFlowSession, message: string): Promise<string> {
    const yes = /^(?:1|نعم|ايوه|أيوه|اه|yes|ok|تمام)/i.test(message.trim());
    if (yes && this.customerUnderstanding) {
      const handoff = await this.customerUnderstanding.requestHumanAssistance({
        cafeId: session.cafeId!,
        branchId: session.branchId!,
        customerId: session.customerId,
        channel: session.phone.startsWith('tg_') ? 'TELEGRAM' : 'WHATSAPP',
        channelIdentity: session.phone,
        message: session.customerNeedOriginalMessage || message,
      }, 'CONFIRMED_AFTER_STAGE_7_OFFER');
      await this.deleteSession(session.phone);
      return handoff.reply;
    }
    session.step = 'CATEGORY';
    const categories = await this.getActiveCategories(session.cafeId);
    return `تمام. اختار قسم أو اكتب اسم منتج:\n${categories.map((category, index) => `${index + 1}. ${category.icon || ''} ${category.name}`).join('\n')}`;
  }

  private async customerNeedMemory(session: OrderFlowSession): Promise<CustomerNeedMemory | undefined> {
    if (!session.customerId || !session.cafeId) return undefined;
    try {
      const summary = await this.customerMemory.buildSummary(this.memoryScope(session));
      if (!summary) return undefined;
      const sugar = String(summary.strongPreferences.sugar || '');
      const temperature = String(summary.strongPreferences.preferredTemperature || '');
      return {
        conversationStyle: summary.conversationStyle,
        temperature: temperature === 'HOT' || temperature === 'COLD' ? temperature : undefined,
        sweetness: sugar === 'NO_SUGAR' ? 'NONE' : sugar === 'LIGHT_SUGAR' ? 'LOW' : sugar === 'EXTRA_SUGAR' ? 'HIGH' : undefined,
      };
    } catch {
      return undefined;
    }
  }

  private async recentProductIds(session: OrderFlowSession): Promise<string[]> {
    if (!session.customerId || !session.cafeId) return [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    try {
      const orders = await this.prisma.order.findMany({
        where: { cafeId: session.cafeId, customerId: session.customerId, createdAt: { gte: start } },
        orderBy: { createdAt: 'desc' },
        take: 2,
        select: { items: { select: { productId: true } } },
      });
      return orders.flatMap((order) => order.items.map((item) => item.productId));
    } catch {
      return [];
    }
  }

  private formatCustomerNeedChoices(choices: NeedRecommendation[]): string {
    return choices.slice(0, 3).map((choice, index) =>
      `${index + 1}. ${choice.productName} — ${choice.finalPrice} ج`,
    ).join('\n');
  }

  private async processStep(session: OrderFlowSession, message: string): Promise<string> {
    let reply: string;

    switch (session.step) {
      case 'WELCOME':
        reply = await this.handleWelcome(session, message);
        break;
      case 'REPEAT_UNAVAILABLE_DECISION':
        reply = await this.handleRepeatUnavailableDecision(session, message);
        break;
      case 'REPEAT_CONFIRMATION':
        reply = await this.handleRepeatConfirmation(session, message);
        break;
      case 'RECOMMENDATION_PENDING':
        reply = await this.handlePendingRecommendation(session, message);
        break;
      case 'RECOMMENDATION_CHOICES':
        reply = await this.handleRecommendationChoice(session, message);
        break;
      case 'NEED_CLARIFICATION':
        reply = await this.handleCustomerNeedClarification(session, message);
        break;
      case 'NEED_RECOMMENDATION_SELECT':
        reply = await this.handleCustomerNeedSelection(session, message);
        break;
      case 'NEED_HANDOFF_CONFIRM':
        reply = await this.handleCustomerNeedHandoff(session, message);
        break;
      case 'NAME_INPUT':
        reply = await this.handleNameInput(session, message);
        break;
      case 'CATEGORY':
        reply = await this.handleCategory(session, message);
        break;
      case 'PRODUCT_SELECT':
        reply = await this.handleProductSelect(session, message);
        break;
      case 'OPTION_PROMPT':
        reply = await this.handleOptionResponse(session, message);
        break;
      case 'QUANTITY':
        reply = await this.handleQuantity(session, message);
        break;
      case 'NOTES':
        reply = await this.handleNotes(session, message);
        break;
      case 'AI_REVIEW':
        reply = await this.handleAIReview(session, message);
        break;
      case 'AI_CONFIRM':
        reply = await this.handleAIConfirm(session, message);
        break;
      case 'AI_WAITER_PENDING':
        reply = await this.handleAiWaiterResponse(session, message);
        break;
      case 'SUMMARY':
        reply = await this.handleSummary(session, message);
        break;
      default:
        await this.deleteSession(session.phone);
        return 'عذراً، حدث خطأ. برجاء البدء من جديد.';
    }

    if (!reply.includes('تم تأكيد') && !reply.includes('تم إلغاء')) {
      await this.saveSession(session.phone, session);
    }

    return reply;
  }

  private async tryAIFallback(session: OrderFlowSession, message: string): Promise<string | null> {
    try {
      if (!session.cafeId) return null;
      const products = await this.prisma.product.findMany({
        where: { cafeId: session.cafeId, active: true },
        select: { id: true, name: true, category: true, price: true },
      });
      if (!products.length) return null;
      const productContext = products.map(p => ({ id: p.id, name: p.name, category: p.category, price: p.price }));
      const aiData = await this.aiService.parseMessage(message, productContext);
      if (aiData.intent === 'create_order' && aiData.items?.length) {
        session.aiParsedItems = aiData.items;
        session.step = 'AI_REVIEW';
        return this.buildAIReviewMessage(aiData.items);
      }
    } catch {
      return null;
    }
    return null;
  }

  private async handleWelcome(session: OrderFlowSession, message: string): Promise<string> {
    const lower = message.toLowerCase();

    // New customer providing name
    if (session.askingName) {
      return this.handleNameInput(session, message);
    }

    // Usual order confirmation flow
    if (session.usualOrderItems) {
      if (lower === '1' || lower.includes('تأكيد') || lower.includes('repeat') || lower.includes('نفس')) {
        return this.confirmUsualOrder(session);
      }
      if (lower === '2' || lower.includes('تعديل') || lower.includes('modify')) {
        session.step = 'CATEGORY';
        const categories = await this.getActiveCategories(session.cafeId);
        const menu = categories.map((c, i) => `${i + 1}. ${c.icon || ''} ${c.name}`).join('\n');
        return `تمام، اختر القسم:\n${menu}`;
      }
      if (lower === '3' || lower.includes('جديد') || lower.includes('new') || lower.includes('add')) {
        session.step = 'CATEGORY';
        const categories = await this.getActiveCategories(session.cafeId);
        const menu = categories.map((c, i) => `${i + 1}. ${c.icon || ''} ${c.name}`).join('\n');
        return `تحب ايه؟\n${menu}`;
      }
    }

    // Returning customer: "1" = confirm repeat, "2" = new order
    if (session.customerName) {
      if (lower === '1' || lower.includes('تأكيد') || lower.includes('repeat') || lower.includes('نفس')) {
        return this.repeatLastOrder(session);
      }
      if (lower === '2' || lower.includes('جديد') || lower.includes('new') || lower.includes('add')) {
        session.step = 'CATEGORY';
        const categories = await this.getActiveCategories(session.cafeId);
        const menu = categories.map((c, i) => `${i + 1}. ${c.icon || ''} ${c.name}`).join('\n');
        return `تحب ايه؟\n${menu}`;
      }
    }

    // Generic fallback
    session.step = 'CATEGORY';
    const categories = await this.getActiveCategories(session.cafeId);
    const menu = categories.map((c, i) => `${i + 1}. ${c.icon || ''} ${c.name}`).join('\n');
    return `تحب ايه؟\n${menu}`;
  }

  private async handleNameInput(session: OrderFlowSession, message: string): Promise<string> {
    const name = message.trim();
    if (!this.customerMemory.isLikelyName(name)) {
      session.askingName = true;
      return 'ممكن تقول اسمك فقط؟';
    }
    session.customerName = name;
    session.askingName = false;
    session.step = 'CATEGORY';
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
        // The active conversation can continue without optional persistence.
      }
    }
    const categories = await this.getActiveCategories(session.cafeId);
    const menu = categories.map((c, i) => `${i + 1}. ${c.icon || ''} ${c.name}`).join('\n');
    return `أهلاً بك يا ${session.customerName} 👋\n\nتحب تطلب ايه؟\n${menu}`;
  }

  private async handleAIReview(session: OrderFlowSession, message: string): Promise<string> {
    const lower = message.toLowerCase();

    if (/^(لا|no|كمل|تمام|ok|oke|y|yes)$/i.test(lower) || session.aiOrderNotes) {
      session.aiOrderNotes = session.aiOrderNotes || '';
      session.step = 'AI_CONFIRM';
      await this.saveSession(session.phone, session);

      const items = session.aiParsedItems || [];
      const lines = items.map((item, i) => {
        const sugarMap: Record<string, string> = { '0': 'بدون سكر', '50': 'نص سكر', '100': 'سكر زيادة' };
        const sizeMap: Record<string, string> = { 'S': 'صغير', 'M': 'وسط', 'L': 'كبير' };
        const parts = [`${item.quantity}x ${item.productName}`];
        if (item.size !== 'M') parts.push(`(${sizeMap[item.size]})`);
        parts.push(`سكر: ${sugarMap[item.sugar] || 'نص سكر'}`);
        if (item.extras?.length) parts.push(`إضافات: ${item.extras.join(', ')}`);
        return `${i + 1}. ${parts.join(' - ')}`;
      });

      let msg = `طلبك:\n${lines.join('\n')}`;
      if (session.aiOrderNotes) {
        msg += `\n📝 ملاحظات: ${session.aiOrderNotes}`;
      }
      msg += `\n\nاكتب:
1 ✅ للتأكيد
2 ❌ للإلغاء`;
      return msg;
    }

    session.aiOrderNotes = message.trim();
    session.step = 'AI_CONFIRM';
    await this.saveSession(session.phone, session);

    const items = session.aiParsedItems || [];
    const lines = items.map((item, i) => {
      const sugarMap: Record<string, string> = { '0': 'بدون سكر', '50': 'نص سكر', '100': 'سكر زيادة' };
      const sizeMap: Record<string, string> = { 'S': 'صغير', 'M': 'وسط', 'L': 'كبير' };
      const parts = [`${item.quantity}x ${item.productName}`];
      if (item.size !== 'M') parts.push(`(${sizeMap[item.size]})`);
      parts.push(`سكر: ${sugarMap[item.sugar] || 'نص سكر'}`);
      if (item.extras?.length) parts.push(`إضافات: ${item.extras.join(', ')}`);
      return `${i + 1}. ${parts.join(' - ')}`;
    });

    let msg = `طلبك:\n${lines.join('\n')}`;
    if (session.aiOrderNotes) {
      msg += `\n📝 ملاحظات: ${session.aiOrderNotes}`;
    }
    msg += `\n\nاكتب:
1 ✅ للتأكيد
2 ❌ للإلغاء`;
    return msg;
  }

  private async handleAIConfirm(session: OrderFlowSession, message: string): Promise<string> {
    const lower = message.toLowerCase();

    if (lower === '1' || lower.includes('تأكيد') || lower.includes('ok') || lower.includes('yes') || lower.includes('ايوه')) {
      return this.confirmAIOrder(session);
    }

    // Cancel or anything else
    await this.deleteSession(session.phone);
    return 'تم إلغاء الطلب ❌\nتحتاج حاجة تاني؟ اكتب أي حاجة.';
  }

  private async confirmAIOrder(session: OrderFlowSession): Promise<string> {
    try {
      const cafeId = session.cafeId;
      const targetBranchId = session.branchId;
      if (!cafeId || !targetBranchId) throw new Error('Missing cafe or branch');

      const isTelegram = session.phone.startsWith('tg_');
      const items = session.aiParsedItems || [];
      if (!items.length) throw new Error('No items to order');

      // Match product names to DB products
      const allProducts = await this.prisma.product.findMany({
        where: { cafeId, active: true },
        select: { id: true, name: true, price: true, emoji: true },
      });

      const orderItems: Array<{ productId: string; quantity: number; unitPrice: any; notes: string | null }> = [];

      for (const aiItem of items) {
        const matched = this.matchProductName(aiItem.productName, allProducts);
        if (!matched) continue;

        const sugarMap: Record<string, string> = { '0': 'بدون سكر', '50': 'نص سكر', '100': 'سكر زيادة' };
        const sizeMap: Record<string, string> = { 'S': 'صغير', 'M': 'وسط', 'L': 'كبير' };
        const notesParts: string[] = [];
        if (aiItem.size && aiItem.size !== 'M') notesParts.push(`الحجم: ${sizeMap[aiItem.size]}`);
        notesParts.push(`السكر: ${sugarMap[aiItem.sugar] || 'نص سكر'}`);
        if (aiItem.extras?.length) notesParts.push(`إضافات: ${aiItem.extras.join(', ')}`);
        if (aiItem.notes) notesParts.push(`ملاحظات: ${aiItem.notes}`);
        if (session.aiOrderNotes) notesParts.push(`Notes: ${session.aiOrderNotes}`);

        orderItems.push({
          productId: matched.id,
          quantity: aiItem.quantity,
          unitPrice: matched.price,
          notes: notesParts.join(' | ') || null,
        });
      }

      if (!orderItems.length) {
        await this.deleteSession(session.phone);
        return 'عذراً، لم نتمكن من إيجاد المنتجات المطلوبة. حاول مرة تانية.';
      }

      const totalAmount = orderItems.reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0);

      const order = await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.upsert({
          where: { cafeId_branchId_phone: { cafeId, branchId: targetBranchId, phone: session.phone } },
          update: {
            totalOrders: { increment: 1 },
            totalSpent: { increment: new Prisma.Decimal(totalAmount) },
            lastOrderDate: new Date(),
            name: session.customerName || undefined,
          },
          create: {
            cafeId, branchId: targetBranchId,
            phone: session.phone,
            name: session.customerName || 'عميل',
            totalOrders: 1,
            totalSpent: new Prisma.Decimal(totalAmount),
            lastOrderDate: new Date(),
          },
        });

        const code = await this.generateOrderCode(tx);
        const created = await tx.order.create({
          data: {
            cafeId,
            branchId: targetBranchId,
            code,
            customerId: customer.id,
            status: 'NEW',
            type: isTelegram ? 'TELEGRAM' : 'WHATSAPP',
            sourceType: isTelegram ? 'TELEGRAM_ORDER' : 'WHATSAPP_ORDER',
            source: isTelegram ? 'TELEGRAM' : 'WHATSAPP',
            total: new Prisma.Decimal(totalAmount),
            items: { create: orderItems },
          },
          include: { customer: true, items: { include: { product: true } } },
        });

        const staff = await tx.staff.findFirst({
          where: { cafeId, active: true },
          select: { id: true },
        });
        await tx.inCafeOrder.create({
          data: {
            cafeId, branchId: targetBranchId, code,
            customerName: session.customerName || 'عميل',
            customerPhone: session.phone.replace('tg_', ''),
            customerId: customer.id,
            notes: orderItems.map(i => i.notes).filter(Boolean).join(' | ') || null,
            createdById: staff?.id ?? null,
            status: 'NEW',
            total: new Prisma.Decimal(totalAmount),
            orderType: 'DELIVERY',
            sourceType: isTelegram ? 'TELEGRAM_ORDER' : 'WHATSAPP_ORDER',
            items: {
              create: orderItems.map(i => ({
                cafeId,
                productId: i.productId,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
              })),
            },
          },
        });

        return created;
      });

      this.eventsService.broadcast('order.created', {
        orderId: order.id, code: order.code,
        total: Number(order.total), customerId: order.customerId,
        customerPhone: order.customer.phone,
        type: order.type, sourceType: order.sourceType, status: order.status,
      });

      this.eventsService.emitToBarista('inCafe.order.created', {
        order: {
          id: order.id, code: order.code, status: 'NEW',
          total: Number(order.total),
          customerName: session.customerName || 'عميل',
          sourceType: isTelegram ? 'TELEGRAM_ORDER' : 'WHATSAPP_ORDER', cafeId,
        },
      });

      this.sendToKitchen(order);
      this.customerLearningService.learn(cafeId!, order.customerId).catch(e => this.logger.error(`Learn failed: ${e.message}`));
      await this.deleteSession(session.phone);
      const confirmCtx = this.buildReplyCtx({ deliveryEstimate: '10–14 دقيقة' });
      const confirmReply = this.replyEngine.orderConfirmedReply(confirmCtx);
      return `${confirmReply.message}\n\nرقم الطلب: ${order.code}`;
    } catch (err) {
      this.logger.error(`AI order confirmation failed: ${(err as Error).message}`);
      return 'عذراً، حدث خطأ أثناء تأكيد الطلب. حاول مرة تانية.';
    }
  }

  private matchProductName(name: string, products: Array<{ id: string; name: string; price: any }>): { id: string; name: string; price: any } | null {
    const cleaned = name.toLowerCase().trim();
    if (!cleaned) return null;

    const exact = products.find(p => p.name.toLowerCase() === cleaned);
    if (exact) return exact;

    const contains = products.find(p =>
      p.name.toLowerCase().includes(cleaned) || cleaned.includes(p.name.toLowerCase())
    );
    if (contains) return contains;

    return null;
  }

  private parseOptionNotes(notes: string | null): string[] {
    if (!notes) return [];
    const lines: string[] = [];
    const parts = notes.split(' | ');
    for (const part of parts) {
      if (part.startsWith('Notes:')) continue;
      if (part.includes(':')) lines.push(part.trim());
    }
    return lines;
  }

  private async tryApplyMemoryCommand(
    phone: string,
    message: string,
    cafeId?: string,
  ): Promise<string | null> {
    if (!cafeId || !this.customerMemory.parseExplicitCommand(message)) return null;
    const customer = await this.prisma.customer.findFirst({
      where: { cafeId, phone },
      select: { id: true },
    });
    if (!customer) return null;
    try {
      const result = await this.customerMemory.applyExplicitCommand({
        cafeId,
        customerId: customer.id,
        channel: phone.startsWith('tg_') ? 'TELEGRAM' : 'WHATSAPP',
        channelIdentity: phone,
      }, message);
      return result.handled ? result.response! : null;
    } catch {
      return null;
    }
  }

  private memoryScope(session: OrderFlowSession): CustomerMemoryScope {
    if (!session.cafeId || !session.customerId) throw new Error('Missing customer memory scope');
    return {
      cafeId: session.cafeId,
      customerId: session.customerId,
      channel: session.phone.startsWith('tg_') ? 'TELEGRAM' : 'WHATSAPP',
      channelIdentity: session.phone,
    };
  }

  private formatRepeatPreview(preview: RepeatOrderPreview, customerName?: string): string {
    const itemLines = preview.items.map((item) => {
      const price = item.available ? `${item.currentUnitPrice!.toFixed(2)} ج` : 'غير متاح حالياً';
      const changed = item.priceChanged ? ' (السعر اتغير)' : '';
      return `${item.quantity}× ${item.productName} - ${price}${changed}`;
    });
    const greeting = customerName ? `يا ${customerName}، ` : '';
    const base = `${greeting}آخر طلب مؤهل كان:\n${itemLines.join('\n')}\n\nالسعر الحالي للمتاح: ${preview.currentTotal.toFixed(2)} ج`;
    if (preview.unavailableItems.length) {
      const unavailable = preview.unavailableItems.map((item) => item.productName).join('، ');
      return `${base}\n\nغير متاح: ${unavailable}\n1 للمتابعة بالمنتجات المتاحة فقط\n2 لطلب جديد`;
    }
    return `${base}\n\n1 لتأكيد تكرار الطلب\n2 لطلب جديد`;
  }

  private async handleRepeatUnavailableDecision(session: OrderFlowSession, message: string): Promise<string> {
    const lower = message.toLowerCase().trim();
    if (lower === '1' || /المتاح|كمل|اكمل|continue/.test(lower)) {
      const preview = session.repeatPreview;
      if (!preview) return this.startFlow(session.phone, session.cafeId, session.replyJid);
      const availableItems = preview.items.filter((item) => item.available);
      if (!availableItems.length) {
        session.step = 'CATEGORY';
        const menu = (await this.getActiveCategories(session.cafeId))
          .map((category, index) => `${index + 1}. ${category.icon || ''} ${category.name}`)
          .join('\n');
        return `مفيش منتج متاح من الطلب السابق حالياً.\n${menu}`;
      }
      session.repeatIncludedProductIds = availableItems.map((item) => item.productId);
      session.repeatPreview = this.filterRepeatPreview(preview, new Set(session.repeatIncludedProductIds));
      session.step = 'REPEAT_CONFIRMATION';
      await this.saveSession(session.phone, session);
      return this.formatRepeatPreview(session.repeatPreview, session.customerName);
    }

    if (lower === '2' || /جديد|تغيير|غير|menu|منيو/.test(lower)) {
      session.step = 'CATEGORY';
      session.repeatPreview = undefined;
      session.repeatIncludedProductIds = undefined;
      const menu = (await this.getActiveCategories(session.cafeId))
        .map((category, index) => `${index + 1}. ${category.icon || ''} ${category.name}`)
        .join('\n');
      await this.saveSession(session.phone, session);
      return `تمام، اختار طلب جديد:\n${menu}`;
    }

    return this.formatRepeatPreview(session.repeatPreview!, session.customerName);
  }

  private async handleRepeatConfirmation(session: OrderFlowSession, message: string): Promise<string> {
    const lower = message.toLowerCase().trim();
    if (lower === '1' || /^(نعم|ايوه|أيوه|yes|ok|تمام|تاكيد|تأكيد)$/.test(lower)) {
      return this.confirmRepeatPreview(session);
    }
    if (lower === '2' || /^(لا|no|جديد|تعديل)$/.test(lower)) {
      session.step = 'CATEGORY';
      session.repeatPreview = undefined;
      session.repeatIncludedProductIds = undefined;
      const menu = (await this.getActiveCategories(session.cafeId))
        .map((category, index) => `${index + 1}. ${category.icon || ''} ${category.name}`)
        .join('\n');
      await this.saveSession(session.phone, session);
      return `تمام، الطلب السابق مش هيتكرر. اختار طلبك:\n${menu}`;
    }
    return this.formatRepeatPreview(session.repeatPreview!, session.customerName);
  }

  private filterRepeatPreview(preview: RepeatOrderPreview, included: Set<string>): RepeatOrderPreview {
    const items = preview.items.filter((item) => included.has(item.productId));
    const unavailableItems = items.filter((item) => !item.available);
    return {
      ...preview,
      items,
      unavailableItems,
      currentTotal: items.reduce(
        (total, item) => total + (item.available ? item.currentUnitPrice! * item.quantity : 0),
        0,
      ),
      priceChanged: items.some((item) => item.priceChanged),
      canConfirmAll: items.length > 0 && unavailableItems.length === 0,
    };
  }

  private async confirmRepeatPreview(session: OrderFlowSession): Promise<string> {
    try {
      const storedPreview = session.repeatPreview;
      const cafeId = session.cafeId;
      const branchId = session.branchId;
      if (!storedPreview || !cafeId || !branchId || !session.customerId) {
        throw new Error('Missing repeat order scope');
      }

      const current = await this.customerMemory.buildRepeatOrderPreview(
        this.memoryScope(session),
        storedPreview.sourceOrderId,
      );
      if (!current) throw new Error('Repeat source order is no longer eligible');

      const includedIds = new Set(
        session.repeatIncludedProductIds || storedPreview.items.filter((item) => item.available).map((item) => item.productId),
      );
      const scopedCurrent = this.filterRepeatPreview(current, includedIds);
      if (!scopedCurrent.items.length) throw new Error('No repeat items remain');
      if (scopedCurrent.unavailableItems.length) {
        session.repeatPreview = scopedCurrent;
        session.step = 'REPEAT_UNAVAILABLE_DECISION';
        await this.saveSession(session.phone, session);
        return this.formatRepeatPreview(scopedCurrent, session.customerName);
      }

      const previousPrices = new Map(storedPreview.items.map((item) => [item.productId, item.currentUnitPrice]));
      const priceChangedSincePreview = scopedCurrent.items.some(
        (item) => previousPrices.get(item.productId) !== item.currentUnitPrice,
      );
      if (priceChangedSincePreview) {
        session.repeatPreview = scopedCurrent;
        session.step = 'REPEAT_CONFIRMATION';
        await this.saveSession(session.phone, session);
        return `السعر اتغير قبل التأكيد، راجع الطلب مرة تانية:\n\n${this.formatRepeatPreview(scopedCurrent, session.customerName)}`;
      }

      const products = await this.prisma.product.findMany({
        where: { cafeId, id: { in: [...includedIds] }, active: true },
        select: { id: true, name: true, price: true },
      });
      if (products.length !== includedIds.size) {
        session.repeatPreview = scopedCurrent;
        session.step = 'REPEAT_UNAVAILABLE_DECISION';
        await this.saveSession(session.phone, session);
        return this.formatRepeatPreview(scopedCurrent, session.customerName);
      }

      const productMap = new Map(products.map((product) => [product.id, product]));
      const repeatItems = scopedCurrent.items.map((item) => ({
        ...item,
        product: productMap.get(item.productId)!,
      }));
      const totalAmount = repeatItems.reduce(
        (total, item) => total + Number(item.product.price) * item.quantity,
        0,
      );
      const isTelegram = session.phone.startsWith('tg_');

      const order = await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findFirst({
          where: { id: session.customerId, cafeId, phone: session.phone },
          select: { id: true, name: true, phone: true, preferredProducts: true },
        });
        if (!customer) throw new Error('Repeat customer scope rejected');

        const previous = customer.preferredProducts && typeof customer.preferredProducts === 'object' && !Array.isArray(customer.preferredProducts)
          ? { ...(customer.preferredProducts as Record<string, unknown>) }
          : {};
        for (const item of repeatItems) {
          const existingCount = typeof previous[item.productId] === 'number' ? previous[item.productId] as number : 0;
          previous[item.productId] = existingCount + item.quantity;
        }
        const updated = await tx.customer.updateMany({
          where: { id: customer.id, cafeId, phone: session.phone },
          data: {
            totalOrders: { increment: 1 },
            totalSpent: { increment: new Prisma.Decimal(totalAmount) },
            lastOrderDate: new Date(),
            preferredProducts: previous as Prisma.InputJsonValue,
          },
        });
        if (updated.count !== 1) throw new Error('Repeat customer update scope rejected');

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
              create: repeatItems.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.product.price,
                notes: item.notes || null,
              })),
            },
          },
          include: { customer: true, items: { include: { product: true } } },
        });

        const staff = await tx.staff.findFirst({ where: { cafeId, active: true }, select: { id: true } });
        await tx.inCafeOrder.create({
          data: {
            cafeId,
            branchId,
            code,
            customerName: customer.name || session.customerName || 'عميل',
            customerPhone: session.phone.replace('tg_', ''),
            customerId: customer.id,
            notes: null,
            createdById: staff?.id ?? null,
            status: 'NEW',
            total: new Prisma.Decimal(totalAmount),
            orderType: 'DELIVERY',
            sourceType: isTelegram ? 'TELEGRAM_ORDER' : 'WHATSAPP_ORDER',
            items: {
              create: repeatItems.map((item) => ({
                cafeId,
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.product.price,
                notes: item.notes || null,
              })),
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
      this.sendToKitchen(order);
      await this.customerMemory.observeOrder(this.memoryScope(session), {
        orderId: order.id,
        status: 'CONFIRMED',
        products: repeatItems.map((item) => item.productId),
      }).catch(() => false);
      this.customerMemory.recordRepeatOrderConfirmed();
      if (session.stage7UsualOrder && session.cafeId) {
        this.customerUnderstanding?.recordUsualOrderSuccess(session.cafeId);
      }
      this.customerMemory.recordOrderCompleted(
        session.questionCount || 0,
        Date.now() - (session.startedAt || Date.now()),
        true,
      );
      this.customerLearningService.learn(cafeId, order.customerId).catch((error) =>
        this.logger.error(`Learn failed: ${error.message}`),
      );
      await this.deleteSession(session.phone);
      const repeatCtx = this.buildReplyCtx({ customerName: session.customerName, deliveryEstimate: '10–14 دقيقة' });
      const repeatReply = this.replyEngine.orderConfirmedReply(repeatCtx);
      return `${repeatReply.message}\n\nرقم الطلب: ${order.code}`;
    } catch (error) {
      this.logger.error(`Repeat order confirmation failed: ${(error as Error).message}`);
      return 'عذراً، تعذر تكرار الطلب بأمان. اختار طلب جديد.';
    }
  }

  private async repeatLastOrder(session: OrderFlowSession): Promise<string> {
    if (!session.customerId || !session.cafeId) {
      session.step = 'CATEGORY';
      return `تحب ايه؟\n${(await this.getActiveCategories(session.cafeId)).map((c, i) => `${i + 1}. ${c.icon || ''} ${c.name}`).join('\n')}`;
    }
    const preview = await this.customerMemory.buildRepeatOrderPreview(this.memoryScope(session));
    if (!preview) {
      session.step = 'CATEGORY';
      const menu = (await this.getActiveCategories(session.cafeId))
        .map((category, index) => `${index + 1}. ${category.icon || ''} ${category.name}`)
        .join('\n');
      return `مفيش طلب سابق مكتمل ومؤهل للتكرار.\n${menu}`;
    }
    session.repeatPreview = preview;
    session.repeatIncludedProductIds = preview.items.filter((item) => item.available).map((item) => item.productId);
    session.step = preview.unavailableItems.length ? 'REPEAT_UNAVAILABLE_DECISION' : 'REPEAT_CONFIRMATION';
    await this.saveSession(session.phone, session);
    return this.formatRepeatPreview(preview, session.customerName);
  }

  private recommendationContext(
    session: OrderFlowSession,
    mode: RecommendationContext['mode'],
    currentMessage = '',
  ): RecommendationContext {
    if (!session.cafeId || !session.branchId) throw new Error('Missing recommendation tenant scope');
    const productId = session.productId || session.selectedProductId;
    const productPrice = session.productPrice ?? session.selectedProductPrice;
    const cart: RecommendationContext['cart'] = productId && productPrice !== undefined
      ? [{
          productId,
          quantity: session.quantity || 1,
          unitPrice: productPrice,
          variantId: session.selectedSizeId,
          variantName: session.selectedSizeName,
        }]
      : [];
    for (const item of session.recommendationItems || []) {
      cart.push({ productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice });
    }
    return {
      cafeId: session.cafeId,
      branchId: session.branchId,
      customerId: session.customerId,
      memoryScope: session.customerId ? this.memoryScope(session) : undefined,
      channel: session.phone.startsWith('tg_') ? 'TELEGRAM' : 'WHATSAPP',
      mode,
      currentMessage,
      cart,
      fulfillmentMethod: 'DELIVERY',
      session: this.recommendationSessionState(session),
    };
  }

  private recommendationSessionState(session: OrderFlowSession): RecommendationSessionState {
    return {
      commercialSuggestionsShown: session.commercialSuggestionsShown || 0,
      upsellShown: Boolean(session.upsellShown),
      crossSellShown: Boolean(session.crossSellShown),
      rejectedCandidateKeys: [...(session.rejectedRecommendationKeys || [])],
      shownCandidateKeys: [...(session.shownRecommendationKeys || [])],
      optOut: Boolean(session.recommendationOptOut),
      complaint: Boolean(session.recommendationComplaint),
      frustrated: false,
      repeatedMisunderstanding: false,
      urgent: false,
      queueDepth: 0,
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

  private async maybeOfferRecommendation(session: OrderFlowSession): Promise<string | null> {
    if (!session.productId || !session.cafeId || !session.branchId || session.recommendationOptOut) return null;
    try {
      const context = this.recommendationContext(session, 'PROACTIVE');
      context.session.queueDepth = await this.loadActiveQueueDepth(session.cafeId, session.branchId);
      const decision = await this.recommendations.recommend(context);
      const candidate = decision.recommendations[0];
      if (!candidate) return null;
      const message = this.recommendations.formatRecommendations([candidate]);
      const shown = await this.recommendations.markShown(context, candidate, message);
      session.orderValueBeforeRecommendation = this.calculateOrderTotal(session);
      session.pendingRecommendation = shown;
      session.commercialSuggestionsShown = (session.commercialSuggestionsShown || 0) + 1;
      session.shownRecommendationKeys = [...(session.shownRecommendationKeys || []), shown.trackingKey];
      if (this.isUpsellType(shown.type)) session.upsellShown = true;
      if (shown.type === 'COMPLEMENTARY_PRODUCT' || shown.type === 'OFFER_BASED_RECOMMENDATION') {
        session.crossSellShown = true;
      }
      session.step = 'RECOMMENDATION_PENDING';
      return message;
    } catch {
      return null;
    }
  }

  private async handleRecommendationRequest(session: OrderFlowSession, message: string): Promise<string> {
    if (!session.cafeId || !session.branchId) return 'تحبها سخنة ولا ساقعة؟';
    try {
      const context = this.recommendationContext(session, 'CUSTOMER_REQUEST', message);
      const decision = await this.recommendations.recommend(context);
      if (!decision.recommendations.length) {
        session.step = 'CATEGORY';
        return decision.clarification || 'ممكن تحدد تحب مشروب ولا أكل، وفي حدود كام جنيه؟';
      }
      const shown: RecommendationCandidate[] = [];
      for (const candidate of decision.recommendations.slice(0, 3)) {
        shown.push(await this.recommendations.markShown(
          context,
          candidate,
          this.recommendations.formatRecommendations([candidate]),
        ));
      }
      session.recommendationChoices = shown;
      session.step = 'RECOMMENDATION_CHOICES';
      return this.recommendations.formatRecommendations(shown);
    } catch {
      session.step = 'CATEGORY';
      return 'تمام، نكمل الطلب. تحب مشروب ولا أكل؟';
    }
  }

  private async handleRecommendationChoice(session: OrderFlowSession, message: string): Promise<string> {
    const choices = session.recommendationChoices || [];
    const normalized = message.trim().toLowerCase();
    const numeric = Number(normalized.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))));
    const selected = Number.isInteger(numeric) && numeric >= 1 && numeric <= choices.length
      ? choices[numeric - 1]
      : choices.find((candidate) =>
          candidate.productName.toLowerCase() === normalized || candidate.productName.toLowerCase().includes(normalized),
        );
    if (!selected) return `${this.recommendations.formatRecommendations(choices)}\nاكتب الرقم أو الاسم.`;

    const context = this.recommendationContext(session, 'CUSTOMER_REQUEST', message);
    const verified = await this.recommendations.revalidateForAcceptance(context, selected);
    if (!verified) {
      session.recommendationChoices = choices.filter((candidate) => candidate.trackingKey !== selected.trackingKey);
      if (!session.recommendationChoices.length) {
        session.step = 'CATEGORY';
        return 'الاختيار مش متاح دلوقتي. تحب مشروب ولا أكل؟';
      }
      return `الاختيار مش متاح دلوقتي.\n${this.recommendations.formatRecommendations(session.recommendationChoices)}`;
    }

    session.productId = verified.productId;
    session.productName = verified.productName;
    session.productPrice = verified.currentPrice;
    session.categoryName = verified.category;
    session.quantity = 1;
    session.recommendationChoices = undefined;
    session.step = 'QUANTITY';
    await this.recommendations.recordOutcome(context, verified, true);
    return `تمام، اخترت ${verified.productName}. كام الكمية؟`;
  }

  private async handlePendingRecommendation(session: OrderFlowSession, message: string): Promise<string> {
    const candidate = session.pendingRecommendation;
    if (!candidate) {
      session.step = 'SUMMARY';
      return this.buildSummary(session);
    }
    const lower = message.toLowerCase().trim();
    const context = this.recommendationContext(session, 'PROACTIVE', message);

    if (this.recommendations.isComplaintMessage(message)) {
      session.recommendationComplaint = true;
      this.recommendations.recordComplaintAfterSuggestion();
      return this.finishPendingRecommendationWithoutAcceptance(session, false);
    }

    if (/^(1|نعم|ايوه|أيوه|yes|ok|تمام|موافق)/.test(lower)) {
      const verified = await this.recommendations.revalidateForAcceptance(context, candidate);
      if (!verified) {
        session.pendingRecommendation = undefined;
        session.step = 'SUMMARY';
        return `الاقتراح مش متاح دلوقتي، نكمل الطلب زي ما هو.\n\n${this.buildSummary(session)}`;
      }
      const applied = this.applyRecommendationToDraft(session, verified);
      if (!applied) {
        session.pendingRecommendation = undefined;
        session.step = 'SUMMARY';
        return `تمام، نكمل الطلب زي ما هو.\n\n${this.buildSummary(session)}`;
      }
      await this.recommendations.recordOutcome(context, verified, true);
      session.pendingRecommendation = undefined;
      session.step = 'SUMMARY';
      return `تمام، عدلت الطلب.\n\n${this.buildSummary(session)}`;
    }

    if (/^(لا|no|بلاش|مش عايز)/.test(lower)) {
      await this.recommendations.recordOutcome(context, candidate, false, 'CURRENT_ORDER_ONLY');
      session.rejectedRecommendationKeys = [...(session.rejectedRecommendationKeys || []), candidate.trackingKey];
      session.pendingRecommendation = undefined;
      if (/كبير|large/.test(lower)) await this.applyRequestedLargeSize(session);
      session.step = 'SUMMARY';
      return `تمام، نكمل الطلب كده.\n\n${this.buildSummary(session)}`;
    }

    return `${this.recommendations.formatRecommendations([candidate])}\nرد بنعم أو لا.`;
  }

  private async finishPendingRecommendationWithoutAcceptance(
    session: OrderFlowSession,
    optOut: boolean,
  ): Promise<string> {
    const candidate = session.pendingRecommendation;
    if (candidate && session.cafeId && session.branchId) {
      const context = this.recommendationContext(session, 'PROACTIVE');
      await this.recommendations.recordOutcome(context, candidate, false, 'CURRENT_ORDER_ONLY');
      session.rejectedRecommendationKeys = [...(session.rejectedRecommendationKeys || []), candidate.trackingKey];
    }
    session.pendingRecommendation = undefined;
    if (session.productId || session.selectedProductId) {
      session.step = 'SUMMARY';
      const prefix = optOut
        ? 'تمام، هكمل الطلب من غير اقتراحات.'
        : 'حقك عليا، نكمل الطلب من غير أي اقتراح.';
      return `${prefix}\n\n${this.buildSummary(session)}`;
    }
    session.step = 'CATEGORY';
    return optOut ? 'تمام، هنكمل من غير اقتراحات. تحب تطلب إيه؟' : 'حقك عليا. تحب تطلب إيه؟';
  }

  private applyRecommendationToDraft(session: OrderFlowSession, candidate: RecommendationCandidate): boolean {
    if (candidate.type === 'SIZE_UPGRADE') {
      session.productPrice = candidate.currentPrice;
      session.selectedSizeId = candidate.variantId;
      session.selectedSizeName = candidate.variantName;
      return true;
    }
    if (['ADD_ON', 'EXTRA_SHOT', 'MILK_UPGRADE'].includes(candidate.type)) {
      session.productPrice = (session.productPrice || 0) + candidate.currentPrice;
      session.notes.push(`إضافة: ${candidate.variantName || candidate.productName}`);
      return true;
    }
    if (candidate.type === 'PREMIUM_VARIANT' || candidate.type === 'ALTERNATIVE_PRODUCT') {
      session.productId = candidate.productId;
      session.productName = candidate.productName;
      session.productPrice = candidate.currentPrice;
      return true;
    }
    if (candidate.type === 'COMBO_UPGRADE' && candidate.bundleItems?.length && candidate.discountedPrice) {
      const existingIds = new Set([session.productId, ...(session.recommendationItems || []).map((item) => item.productId)]);
      const missing = candidate.bundleItems.filter((item) => !existingIds.has(item.productId));
      if (!missing.length) return false;
      const totalWeight = missing.reduce((sum, item) => sum + item.unitPrice, 0) || 1;
      let remaining = candidate.estimatedAddedValue;
      session.recommendationItems = [...(session.recommendationItems || []), ...missing.map((item, index) => {
        const unitPrice = index === missing.length - 1
          ? remaining
          : Math.round(candidate.estimatedAddedValue * (item.unitPrice / totalWeight) * 100) / 100;
        remaining = Math.round((remaining - unitPrice) * 100) / 100;
        return { ...item, unitPrice, notes: `كومبو ${candidate.variantId || ''}` };
      })];
      return true;
    }
    if (candidate.type === 'COMPLEMENTARY_PRODUCT' || candidate.type === 'OFFER_BASED_RECOMMENDATION') {
      if ((session.recommendationItems || []).some((item) => item.productId === candidate.productId)) return false;
      session.recommendationItems = [
        ...(session.recommendationItems || []),
        {
          productId: candidate.productId,
          productName: candidate.productName,
          quantity: 1,
          unitPrice: candidate.currentPrice,
        },
      ];
      return true;
    }
    return false;
  }

  private async applyRequestedLargeSize(session: OrderFlowSession): Promise<boolean> {
    if (!session.cafeId || !session.branchId || !session.productId) return false;
    const product = await this.prisma.product.findFirst({
      where: { id: session.productId, cafeId: session.cafeId, active: true },
      include: {
        sizes: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
        branchProducts: { where: { branchId: session.branchId } },
      },
    });
    if (!product) return false;
    const large = product.sizes.find((size: any) => /كبير|large/i.test(size.name));
    if (!large) return false;
    const branchPrice = product.branchProducts[0]?.isAvailable ? Number(product.branchProducts[0].price) : Number(product.price);
    session.productPrice = branchPrice + Number(large.priceAdjust);
    session.selectedSizeId = large.id;
    session.selectedSizeName = large.name;
    return true;
  }

  private isUpsellType(type: RecommendationCandidate['type']): boolean {
    return ['SIZE_UPGRADE', 'PREMIUM_VARIANT', 'ADD_ON', 'EXTRA_SHOT', 'MILK_UPGRADE', 'COMBO_UPGRADE'].includes(type);
  }

  private calculateOrderTotal(session: OrderFlowSession): number {
    const basePrice = session.productPrice ?? session.selectedProductPrice ?? 0;
    const baseTotal = basePrice * (session.quantity || 1);
    const additions = (session.recommendationItems || []).reduce(
      (total, item) => total + item.unitPrice * item.quantity,
      0,
    );
    return Math.round((baseTotal + additions) * 100) / 100;
  }

  private matchChoiceFromNotes(notes: string, optionName: string, choices: any[]): string | null {
    const parts = notes.split(' | ');
    for (const part of parts) {
      const [key, ...valParts] = part.split(':');
      if (key.trim() === optionName) {
        const val = valParts.join(':').trim();
        const match = choices.find((c: any) => c.label === val);
        return match ? val : null;
      }
    }
    return null;
  }

  private async handleCategory(session: OrderFlowSession, message: string): Promise<string> {
    const categories = await this.getActiveCategories(session.cafeId);
    const matched = this.matchCategory(message, categories);

    if (!matched) {
      const fallback = await this.tryAIFallback(session, message);
      if (fallback) return fallback;
      const menu = categories.map((c, i) => `${i + 1}. ${c.icon || ''} ${c.name}`).join('\n');
      return `اختر من القائمة:\n${menu}`;
    }

    session.categoryId = matched.id;
    session.categoryName = matched.name;

    return this.showCategoryProducts(session);
  }

  private async getActiveCategories(cafeId?: string) {
    const where: any = { active: true };
    if (cafeId) where.cafeId = cafeId;
    return this.prisma.productCategory.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });
  }

  private matchCategory(input: string, categories: any[]): any | null {
    const name = input.toLowerCase().trim();
    if (!name) return null;
    const exact = categories.find(c => c.name.toLowerCase() === name);
    if (exact) return exact;
    const numeric = parseInt(name);
    if (!isNaN(numeric) && numeric >= 1 && numeric <= categories.length) {
      return categories[numeric - 1];
    }
    const contains = categories.find(c => c.name.toLowerCase().includes(name) || name.includes(c.name.toLowerCase()));
    return contains || null;
  }

  private async showCategoryProducts(session: OrderFlowSession): Promise<string> {
    const where: any = { active: true };
    if (session.categoryId) where.categoryId = session.categoryId;
    if (session.cafeId) where.cafeId = session.cafeId;
    const products = await this.prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { branchProducts: { where: { branchId: session.branchId } } },
    });
    const availableProducts = products.filter((product: any) =>
      !product.branchProducts?.length || product.branchProducts.some((entry: any) => entry.isAvailable),
    );
    if (!availableProducts.length) {
      const categories = await this.getActiveCategories(session.cafeId);
      const menu = categories.map((c, i) => `${i + 1}. ${c.icon || ''} ${c.name}`).join('\n');
      return 'لا توجد منتجات في هذا القسم حالياً.\nاختر قسم آخر:\n' + menu;
    }
    session.step = 'PRODUCT_SELECT';
    session.tempMessage = availableProducts.map((p, i) => `${i + 1}. ${p.emoji || ''} ${p.name} (${Number(p.branchProducts?.[0]?.price ?? p.price).toFixed(0)} ج)`).join('\n');
    return `المنتجات المتاحة:\n${session.tempMessage}\n\nاكتب الاسم أو الرقم`;
  }

  private async handleProductSelect(session: OrderFlowSession, message: string): Promise<string> {
    const where: any = { active: true };
    if (session.categoryId) where.categoryId = session.categoryId;
    if (session.cafeId) where.cafeId = session.cafeId;
    const products = await this.prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { branchProducts: { where: { branchId: session.branchId } } },
    });
    const availableProducts = products.filter((product: any) =>
      !product.branchProducts?.length || product.branchProducts.some((entry: any) => entry.isAvailable),
    );
    const matched = this.matchProduct(message, availableProducts);
    if (!matched) {
      const unavailable = session.cafeId ? await this.prisma.product.findFirst({
        where: {
          cafeId: session.cafeId,
          ...(session.categoryId ? { categoryId: session.categoryId } : {}),
          name: { contains: message.trim(), mode: 'insensitive' },
        },
        select: { id: true, name: true },
      }) : null;
      if (unavailable && session.branchId) {
        const recommendationContext = this.recommendationContext(session, 'UNAVAILABLE_ALTERNATIVE', message);
        recommendationContext.unavailableProductId = unavailable.id;
        const decision = await this.recommendations.recommend(recommendationContext);
        if (decision.recommendations.length) {
          session.recommendationChoices = decision.recommendations;
          session.step = 'RECOMMENDATION_CHOICES';
          return `${unavailable.name} مش متاح حالياً.\n${this.recommendations.formatRecommendations(decision.recommendations)}`;
        }
      }
      const fallback = await this.tryAIFallback(session, message);
      if (fallback) return fallback;
      return 'هذا المنتج غير متوفر. اختر من القائمة:\n' + session.tempMessage;
    }
    session.productId = matched.id;
    session.productName = matched.name;
    session.productPrice = Number(matched.branchProducts?.[0]?.price ?? matched.price);

    session.step = 'QUANTITY';
    return `اخترت ${matched.name}. كم الكمية؟\n(اكتب رقم أو اتركها 1)`;
  }

  private async handleQuantity(session: OrderFlowSession, message: string): Promise<string> {
    const lower = message.toLowerCase().trim();

    const arabicDigits = lower.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const numeric = arabicDigits.match(/^(\d+)$/);
    if (numeric) {
      session.quantity = Math.max(1, Number(numeric[1]));
    } else if (/^(واحد|one|1)$/i.test(lower) || lower === '') {
      session.quantity = 1;
    } else if (/^(اتنين|اثنين|two|2)$/i.test(lower)) {
      session.quantity = 2;
    } else if (/^(تلاتة|ثلاثة|three|3)$/i.test(lower)) {
      session.quantity = 3;
    } else {
      const fallback = await this.tryAIFallback(session, message);
      if (fallback) return fallback;
      session.quantity = 1;
    }

    // Check for dynamic product options
    const productId = session.productId;
    if (productId) {
      const options = await this.prisma.productOption.findMany({
        where: { productId, cafeId: session.cafeId },
        orderBy: { sortOrder: 'asc' },
      });
      if (options.length > 0) {
        session.optionsCache = options;
        session.selectedOptions = {};
        session.currentOptionIndex = 0;
        session.step = 'OPTION_PROMPT';
        return this.showCurrentOption(session);
      }
    }

    session.step = 'NOTES';
    return 'أي ملاحظات للشيف؟\n(لو عايز تكتب حاجة اكتبها دلوقتي، ولا أكتب "لا")';
  }

  private showCurrentOption(session: OrderFlowSession): string {
    const option = session.optionsCache[session.currentOptionIndex];
    const choices = option.choices.map((c: any, i: number) =>
      `${i + 1}. ${c.label}${c.priceAdjust ? ` (+${c.priceAdjust} ج)` : ''}`
    ).join('\n');
    return `${option.name}:\n${choices}\n\nاكتب الاسم أو الرقم`;
  }

  private matchChoice(input: string, choices: any[]): any | null {
    const name = input.toLowerCase().trim();
    if (!name) return null;
    const exact = choices.find((c: any) => c.label.toLowerCase() === name);
    if (exact) return exact;
    const numeric = parseInt(name);
    if (!isNaN(numeric) && numeric >= 1 && numeric <= choices.length) {
      return choices[numeric - 1];
    }
    const contains = choices.find(
      (c: any) => c.label.toLowerCase().includes(name) || name.includes(c.label.toLowerCase()),
    );
    return contains || null;
  }

  private async handleOptionResponse(session: OrderFlowSession, message: string): Promise<string> {
    const option = session.optionsCache[session.currentOptionIndex];
    const choice = this.matchChoice(message, option.choices);
    if (!choice) {
      const fallback = await this.tryAIFallback(session, message);
      if (fallback) return fallback;
      return 'اختيار غير صحيح.\n' + this.showCurrentOption(session);
    }
    session.selectedOptions[option.id] = choice.label;
    session.currentOptionIndex++;
    if (session.currentOptionIndex >= session.optionsCache.length) {
      session.step = 'QUANTITY';
      const name = session.productName || session.selectedProductName || '';
      return `كم الكمية من ${name}؟\n(اكتب رقم)`;
    }
    return this.showCurrentOption(session);
  }

  private async handleNotes(session: OrderFlowSession, message: string): Promise<string> {
    const lower = message.toLowerCase();
    if (!lower.includes('لا') && lower !== 'no' && lower !== '') {
      session.notes.push(message);
    }

    const recommendationReply = await this.maybeOfferRecommendation(session);
    if (recommendationReply) return recommendationReply;
    session.step = 'SUMMARY';
    return this.buildSummary(session);
  }

  private buildSummary(session: OrderFlowSession): string {
    const itemName = session.productName || session.selectedProductName || '';
    const total = this.calculateOrderTotal(session).toFixed(2);
    const details = [];

    if (session.selectedSizeName) details.push(`  الحجم: ${session.selectedSizeName}`);

    for (const [optionId, choice] of Object.entries(session.selectedOptions)) {
      const option = session.optionsCache.find((o: any) => o.id === optionId);
      if (option) details.push(`  ${choice}`);
    }

    const notesStr = session.notes.length ? `\n📝 ملاحظات: ${session.notes.join(', ')}` : '';
    const recommendationLines = (session.recommendationItems || []).map((item) =>
      `- ${item.productName} × ${item.quantity}`,
    );
    const allItems = [`- ${itemName} × ${session.quantity}${details.length ? `\n${details.join('\n')}` : ''}`, ...recommendationLines];

    return `🧾 طلبك:\n${allItems.join('\n')}${notesStr}\n💰 الحساب: ${total} ج\n\n1️⃣ تأكيد الطلب\n2️⃣ إلغاء`;
  }

  private async handleSummary(session: OrderFlowSession, message: string): Promise<string> {
    const lower = message.toLowerCase();

    if (lower === '1' || lower.includes('نعم') || lower.includes('yes') || lower.includes('ايوه') || lower.includes('ok') || lower.includes('تأكيد')) {
      return this.confirmOrder(session);
    }

    if (lower === '2' || lower.includes('لا') || lower.includes('no') || lower.includes('إلغاء')) {
      if ((session.commercialSuggestionsShown || 0) > 0) this.recommendations.recordAbandonment();
      if (session.stage7Assisted && session.cafeId) this.customerUnderstanding?.recordAbandoned(session.cafeId);
      await this.deleteSession(session.phone);
      return 'تم إلغاء الطلب. ارسل أي رسالة عشان نبدأ من أول وجديد.';
    }

    return this.buildSummary(session) + '\n\n1️⃣ تأكيد الطلب\n2️⃣ إلغاء';
  }

  private async handleAiWaiterResponse(session: OrderFlowSession, message: string): Promise<string> {
    const lower = message.toLowerCase().trim();

    if (lower === '1' || lower.includes('نعم') || lower.includes('yes') || lower.includes('ايوه') || lower.includes('ok') || lower.includes('تأكيد')) {
      this.aiWaiterService.removePendingOffer(session.phone, session.cafeId);

      const cafeId = session.cafeId;
      const productName = session.usualOrderItems?.[0]?.productName;
      if (!cafeId || !productName) {
        await this.deleteSession(session.phone);
        return this.startFlow(session.phone, cafeId);
      }

      const product = await this.prisma.product.findFirst({
        where: { cafeId, name: { contains: productName, mode: 'insensitive' }, active: true },
        select: { id: true, name: true, price: true },
      });
      if (!product) {
        await this.deleteSession(session.phone);
        return 'عذراً، المنتج مش متاح دلوقتي. ارسل أي رسالة عشان نبدأ من أول.';
      }

      session.productId = product.id;
      session.productName = product.name;
      session.productPrice = Number(product.price);
      session.quantity = 1;
      session.step = 'SUMMARY';

      const summary = this.buildSummary(session);
      await this.saveSession(session.phone, session);
      return `${summary}\n\n1️⃣ تأكيد الطلب\n2️⃣ إلغاء`;
    }

    if (lower === '2' || lower.includes('لا') || lower.includes('no') || lower.includes('إلغاء')) {
      this.aiWaiterService.removePendingOffer(session.phone, session.cafeId);
      await this.deleteSession(session.phone);
      return 'تمام، لو احتجت حاجة أنا موجود.';
    }

    if (lower === '3' || lower.includes('تعديل') || lower.includes('تغيير') || lower.includes('غير') || lower.includes('edit')) {
      this.aiWaiterService.removePendingOffer(session.phone, session.cafeId);
      await this.deleteSession(session.phone);
      return this.startFlow(session.phone, session.cafeId, session.replyJid);
    }

    return 'كعادة بتحب:\n☕ ' + (session.usualOrderItems?.[0]?.productName || 'مشروبك المفضل') + '\n\n1️⃣ نعم\n2️⃣ لا\n3️⃣ تعديل الطلب';
  }

  private async confirmUsualOrder(session: OrderFlowSession): Promise<string> {
    // Legacy sessions are revalidated through the Stage 2 preview before any new order is created.
    if (session.customerId) return this.repeatLastOrder(session);
    try {
      const cafeId = session.cafeId;
      const targetBranchId = session.branchId;
      if (!cafeId || !targetBranchId) throw new Error('Missing cafe or branch');

      const isTelegram = session.phone.startsWith('tg_');

      const productIds = session.usualOrderItems!.map(i => i.productId);
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds }, cafeId },
        select: { id: true, name: true, price: true, emoji: true },
      });

      const totalAmount = products.reduce((sum, p) => sum + Number(p.price), 0);

      const order = await this.prisma.$transaction(async (tx) => {
        const existingCustomer = await tx.customer.findUnique({
          where: { cafeId_branchId_phone: { cafeId, branchId: targetBranchId, phone: session.phone } },
          select: { id: true, preferredProducts: true },
        });
        const prevPrefs: Record<string, number> = existingCustomer?.preferredProducts
          ? (existingCustomer.preferredProducts as Record<string, number>)
          : {};
        for (const pid of productIds) {
          if (pid) prevPrefs[pid] = (prevPrefs[pid] || 0) + 1;
        }

        const customer = await tx.customer.upsert({
          where: { cafeId_branchId_phone: { cafeId, branchId: targetBranchId, phone: session.phone } },
          update: {
            totalOrders: { increment: 1 },
            totalSpent: { increment: new Prisma.Decimal(totalAmount) },
            lastOrderDate: new Date(),
            name: session.customerName || undefined,
            preferredProducts: prevPrefs,
          },
          create: {
            cafeId, branchId: targetBranchId,
            phone: session.phone,
            name: session.customerName || 'عميل',
            totalOrders: 1,
            totalSpent: new Prisma.Decimal(totalAmount),
            lastOrderDate: new Date(),
            preferredProducts: prevPrefs,
          },
        });

        const code = await this.generateOrderCode(tx);
        const created = await tx.order.create({
          data: {
            cafeId,
            branchId: targetBranchId,
            code,
            customerId: customer.id,
            status: 'NEW',
            type: isTelegram ? 'TELEGRAM' : 'WHATSAPP',
            sourceType: isTelegram ? 'TELEGRAM_ORDER' : 'WHATSAPP_ORDER',
            source: isTelegram ? 'TELEGRAM' : 'WHATSAPP',
            total: new Prisma.Decimal(totalAmount),
            items: {
              create: products.map(p => ({
                productId: p.id,
                quantity: 1,
                unitPrice: p.price,
              })),
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
            branchId: targetBranchId,
            code,
            customerName: session.customerName || 'عميل',
            customerPhone: session.phone.replace('tg_', ''),
            customerId: customer.id,
            notes: null,
            createdById: staff?.id ?? null,
            status: 'NEW',
            total: new Prisma.Decimal(totalAmount),
            orderType: 'DELIVERY',
            sourceType: isTelegram ? 'TELEGRAM_ORDER' : 'WHATSAPP_ORDER',
            items: {
              create: products.map(p => ({
                cafeId,
                productId: p.id,
                quantity: 1,
                unitPrice: p.price,
              })),
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

      this.sendToKitchen(order);
      this.customerLearningService.learn(cafeId!, order.customerId).catch(e => this.logger.error(`Learn failed: ${e.message}`));
      if (session.stage7UsualOrder && session.cafeId) {
        this.customerUnderstanding?.recordUsualOrderSuccess(session.cafeId);
      }
      await this.deleteSession(session.phone);

      return `تم تأكيد طلبك المعتاد يا ${session.customerName} ✅\nجاري التحضير ☕\n\nرقم الطلب: ${order.code}`;
    } catch (err) {
      this.logger.error(`Usual order confirmation failed: ${(err as Error).message}`);
      return 'عذراً، حدث خطأ أثناء تأكيد الطلب. حاول مرة تانية.';
    }
  }

  private async confirmOrder(session: OrderFlowSession): Promise<string> {
    try {
      const order = await this.createOrder(session) as any;
      const isTelegram = session.phone.startsWith('tg_');

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
          cafeId: session.cafeId,
        },
      });

      this.sendToKitchen(order);
      this.customerLearningService.learn(session.cafeId!, order.customerId).catch(e => this.logger.error(`Learn failed: ${e.message}`));
      this.recommendations.recordOrderCompleted(
        session.orderValueBeforeRecommendation ?? Number(order.total),
        Number(order.total),
        session.messageCount || 0,
      );
      if (session.stage7Assisted && session.cafeId) {
        this.customerUnderstanding?.recordOrderCompleted(
          session.cafeId,
          Date.now() - (session.startedAt || Date.now()),
        );
      }

      await this.deleteSession(session.phone);

      const nameDisplay = order.customer?.name || session.customerName || '';
      return `تم تأكيد طلبك يا ${nameDisplay} ✅\nجاري التحضير ☕\n\nرقم الطلب: ${order.code}`;
    } catch (err) {
      this.logger.error(`Order creation failed: ${(err as Error).message}`);
      return 'عذراً، حدث خطأ أثناء تأكيد الطلب. حاول مرة تانية.';
    }
  }

  private async createOrder(session: OrderFlowSession) {
    const cafeId = session.cafeId;
    const isTelegram = session.phone.startsWith('tg_');
    const idempotencyKey = cafeId ? `orderflow:${cafeId}:${session.phone}` : undefined;

    if (idempotencyKey && cafeId) {
      const existing = await this.idempotencyService.isProcessed('order_flow', idempotencyKey, cafeId);
      if (existing.duplicated && existing.entityId) {
        const replayedOrder = await this.prisma.order.findUnique({
          where: { id: existing.entityId },
          include: { customer: true, items: { include: { product: true } } },
        });
        if (replayedOrder) {
          return replayedOrder;
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const targetBranchId = session.branchId;
      if (!targetBranchId) throw new Error('No branch found in session');

      const productId = session.productId || session.selectedProductId;
      const price = session.productPrice ?? session.selectedProductPrice ?? 0;
      const totalAmount = this.calculateOrderTotal(session);
      const preferenceItems = [
        { productId: productId!, quantity: session.quantity },
        ...(session.recommendationItems || []).map((item) => ({ productId: item.productId, quantity: item.quantity })),
      ];

      // Build preferred products tracker
      const existingCustomer = await tx.customer.findUnique({
        where: { cafeId_branchId_phone: { cafeId: cafeId!, branchId: targetBranchId, phone: session.phone } },
        select: { id: true, preferredProducts: true },
      });
      const prevPrefs: Record<string, unknown> = existingCustomer?.preferredProducts &&
        typeof existingCustomer.preferredProducts === 'object' && !Array.isArray(existingCustomer.preferredProducts)
        ? { ...(existingCustomer.preferredProducts as Record<string, unknown>) }
        : {};
      for (const item of preferenceItems) {
        if (!item.productId) continue;
        const existingCount = typeof prevPrefs[item.productId] === 'number' ? prevPrefs[item.productId] as number : 0;
        prevPrefs[item.productId] = existingCount + item.quantity;
      }

      const customer = await tx.customer.upsert({
        where: {
          cafeId_branchId_phone: {
            cafeId: cafeId!,
            branchId: targetBranchId,
            phone: session.phone,
          },
        },
        update: {
          totalOrders: { increment: 1 },
          totalSpent: { increment: new Prisma.Decimal(totalAmount) },
          lastOrderDate: new Date(),
          name: session.customerName || undefined,
          preferredProducts: prevPrefs as Prisma.InputJsonValue,
        },
        create: {
          cafeId: cafeId!,
          branchId: targetBranchId,
          phone: session.phone,
          name: session.customerName || 'عميل',
          totalOrders: 1,
          totalSpent: new Prisma.Decimal(totalAmount),
          lastOrderDate: new Date(),
          preferredProducts: prevPrefs as Prisma.InputJsonValue,
        },
      });

      const code = await this.generateOrderCode(tx);

      const notesParts = [];
      for (const [optionId, choice] of Object.entries(session.selectedOptions)) {
        const option = session.optionsCache.find((o: any) => o.id === optionId);
        if (option) notesParts.push(`${option.name}: ${choice}`);
      }
      if (session.notes.length) notesParts.push(`Notes: ${session.notes.join(', ')}`);
      if (session.selectedSizeName) notesParts.push(`الحجم: ${session.selectedSizeName}`);
      const orderItems = [
        {
          productId: productId!,
          quantity: session.quantity,
          unitPrice: new Prisma.Decimal(price),
          notes: notesParts.join(' | ') || null,
        },
        ...(session.recommendationItems || []).map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(item.unitPrice),
          notes: item.notes || null,
        })),
      ];

      const order = await tx.order.create({
        data: {
          cafeId: cafeId!,
          branchId: targetBranchId,
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
        include: {
          customer: true,
          items: { include: { product: true } },
        },
      });

      // Create InCafeOrder so barista dashboard picks up all orders
      const staff = await tx.staff.findFirst({
        where: { cafeId: cafeId!, active: true },
        select: { id: true },
      });
      await tx.inCafeOrder.create({
        data: {
          cafeId: cafeId!,
          branchId: targetBranchId,
          code,
          customerName: session.customerName || 'عميل',
          customerPhone: session.phone.replace('tg_', ''),
          customerId: customer.id,
          notes: notesParts.join(' | ') || null,
          createdById: staff?.id ?? null,
          status: 'NEW',
          total: new Prisma.Decimal(totalAmount),
          orderType: 'DELIVERY',
          sourceType: isTelegram ? 'TELEGRAM_ORDER' : 'WHATSAPP_ORDER',
          items: {
            create: orderItems.map((item) => ({ ...item, cafeId: cafeId! })),
          },
        },
      });

      if (idempotencyKey) {
        await this.idempotencyService.record('order_flow', idempotencyKey, 'Order', order.id, 'completed', cafeId!, tx);
      }

      return order;
    });
  }

  private sendToKitchen(order: any): void {
    this.logger.log('=== KITCHEN NOTIFICATION ===');
    this.logger.log(`Order #${order.code}`);
    for (const item of order.items) {
      this.logger.log(`  ${item.product.name} × ${item.quantity}`);
      if (item.notes) this.logger.log(`  Notes: ${item.notes}`);
    }
    this.logger.log(`Customer: ${order.customer.phone}`);
    this.logger.log(`Total: ${Number(order.total).toFixed(2)}`);
    this.logger.log('============================');
  }

  private matchProduct(input: string, products: any[]): any | null {
    const name = input.toLowerCase().trim();
    if (!name) return null;

    const exact = products.find(p => p.name.toLowerCase() === name);
    if (exact) return exact;

    const numeric = parseInt(name);
    if (!isNaN(numeric) && numeric >= 1 && numeric <= products.length) {
      return products[numeric - 1];
    }

    const contains = products.find(
      p => p.name.toLowerCase().includes(name) || name.includes(p.name.toLowerCase()),
    );
    if (contains) return contains;

    const aliasMap: Record<string, string[]> = {
      'كابتشينو': ['cappuccino', 'capuccino'],
      'لاتيه': ['latte', 'لاتي'],
      'اسبريسو': ['espresso', 'إسبريسو'],
      'أمريكانو': ['americano', 'امريكانو'],
    };

    for (const [dbName, aliases] of Object.entries(aliasMap)) {
      if (aliases.some(a => name.includes(a) || a.includes(name))) {
        const match = products.find(p => p.name === dbName);
        if (match) return match;
      }
    }

    return null;
  }

  private async generateOrderCode(tx: Prisma.TransactionClient): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `FLOW-${dateStr}`;

    const lastOrder = await tx.order.findFirst({
      where: { code: { startsWith: prefix } },
      orderBy: { code: 'desc' },
    });

    const lastSequence = lastOrder ? Number(lastOrder.code.split('-')[2]) : 0;
    return `${prefix}-${String(lastSequence + 1).padStart(4, '0')}`;
  }
}





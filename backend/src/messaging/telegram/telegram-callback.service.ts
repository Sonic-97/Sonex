import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../messaging.service';
import { TelegramKeyboardBuilder } from './telegram-keyboard.builder';
import { OrderFlowService } from '../../order-flow/order-flow.service';
import { EventBusService } from '../../events/event-bus.service';
import { EventsService } from '../../events/events.service';
import { QuickActionService, QuickAction, OrderDraft, DraftItem } from './quick-action.service';
import { PersonalizationProfileService } from '../../personalization/personalization-profile.service';
import { MessageParserConsumer } from '../../consumers/message-received/message-parser.consumer';
import { ReplyEngineService } from '../../reply-engine/reply-engine.service';
import { ReplyContext } from '../../reply-engine/reply-engine.types';

export interface CallbackPayload {
  chatId: number;
  userId: number;
  data: string;
  callbackQueryId: string;
  cafeId: string;
  messageId: number;
}

@Injectable()
export class TelegramCallbackService {
  private readonly logger = new Logger(TelegramCallbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingService: MessagingService,
    private readonly keyboardBuilder: TelegramKeyboardBuilder,
    private readonly orderFlowService: OrderFlowService,
    private readonly eventBus: EventBusService,
    private readonly eventsService: EventsService,
    private readonly quickAction: QuickActionService,
    private readonly personalization: PersonalizationProfileService,
    private readonly replyEngine: ReplyEngineService,
  ) {}

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

  async handleCallback(payload: CallbackPayload): Promise<void> {
    const { chatId, userId, data, callbackQueryId, cafeId, messageId } = payload;
    const chatIdStr = chatId.toString();

    const provider = this.messagingService.getProvider('telegram');
    if (provider) {
      await provider.answerCallbackQuery(callbackQueryId);
    }

    const [action, ...args] = data.split(':');

    try {
      switch (action) {
        case 'menu':
          await this.handleMenuAction(chatIdStr, userId, cafeId, args);
          break;
        case 'order':
          await this.handleOrderAction(chatIdStr, userId, cafeId, args);
          break;
        case 'summary':
          await this.handleSummaryAction(chatIdStr, userId, cafeId, args);
          break;
        case 'confirm':
          await this.handleConfirmAction(chatIdStr, cafeId, args);
          break;
        case 'cancel':
          await this.handleCancelAction(chatIdStr, cafeId, args);
          break;
        case 'status':
          await this.handleStatusAction(chatIdStr, cafeId, args);
          break;
        case 'noop':
          break;
        default:
          if (Object.values(QuickAction).includes(action as QuickAction)) {
            await this.handleQuickAction(chatIdStr, cafeId, data, messageId);
          } else {
            this.logger.warn(`Unknown callback action: ${action}`);
          }
      }
    } catch (error) {
      this.logger.error(`Callback handling error: ${(error as Error).message}`);
      const reply = this.replyEngine.errorRecoveryReply(this.buildReplyCtx());
      await this.messagingService.sendReply(chatIdStr, reply.message, cafeId);
    }
  }

  private async handleQuickAction(chatId: string, cafeId: string, data: string, messageId: number): Promise<void> {
    const resolved = await this.quickAction.resolveCallback(data, cafeId, chatId);

    if (!resolved.valid) {
      if (resolved.expired) {
        const refId = this.quickAction.generateReferenceId();
        await this.messagingService.sendReply(chatId,
          'الاختيار ده قديم شوية، لأن السعر أو حالة الطلب ممكن يكونوا اتغيروا.\nحدثت لك الطلب دلوقتي.',
          cafeId, { replyMarkup: this.keyboardBuilder.mainMenu(refId) });
      } else {
        await this.messagingService.sendReply(chatId, '❌ حدث خطأ. حاول تاني.', cafeId);
      }
      return;
    }

    const { action, draft, extra } = resolved;

    if (this.quickAction.constructor.name === 'QuickActionService') {
      const dupe = await this.quickAction.checkIdempotency(cafeId, chatId, action, resolved.extra || '');
      if (dupe && action === QuickAction.CONFIRM_DRAFT) {
        this.logger.warn(`Duplicate callback blocked: ${action} for ${chatId}@${cafeId}`);
        return;
      }
    }

    switch (action) {
      case QuickAction.REPEAT_USUAL:
        await this.handleRepeatUsual(chatId, cafeId);
        break;
      case QuickAction.REPEAT_LAST:
        await this.handleRepeatLast(chatId, cafeId);
        break;
      case QuickAction.CONFIRM_DRAFT:
        if (draft) await this.handleConfirmDraft(chatId, cafeId, draft, resolved);
        break;
      case QuickAction.EDIT_DRAFT:
        if (draft) await this.handleEditDraft(chatId, cafeId, draft);
        break;
      case QuickAction.NEW_ORDER:
        await this.handleNewOrder(chatId, cafeId);
        break;
      case QuickAction.CHANGE_QTY:
        if (draft && extra) await this.handleChangeQty(chatId, cafeId, draft, extra);
        break;
      case QuickAction.CHANGE_ROAST:
        if (draft && extra) await this.handleChangeField(chatId, cafeId, draft, 'roast', extra);
        break;
      case QuickAction.CHANGE_BLEND:
        if (draft && extra) await this.handleChangeField(chatId, cafeId, draft, 'blend', extra);
        break;
      case QuickAction.CHANGE_SUGAR:
        if (draft && extra) await this.handleChangeField(chatId, cafeId, draft, 'sugar', extra);
        break;
      case QuickAction.CHANGE_LOCATION:
        if (draft) await this.handleChangeLocation(chatId, cafeId, draft);
        break;
      case QuickAction.CHANGE_PAYMENT:
        if (draft) await this.handleChangePayment(chatId, cafeId, draft);
        break;
      case QuickAction.ORDER_ONE_MORE:
        if (draft) await this.handleOrderOneMore(chatId, cafeId, draft);
        break;
      case QuickAction.TRACK_ORDER:
        await this.handleTrackOrder(chatId, cafeId);
        break;
      case QuickAction.VIEW_BALANCE:
        await this.handleViewBalance(chatId, cafeId);
        break;
      case QuickAction.VIEW_RECENT:
        await this.handleViewRecent(chatId, cafeId);
        break;
      case QuickAction.REQUEST_HUMAN:
        await this.handleRequestHuman(chatId, cafeId, extra);
        break;
      case QuickAction.CANCEL_DRAFT:
        await this.handleCancelDraft(chatId, cafeId);
        break;
      case QuickAction.SELECT_LOCATION:
        if (draft && extra) await this.handleSelectLocation(chatId, cafeId, draft, extra);
        break;
      case QuickAction.SELECT_PAYMENT:
        if (draft && extra) await this.handleSelectPayment(chatId, cafeId, draft, extra);
        break;
      default:
        this.logger.warn(`Unhandled quick action: ${action}`);
    }
  }

  private async ensureCustomerSession(chatId: string, cafeId: string): Promise<{ customerId: string; branchId: string } | null> {
    const branch = await this.quickAction.getBranch(cafeId);
    if (!branch) return null;

    const phone = `tg_${chatId}`;
    const existing = await this.prisma.customer.findUnique({
      where: { cafeId_branchId_phone: { cafeId, branchId: branch.id, phone } },
      select: { id: true },
    });

    if (existing) {
      return { customerId: existing.id, branchId: branch.id };
    }

    const customer = await this.prisma.customer.create({
      data: {
        cafeId,
        branchId: branch.id,
        phone,
        telegramId: BigInt(chatId),
        name: `Telegram ${chatId.slice(0, 4)}`,
        totalOrders: 0,
      },
      select: { id: true },
    });

    return { customerId: customer.id, branchId: branch.id };
  }

  private async handleRepeatUsual(chatId: string, cafeId: string): Promise<void> {
    const session = await this.ensureCustomerSession(chatId, cafeId);
    if (!session) {
      await this.messagingService.sendReply(chatId, '❌ لا يوجد فرع نشط.', cafeId);
      return;
    }

    const draft = await this.quickAction.buildUsualOrderDraft(session.customerId, cafeId, session.branchId);
    if (!draft) {
      const refId = this.quickAction.generateReferenceId();
      await this.messagingService.sendReply(chatId,
        'مفيش طلب معتاد لسه.\nعايز تبدأ طلب جديد؟',
        cafeId, { replyMarkup: this.keyboardBuilder.mainMenu(refId) });
      return;
    }

    const refId = await this.quickAction.saveDraft(chatId, cafeId, draft);
    const summary = this.quickAction.formatDraftSummary(draft);
    const estimate = this.quickAction.estimateDelivery();

    const ctx = this.buildReplyCtx({
      currentDraft: { items: draft.items.map(i => ({ name: i.productName, quantity: i.quantity, price: i.unitPrice })), total: draft.total, deliveryLocation: draft.deliveryLocation?.name, paymentMethod: draft.paymentMethod },
    });
    const reply = this.replyEngine.confirmReply(ctx);
    await this.messagingService.sendReply(chatId,
      `${reply.message}\n${estimate}`,
      cafeId, { replyMarkup: this.keyboardBuilder.usualOrderActions(refId) });
  }

  private async handleRepeatLast(chatId: string, cafeId: string): Promise<void> {
    const session = await this.ensureCustomerSession(chatId, cafeId);
    if (!session) {
      await this.messagingService.sendReply(chatId, '❌ لا يوجد فرع نشط.', cafeId);
      return;
    }

    const draft = await this.quickAction.buildRepeatLastDraft(session.customerId, cafeId, session.branchId);
    if (!draft) {
      const refId = this.quickAction.generateReferenceId();
      await this.messagingService.sendReply(chatId,
        'مفيش طلب سابق.\nعايز تبدأ طلب جديد؟',
        cafeId, { replyMarkup: this.keyboardBuilder.mainMenu(refId) });
      return;
    }

    const refId = await this.quickAction.saveDraft(chatId, cafeId, draft);
    const summary = this.quickAction.formatDraftSummary(draft);
    const estimate = this.quickAction.estimateDelivery();

    const ctx = this.buildReplyCtx({
      currentDraft: { items: draft.items.map(i => ({ name: i.productName, quantity: i.quantity, price: i.unitPrice })), total: draft.total, deliveryLocation: draft.deliveryLocation?.name, paymentMethod: draft.paymentMethod },
    });
    const reply = this.replyEngine.confirmReply(ctx);
    await this.messagingService.sendReply(chatId,
      `${reply.message}\n${estimate}`,
      cafeId, { replyMarkup: this.keyboardBuilder.summaryActions(refId) });
  }

  private async handleConfirmDraft(chatId: string, cafeId: string, draft: OrderDraft, resolved: any): Promise<void> {
    const branch = await this.quickAction.getBranch(cafeId);
    if (!branch) {
      await this.messagingService.sendReply(chatId, '❌ لا يوجد فرع نشط.', cafeId);
      return;
    }

    try {
      const result = await this.quickAction.createOrderFromDraft(draft, cafeId, branch.id, chatId, resolved.extra || '');
      const refId = this.quickAction.generateReferenceId();

      const reply = this.replyEngine.orderConfirmedReply(
        this.buildReplyCtx({ deliveryEstimate: this.quickAction.estimateDelivery() }));
      const orderMsg = `📋 رقم الطلب: ${result.code}\n💰 الإجمالي: ${draft.total} ج.م`;
      await this.messagingService.sendReply(chatId,
        `${reply.message}\n\n${orderMsg}`,
        cafeId, { replyMarkup: this.keyboardBuilder.postOrderActions(refId) });
    } catch (err) {
      if ((err as Error).message.includes('Duplicate order')) {
        return;
      }
      this.logger.error(`Confirm draft error: ${(err as Error).message}`);
      await this.messagingService.sendReply(chatId, '❌ حدث خطأ أثناء تأكيد الطلب. حاول مرة أخرى.', cafeId);
    }
  }

  private async handleEditDraft(chatId: string, cafeId: string, draft: OrderDraft): Promise<void> {
    const refId = await this.quickAction.saveDraft(chatId, cafeId, draft);
    const isCoffee = draft.items.some(i =>
      /قهوة|لاتيه|كابتشينو|اسبرسو|موكا/i.test(i.productName));

    const reply = this.replyEngine.simpleReply(
      this.buildReplyCtx(),
      `${this.replyEngine.varyAcknowledgement()} تحب تعدل إيه؟`);
    await this.messagingService.sendReply(chatId,
      reply.message,
      cafeId, { replyMarkup: this.keyboardBuilder.modificationMenu(refId, isCoffee) });
  }

  private async handleChangeQty(chatId: string, cafeId: string, draft: OrderDraft, extra: string): Promise<void> {
    const parts = extra.split(':');
    const productId = parts[0];
    const newQty = parseInt(parts[1]) || 1;

    const updatedItems = draft.items.map(i =>
      i.productId === productId ? { ...i, quantity: newQty } : i);

    const total = updatedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const updated: OrderDraft = { ...draft, items: updatedItems, total, version: draft.version + 1 };

    const refId = await this.quickAction.saveDraft(chatId, cafeId, updated);

    const product = updatedItems.find(i => i.productId === productId);
    if (product) {
      await this.messagingService.sendReply(chatId,
        `${product.productName} × ${newQty} = ${product.unitPrice * newQty} ج.م`,
        cafeId, { replyMarkup: this.keyboardBuilder.quantitySelector(productId, newQty, refId) });
    }
  }

  private async handleChangeField(chatId: string, cafeId: string, draft: OrderDraft, field: string, value: string): Promise<void> {
    const updatedItems = draft.items.map(i => ({
      ...i,
      customization: { ...i.customization, [field]: value },
    }));
    const total = updatedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const updated: OrderDraft = { ...draft, items: updatedItems, total, version: draft.version + 1 };

    const refId = await this.quickAction.saveDraft(chatId, cafeId, updated);
    const summary = this.quickAction.formatDraftSummary(updated);
    const ctx = this.buildReplyCtx({
      currentDraft: { items: updated.items.map(i => ({ name: i.productName, quantity: i.quantity, price: i.unitPrice })), total: updated.total, deliveryLocation: updated.deliveryLocation?.name, paymentMethod: updated.paymentMethod },
    });
    const confirmReply = this.replyEngine.confirmReply(ctx);

    await this.messagingService.sendReply(chatId,
      confirmReply.message,
      cafeId, { replyMarkup: this.keyboardBuilder.summaryActions(refId) });
  }

  private async handleChangeLocation(chatId: string, cafeId: string, draft: OrderDraft): Promise<void> {
    const session = await this.ensureCustomerSession(chatId, cafeId);
    let locations: Array<{ id: string; name: string; isDefault: boolean }> = [];

    if (session) {
      locations = await this.quickAction.getCustomerSavedLocations(session.customerId, cafeId);
    }

    if (locations.length === 0) {
      locations.push({
        id: 'default',
        name: 'محل ستايل',
        isDefault: true,
      });
    }

    const refId = await this.quickAction.saveDraft(chatId, cafeId, draft);
    await this.messagingService.sendReply(chatId,
      'اختر عنوان التوصيل:',
      cafeId, { replyMarkup: this.keyboardBuilder.deliveryLocations(refId, locations) });
  }

  private async handleChangePayment(chatId: string, cafeId: string, draft: OrderDraft): Promise<void> {
    const methods = this.quickAction.getEligiblePaymentMethods(draft);
    const refId = await this.quickAction.saveDraft(chatId, cafeId, draft);

    await this.messagingService.sendReply(chatId,
      'اختر طريقة الدفع:',
      cafeId, { replyMarkup: this.keyboardBuilder.paymentMethods(refId, methods) });
  }

  private async handleSelectLocation(chatId: string, cafeId: string, draft: OrderDraft, locationId: string): Promise<void> {
    const session = await this.ensureCustomerSession(chatId, cafeId);
    let locationName = 'محل ستايل';

    if (session) {
      const locations = await this.quickAction.getCustomerSavedLocations(session.customerId, cafeId);
      const found = locations.find(l => l.id === locationId);
      if (found) {
        locationName = found.name;
      }
    }

    const updated: OrderDraft = {
      ...draft,
      deliveryLocation: { name: locationName },
      version: draft.version + 1,
    };

    const refId = await this.quickAction.saveDraft(chatId, cafeId, updated);
    const summary = this.quickAction.formatDraftSummary(updated);

    await this.messagingService.sendReply(chatId,
      `تم تحديد العنوان ✅\n\n${summary}\n\nأأكد؟`,
      cafeId, { replyMarkup: this.keyboardBuilder.summaryActions(refId) });
  }

  private async handleSelectPayment(chatId: string, cafeId: string, draft: OrderDraft, method: string): Promise<void> {
    const updated: OrderDraft = {
      ...draft,
      paymentMethod: method,
      version: draft.version + 1,
    };

    const refId = await this.quickAction.saveDraft(chatId, cafeId, updated);
    const summary = this.quickAction.formatDraftSummary(updated);

    await this.messagingService.sendReply(chatId,
      `تم اختيار الدفع ✅\n\n${summary}\n\nأأكد؟`,
      cafeId, { replyMarkup: this.keyboardBuilder.summaryActions(refId) });
  }

  private async handleOrderOneMore(chatId: string, cafeId: string, draft: OrderDraft): Promise<void> {
    if (draft.items.length === 0) {
      const refId = this.quickAction.generateReferenceId();
      await this.messagingService.sendReply(chatId,
        'عايز تطلب حاجة جديدة؟',
        cafeId, { replyMarkup: this.keyboardBuilder.mainMenu(refId) });
      return;
    }

    const lastItem = draft.items[draft.items.length - 1];
    const newItem: DraftItem = { ...lastItem, quantity: 1 };
    const updatedItems = [...draft.items, newItem];
    const total = updatedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const updated: OrderDraft = {
      ...draft,
      items: updatedItems,
      total,
      version: draft.version + 1,
    };

    const refId = await this.quickAction.saveDraft(chatId, cafeId, updated);
    const summary = this.quickAction.formatDraftSummary(updated);

    const ctx = this.buildReplyCtx({
      currentDraft: { items: updated.items.map(i => ({ name: i.productName, quantity: i.quantity, price: i.unitPrice })), total: updated.total },
    });
    const reply = this.replyEngine.confirmReply(ctx);
    await this.messagingService.sendReply(chatId,
      `+ ${lastItem.productName}\n\n${reply.message}`,
      cafeId, { replyMarkup: this.keyboardBuilder.summaryActions(refId) });
  }

  private async handleTrackOrder(chatId: string, cafeId: string): Promise<void> {
    const session = await this.ensureCustomerSession(chatId, cafeId);
    if (!session) {
      await this.messagingService.sendReply(chatId, 'مفيش طلبات سابقة.', cafeId);
      return;
    }

    const recent = await this.quickAction.getRecentOrders(session.customerId, cafeId, 1);
    if (recent.length === 0) {
      const refId = this.quickAction.generateReferenceId();
      await this.messagingService.sendReply(chatId,
        'مفيش طلبات نشطة حالياً.\nعايز تطلب حاجة؟',
        cafeId, { replyMarkup: this.keyboardBuilder.mainMenu(refId) });
      return;
    }

    const order = recent[0];
    const statusText = this.quickAction.formatStatus(order.status);
    const ctx = this.buildReplyCtx({
      orderStatus: order.status.toLowerCase(),
      deliveryEstimate: order.status === 'preparing' ? '10–14 دقيقة' : undefined,
    });
    const reply = this.replyEngine.trackingReply(ctx);
    await this.messagingService.sendReply(chatId,
      `${reply.message}\n\n📋 رقم الطلب: ${order.code}\n💵 ${Number(order.total)} ج.م`,
      cafeId);
  }

  private async handleViewBalance(chatId: string, cafeId: string): Promise<void> {
    const session = await this.ensureCustomerSession(chatId, cafeId);
    if (!session) {
      await this.messagingService.sendReply(chatId, 'مفيش حساب مسجل.', cafeId);
      return;
    }

    const balanceData = await this.quickAction.getCustomerBalance(session.customerId, cafeId);
    const refId = this.quickAction.generateReferenceId();

    const ctx = this.buildReplyCtx({ balance: Number(balanceData.totalSpent) });
    const reply = this.replyEngine.accountReply(ctx);
    const extra = balanceData.lastOrderDate
      ? `\nآخر طلب: ${balanceData.lastOrderDate.toLocaleDateString('ar-EG')}`
      : '';
    await this.messagingService.sendReply(chatId,
      `${reply.message}${extra}`,
      cafeId, { replyMarkup: this.keyboardBuilder.balanceActions(refId) });
  }

  private async handleViewRecent(chatId: string, cafeId: string): Promise<void> {
    const session = await this.ensureCustomerSession(chatId, cafeId);
    if (!session) {
      await this.messagingService.sendReply(chatId, 'مفيش طلبات سابقة.', cafeId);
      return;
    }

    const orders = await this.quickAction.getRecentOrders(session.customerId, cafeId);
    if (orders.length === 0) {
      const refId = this.quickAction.generateReferenceId();
      await this.messagingService.sendReply(chatId,
        'مفيش طلبات سابقة.\nعايز تطلب حاجة؟',
        cafeId, { replyMarkup: this.keyboardBuilder.mainMenu(refId) });
      return;
    }

    const lines = orders.map((o, i) =>
      `${i + 1}. #${o.code} - ${Number(o.total)} ج.م - ${this.quickAction.formatStatus(o.status)}`);

    await this.messagingService.sendReply(chatId,
      `آخر طلباتك:\n\n${lines.join('\n')}`, cafeId);
  }

  private async handleRequestHuman(chatId: string, cafeId: string, reason?: string): Promise<void> {
    const session = await this.ensureCustomerSession(chatId, cafeId);
    const reasonText = reason ? `\nالسبب: ${reason}` : '';
    const orderContext = session ? `\nحساب العميل: ${session.customerId}` : '';

    this.logger.warn(`[HUMAN_HANDOFF] Chat ${chatId}@${cafeId} requested help.${reasonText}${orderContext}`);

    await this.messagingService.sendReply(chatId,
      `تم إرسال طلبك للدعم الفني. حد من الكافيه هيكلمك قريباً.${reasonText ? '\n\n' + reasonText : ''}`, cafeId);
  }

  private async handleCancelDraft(chatId: string, cafeId: string): Promise<void> {
    await this.prisma.telegramSession.deleteMany({
      where: { chatId: BigInt(chatId), cafeId },
    });

    const refId = this.quickAction.generateReferenceId();
    const reply = this.replyEngine.closingReply(this.buildReplyCtx(), 'afterConfirm');
    await this.messagingService.sendReply(chatId,
      `❌ تم إلغاء الطلب.\n\n${reply.message}`,
      cafeId, { replyMarkup: this.keyboardBuilder.mainMenu(refId) });
  }

  private async handleNewOrder(chatId: string, cafeId: string): Promise<void> {
    const orderFlowSession = await this.orderFlowService.getSession(`tg_${chatId}`);
    if (orderFlowSession) {
      await this.orderFlowService.deleteSession(`tg_${chatId}`);
    }

    await this.prisma.telegramSession.deleteMany({
      where: { chatId: BigInt(chatId), cafeId },
    });

    const phone = `tg_${chatId}`;
    const flowReply = await this.orderFlowService.handleMessage(phone, 'عايز أطلب', cafeId, phone);
    const ctx = this.buildReplyCtx({ isNewCustomer: true });
    const greeting = this.replyEngine.greetingReply(ctx);
    await this.messagingService.sendReply(chatId,
      `${greeting.message}\n\n${flowReply}`,
      cafeId);
  }

  private async handleMenuAction(chatId: string, userId: number, cafeId: string, args: string[]): Promise<void> {
    const subAction = args[0];

    switch (subAction) {
      case 'start':
      case 'main': {
        const categories = await this.prisma.productCategory.findMany({
          where: { cafeId, active: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });

        if (categories.length > 0) {
          const keyboard = this.keyboardBuilder.categories(categories.map(c => ({
            id: c.id,
            name: c.name,
            emoji: '☕',
          })));
          await this.messagingService.sendReply(chatId, 'اختر تصنيف:', cafeId, { replyMarkup: keyboard });
        } else {
          const products = await this.prisma.product.findMany({
            where: { cafeId, active: true },
            select: { id: true, name: true, price: true },
            orderBy: { name: 'asc' },
          });

          if (products.length === 0) {
            await this.messagingService.sendReply(chatId, 'لا يوجد منتجات متاحة حالياً.', cafeId);
            return;
          }

          const keyboard = this.keyboardBuilder.allProducts(products.map(p => ({
            id: p.id,
            name: p.name,
            price: Number(p.price),
          })));
          await this.messagingService.sendReply(chatId, 'اختر منتج:', cafeId, { replyMarkup: keyboard });
        }
        break;
      }
      case 'category': {
        const categoryId = args[1];
        const products = await this.prisma.product.findMany({
          where: { categoryId, cafeId, active: true },
          select: { id: true, name: true, price: true },
          orderBy: { name: 'asc' },
        });

        if (products.length === 0) {
          await this.messagingService.sendReply(chatId, 'لا يوجد منتجات في هذا التصنيف.', cafeId);
          return;
        }

        const keyboard = this.keyboardBuilder.products(categoryId, products.map(p => ({
          id: p.id,
          name: p.name,
          price: Number(p.price),
        })));

        await this.messagingService.sendReply(chatId, 'اختر منتج:', cafeId, { replyMarkup: keyboard });
        break;
      }
      default:
        break;
    }
  }

  private async handleOrderAction(chatId: string, userId: number, cafeId: string, args: string[]): Promise<void> {
    const subAction = args[0];

    switch (subAction) {
      case 'product': {
        const productId = args[1];
        const product = await this.prisma.product.findUnique({
          where: { id: productId },
          select: { id: true, name: true, price: true },
        });

        if (!product) {
          await this.messagingService.sendReply(chatId, '❌ المنتج غير موجود.', cafeId);
          return;
        }

        const keyboard = this.keyboardBuilder.quantitySelector(productId, 1);
        await this.messagingService.sendReply(
          chatId,
          `☕ ${product.name}\n💰 ${Number(product.price)} ج.م\n\nاختر الكمية:`,
          cafeId,
          { replyMarkup: keyboard },
        );
        break;
      }
      case 'qty': {
        const productId = args[1];
        const qty = parseInt(args[2]) || 1;

        const product = await this.prisma.product.findUnique({
          where: { id: productId },
          select: { id: true, name: true, price: true },
        });

        if (!product) return;

        const keyboard = this.keyboardBuilder.quantitySelector(productId, qty);
        await this.messagingService.sendReply(
          chatId,
          `☕ ${product.name}\n💰 ${Number(product.price)} × ${qty} = ${Number(product.price) * qty} ج.م`,
          cafeId,
          { replyMarkup: keyboard },
        );
        break;
      }
      case 'add': {
        const productId = args[1];
        const qty = parseInt(args[2]) || 1;

        const product = await this.prisma.product.findUnique({
          where: { id: productId },
          select: { id: true, name: true, price: true },
        });

        const unitPrice = product ? Number(product.price) : 0;
        const draft: OrderDraft = {
          version: 1,
          createdAt: Date.now(),
          items: [{ productId, productName: product?.name || '', quantity: qty, unitPrice }],
          deliveryLocation: { name: 'محل ستايل' },
          paymentMethod: 'كاش',
          total: unitPrice * qty,
        };

        const refId = await this.quickAction.saveDraft(chatId, cafeId, draft);
        const summary = this.quickAction.formatDraftSummary(draft);
        const ctx = this.buildReplyCtx({
          currentDraft: { items: draft.items.map(i => ({ name: i.productName, quantity: i.quantity, price: i.unitPrice })), total: draft.total, deliveryLocation: draft.deliveryLocation?.name, paymentMethod: draft.paymentMethod },
        });
        const confirmReply = this.replyEngine.confirmReply(ctx);

        await this.messagingService.sendReply(
          chatId,
          confirmReply.message,
          cafeId,
          { replyMarkup: this.keyboardBuilder.summaryActions(refId) },
        );
        break;
      }
      default:
        break;
    }
  }

  private async handleSummaryAction(chatId: string, userId: number, cafeId: string, args: string[]): Promise<void> {
    const session = await this.prisma.telegramSession.findUnique({
      where: { chatId_cafeId: { chatId: BigInt(chatId), cafeId } },
    });

    if (!session || !session.context || !session.context['items'] || (session.context['items'] as any[]).length === 0) {
      await this.messagingService.sendReply(chatId, 'لا يوجد منتجات في الطلب. اختر منتج أولاً.', cafeId);
      return;
    }

    const items = session.context['items'] as Array<{ productId: string; quantity: number }>;
    const productIds = items.map(i => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, cafeId },
      select: { id: true, name: true, price: true },
    });

    const productMap = new Map(products.map(p => [p.id, p]));
    const draftItems: DraftItem[] = [];
    let total = 0;

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (product) {
        const lineTotal = Number(product.price) * item.quantity;
        total += lineTotal;
        draftItems.push({
          productId: item.productId,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: Number(product.price),
        });
      }
    }

    const draft: OrderDraft = {
      version: 1,
      createdAt: Date.now(),
      items: draftItems,
      deliveryLocation: { name: 'محل ستايل' },
      paymentMethod: 'كاش',
      total,
    };

    const refId = await this.quickAction.saveDraft(chatId, cafeId, draft);
    const summary = this.quickAction.formatDraftSummary(draft);

    await this.messagingService.sendReply(
      chatId,
      summary + '\n\nأأكد؟',
      cafeId,
      { replyMarkup: this.keyboardBuilder.summaryActions(refId) },
    );
  }

  private async handleConfirmAction(chatId: string, cafeId: string, args: string[]): Promise<void> {
    const chatIdBigInt = BigInt(chatId);

    const session = await this.prisma.telegramSession.findUnique({
      where: { chatId_cafeId: { chatId: chatIdBigInt, cafeId } },
    });

    if (!session || !session.context || !session.context['items'] || (session.context['items'] as any[]).length === 0) {
      await this.messagingService.sendReply(chatId, '❌ لا يوجد طلب للتأكيد. اختر منتج أولاً.', cafeId);
      return;
    }

    const items = session.context['items'] as Array<{ productId: string; quantity: number }>;
    const productIds = items.map(i => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, cafeId, active: true },
      select: { id: true, name: true, price: true },
    });

    if (products.length === 0) {
      await this.messagingService.sendReply(chatId, '❌ المنتجات غير متوفرة حالياً.', cafeId);
      return;
    }

    const productMap = new Map(products.map(p => [p.id, p]));

    try {
      const branch = await this.prisma.branch.findFirst({
        where: { cafeId, slug: 'main-branch' },
        select: { id: true },
      });
      if (!branch) throw new Error('No branch found');

      const telegramPhone = `tg_${chatId}`;
      const customer = await this.prisma.customer.upsert({
        where: {
          cafeId_branchId_phone: {
            cafeId,
            branchId: branch.id,
            phone: telegramPhone,
          },
        },
        update: {
          totalOrders: { increment: 1 },
          telegramId: BigInt(chatId),
          name: session.context['customerName'] as string || `Telegram ${chatId.slice(0, 4)}`,
        },
        create: {
          cafeId,
          branchId: branch.id,
          phone: telegramPhone,
          telegramId: BigInt(chatId),
          name: session.context['customerName'] as string || `Telegram ${chatId.slice(0, 4)}`,
          totalOrders: 1,
        },
      });

      const orderItems = items.map(item => {
        const product = productMap.get(item.productId);
        const unitPrice = product ? Number(product.price) : 0;
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice,
        };
      });

      const total = orderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const suffix = Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
      const code = `TEL-${dateStr}-${suffix}`;

      const order = await this.prisma.order.create({
        data: {
          code,
          cafeId,
          branchId: branch.id,
          customerId: customer.id,
          status: 'NEW',
          type: 'DINE_IN',
          total,
          source: 'TELEGRAM',
          sourceType: 'TELEGRAM_ORDER',
          version: 1,
          items: { create: orderItems },
        },
        include: { customer: true, items: { include: { product: true } } },
      });

      const ownerStaff = await this.prisma.staff.findFirst({
        where: { cafeId, role: 'OWNER', active: true },
        select: { id: true },
      });

      if (ownerStaff) {
        await this.prisma.inCafeOrder.create({
          data: {
            code,
            cafeId,
            branchId: branch.id,
            customerName: customer.name,
            phone: customer.phone,
            status: 'NEW',
            total,
            sourceType: 'TELEGRAM_ORDER',
            createdById: ownerStaff.id,
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
      }

      await this.prisma.customer.update({
        where: { id: customer.id },
        data: { totalSpent: { increment: total }, lastOrderDate: new Date() },
      });

      await this.prisma.telegramSession.update({
        where: { chatId_cafeId: { chatId: chatIdBigInt, cafeId } },
        data: { state: 'completed', context: {} },
      });

      this.eventBus.publish('order.created', {
        orderId: order.id, code: order.code, total: Number(order.total),
        customerId: order.customerId, customerPhone: customer.phone,
        type: order.type, status: order.status, source: order.source,
        sourceType: order.sourceType, branchId: order.branchId, cafeId: order.cafeId,
        items: order.items.map(i => ({ productId: i.productId, productName: i.product?.name || '', quantity: i.quantity, unitPrice: Number(i.unitPrice) })),
        createdAt: order.createdAt.toISOString(),
      } as any, cafeId);

      this.eventsService.emitToBarista('inCafe.order.created', {
        cafeId, orderCode: code, customerName: customer.name, total: Number(total),
        sourceType: 'TELEGRAM_ORDER',
        items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      } as any, cafeId);

      const refId = this.quickAction.generateReferenceId();
      const keyboard = this.keyboardBuilder.postOrderActions(refId);
      const confirmReply = this.replyEngine.orderConfirmedReply(
        this.buildReplyCtx({ deliveryEstimate: this.quickAction.estimateDelivery() }));
      await this.messagingService.sendReply(
        chatId,
        `${confirmReply.message}\n\n📋 رقم الطلب: ${order.code}\n💰 ${Number(order.total).toFixed(2)} ج.م`,
        cafeId,
        { replyMarkup: keyboard },
      );
    } catch (error) {
      this.logger.error(`Order creation error: ${(error as Error).message}`);
      await this.messagingService.sendReply(chatId, '❌ حدث خطأ أثناء تأكيد الطلب. حاول مرة أخرى.', cafeId);
    }
  }

  private async handleCancelAction(chatId: string, cafeId: string, args: string[]): Promise<void> {
    await this.prisma.telegramSession.deleteMany({
      where: { chatId: BigInt(chatId), cafeId },
    });

    const refId = this.quickAction.generateReferenceId();
    const keyboard = this.keyboardBuilder.mainMenu(refId);
    const reply = this.replyEngine.closingReply(this.buildReplyCtx(), 'afterConfirm');
    await this.messagingService.sendReply(chatId,
      `❌ تم إلغاء الطلب.\n\n${reply.message}`,
      cafeId, { replyMarkup: keyboard });
  }

  private async handleStatusAction(chatId: string, cafeId: string, args: string[]): Promise<void> {
    const orderId = args[0];
    if (!orderId) return;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, total: true },
    });

    if (!order) {
      await this.messagingService.sendReply(chatId, '❌ الطلب غير موجود.', cafeId);
      return;
    }

    await this.messagingService.sendReply(
      chatId,
      `📊 حالة الطلب #${order.id}:\n\n${this.quickAction.formatStatus(order.status)}\n💰 المبلغ: ${Number(order.total)} ج.م`,
      cafeId,
    );
  }
}

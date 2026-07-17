import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IdempotencyService } from '../../common/idempotency.service';
import { EventBusService } from '../../events/event-bus.service';
import { EventsService } from '../../events/events.service';
import { PersonalizationProfileService } from '../../personalization/personalization-profile.service';
import { CustomerMemoryService } from '../../customer-memory/customer-memory.service';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';

export const CALLBACK_VERSION = 1;

export enum QuickAction {
  REPEAT_USUAL = 'ru',
  REPEAT_LAST = 'rl',
  CONFIRM_DRAFT = 'cd',
  EDIT_DRAFT = 'ed',
  NEW_ORDER = 'no',
  CHANGE_QTY = 'cq',
  CHANGE_ROAST = 'cr',
  CHANGE_BLEND = 'cb',
  CHANGE_SUGAR = 'cs',
  CHANGE_LOCATION = 'cl',
  CHANGE_PAYMENT = 'cp',
  ORDER_ONE_MORE = 'om',
  TRACK_ORDER = 'tr',
  VIEW_BALANCE = 'vb',
  VIEW_RECENT = 'vr',
  REQUEST_HUMAN = 'rh',
  CANCEL_DRAFT = 'xd',
  SELECT_LOCATION = 'sl',
  SELECT_PAYMENT = 'sp',
  SCHEDULE_ORDER = 'so',
}

export interface DraftItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  customization?: Record<string, string>;
}

export interface OrderDraft {
  version: number;
  createdAt: number;
  customerName?: string;
  items: DraftItem[];
  deliveryLocation?: {
    name: string;
    notes?: string;
  };
  paymentMethod?: string;
  deliveryNote?: string;
  total: number;
}

@Injectable()
export class QuickActionService {
  private readonly logger = new Logger(QuickActionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotencyService: IdempotencyService,
    private readonly eventBus: EventBusService,
    private readonly eventsService: EventsService,
    private readonly personalization: PersonalizationProfileService,
    private readonly customerMemory: CustomerMemoryService,
  ) {}

  generateReferenceId(): string {
    return randomBytes(4).toString('base64url').slice(0, 6);
  }

  buildCallback(action: QuickAction, refId: string, extra?: string): string {
    return `${action}:${CALLBACK_VERSION}:${refId}${extra ? ':' + extra : ''}`;
  }

  async resolveCallback(data: string, cafeId: string, chatId: string) {
    const parts = data.split(':');
    if (parts.length < 3) {
      return { action: null as QuickAction, cafeId, chatId, valid: false, expired: false, versionMatch: false, error: 'malformed' };
    }

    const action = parts[0] as QuickAction;
    const version = parseInt(parts[1]);
    const refId = parts[2];
    const extra = parts.slice(3).join(':');

    if (!Object.values(QuickAction).includes(action)) {
      return { action, cafeId, chatId, valid: false, expired: false, versionMatch: false, error: 'unknown_action' };
    }

    if (version !== CALLBACK_VERSION) {
      return { action, cafeId, chatId, valid: false, expired: false, versionMatch: false, error: 'version_mismatch' };
    }

    const session = await this.prisma.telegramSession.findUnique({
      where: { chatId_cafeId: { chatId: BigInt(chatId), cafeId } },
    });

    if (!session) {
      return { action, cafeId, chatId, valid: false, expired: true, versionMatch: true, error: 'no_session' };
    }

    if (session.state === 'completed' || session.state === 'cancelled') {
      return { action, cafeId, chatId, valid: false, expired: true, versionMatch: true, error: 'session_consumed' };
    }

    if (session.expiresAt < new Date()) {
      return { action, cafeId, chatId, valid: false, expired: true, versionMatch: true, error: 'session_expired' };
    }

    const ctx = session.context as any;
    if (!ctx || !ctx.draftRefId || ctx.draftRefId !== refId) {
      return { action, cafeId, chatId, valid: false, expired: true, versionMatch: true, error: 'stale_ref' };
    }

    const draft: OrderDraft = ctx.draft;
    if (!draft) {
      return { action, cafeId, chatId, valid: false, expired: true, versionMatch: true, error: 'no_draft' };
    }

    return { action, cafeId, chatId, valid: true, expired: false, versionMatch: true, draft, extra };
  }

  async checkIdempotency(cafeId: string, chatId: string, action: QuickAction, refId: string, extra?: string): Promise<boolean> {
    const key = IdempotencyService.generateKey('callback', cafeId, chatId, action, refId, extra || '');
    const result = await this.idempotencyService.isProcessed('telegram_callback', key, cafeId);
    return result.duplicated;
  }

  async markIdempotent(
    cafeId: string,
    chatId: string,
    action: QuickAction,
    refId: string,
    entityType: string,
    entityId: string | undefined,
    extra?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const key = IdempotencyService.generateKey('callback', cafeId, chatId, action, refId, extra || '');
    const exec = (tx || this.prisma) as any;
    await exec.processedMessage.create({
      data: {
        cafeId,
        source: 'telegram_callback',
        idempotencyKey: key,
        entityType,
        entityId: entityId ?? null,
        status: 'completed',
        completedAt: new Date(),
      },
    });
  }

  async loadDraft(chatId: string, cafeId: string): Promise<{ draft: OrderDraft; refId: string } | null> {
    const session = await this.prisma.telegramSession.findUnique({
      where: { chatId_cafeId: { chatId: BigInt(chatId), cafeId } },
    });

    if (!session || session.state !== 'building_order') return null;

    const ctx = session.context as any;
    if (!ctx || !ctx.draft || !ctx.draftRefId) return null;

    return { draft: ctx.draft as OrderDraft, refId: ctx.draftRefId };
  }

  async saveDraft(
    chatId: string,
    cafeId: string,
    draft: OrderDraft,
    refId?: string,
  ): Promise<string> {
    const rid = refId || this.generateReferenceId();
    const ctx = { draft: draft as any, draftRefId: rid };
    await this.prisma.telegramSession.upsert({
      where: { chatId_cafeId: { chatId: BigInt(chatId), cafeId } },
      create: {
        chatId: BigInt(chatId),
        cafeId,
        state: 'building_order',
        context: ctx as any,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
      update: {
        state: 'building_order',
        context: ctx as any,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    return rid;
  }

  async getCustomerByTelegram(cafeId: string, chatId: string, branchId: string): Promise<{
    customerId: string;
    customerName: string;
    isNew: boolean;
  } | null> {
    const phone = `tg_${chatId}`;
    const existing = await this.prisma.customer.findUnique({
      where: { cafeId_branchId_phone: { cafeId, branchId, phone } },
      select: { id: true, name: true },
    });

    if (existing) {
      return { customerId: existing.id, customerName: existing.name || `Telegram ${chatId.slice(0, 4)}`, isNew: false };
    }

    const customer = await this.prisma.customer.create({
      data: {
        cafeId,
        branchId,
        phone,
        telegramId: BigInt(chatId),
        name: `Telegram ${chatId.slice(0, 4)}`,
        totalOrders: 0,
      },
      select: { id: true, name: true },
    });

    return { customerId: customer.id, customerName: customer.name, isNew: true };
  }

  async getBranch(cafeId: string): Promise<{ id: string } | null> {
    return this.prisma.branch.findFirst({
      where: { cafeId, slug: 'main-branch' },
      select: { id: true },
    });
  }

  async getCustomerSavedLocations(customerId: string, cafeId: string): Promise<Array<{ id: string; name: string; isDefault: boolean }>> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true },
    });

    return [{
      id: 'default',
      name: 'محل ستايل',
      isDefault: true,
    }];
  }

  getEligiblePaymentMethods(draft: OrderDraft): string[] {
    return ['كاش', 'الرصيد'];
  }

  async getOrderStatus(orderId: string, cafeId: string): Promise<{ status: string; total: number; code: string } | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, total: true, code: true },
    });
    if (!order || order.status === 'ARCHIVED') return null;
    return { status: order.status, total: Number(order.total), code: order.code };
  }

  async getRecentOrders(customerId: string, cafeId: string, limit = 5): Promise<Array<{ id: string; code: string; total: number; status: string; createdAt: Date }>> {
    const orders = await this.prisma.order.findMany({
      where: { customerId, cafeId, status: { notIn: ['CANCELLED', 'ARCHIVED'] } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, code: true, total: true, status: true, createdAt: true },
    });
    return orders.map(o => ({ ...o, total: Number(o.total) }));
  }

  async getCustomerBalance(customerId: string, cafeId: string): Promise<{ totalSpent: number; lastOrderDate: Date | null }> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { totalSpent: true, lastOrderDate: true },
    });
    return {
      totalSpent: Number(customer?.totalSpent || 0),
      lastOrderDate: customer?.lastOrderDate || null,
    };
  }

  formatStatus(status: string): string {
    const map: Record<string, string> = {
      NEW: '🆕 جديد',
      CONFIRMED: '✅ تم التأكيد',
      READY: '☕ جاهز',
      PICKED_UP: '🚗 في الطريق',
      DELIVERED: '📦 تم التوصيل',
      PAID: '💰 مدفوع',
      CLOSED: '🔒 مغلق',
      CANCELLED: '❌ ملغي',
    };
    return map[status] || status;
  }

  formatDraftSummary(draft: OrderDraft): string {
    const lines: string[] = [];
    for (const item of draft.items) {
      const cust = item.customization
        ? ` (${Object.values(item.customization).filter(Boolean).join(' - ')})`
        : '';
      lines.push(`${item.quantity}× ${item.productName}${cust} = ${item.unitPrice * item.quantity} ج.م`);
    }
    let summary = `طلبك:\n\n${lines.join('\n')}\n\nالإجمالي: ${draft.total} ج.م`;
    if (draft.deliveryLocation) {
      summary += `\nالتوصيل: ${draft.deliveryLocation.name}`;
      if (draft.deliveryLocation.notes) summary += ` (${draft.deliveryLocation.notes})`;
    }
    if (draft.paymentMethod) {
      summary += `\nالدفع: ${draft.paymentMethod}`;
    }
    return summary;
  }

  async buildUsualOrderDraft(customerId: string, cafeId: string, branchId: string): Promise<OrderDraft | null> {
    const profile = await this.personalization.getProfile(cafeId, customerId, `tg_${customerId.slice(0, 4)}`);
    if (!profile.orderingProfile?.usualOrder || profile.level < 2) return null;

    const usual = profile.orderingProfile.usualOrder;
    const products = await this.prisma.product.findMany({
      where: { cafeId, active: true, id: { in: usual.items.map(i => i.productId) } },
      select: { id: true, name: true, price: true },
    });

    const productMap = new Map(products.map(p => [p.id, p]));
    const items: DraftItem[] = [];

    for (const item of usual.items) {
      const product = productMap.get(item.productId);
      if (!product) return null;
      const customization: Record<string, string> = {};
      if (item.coffeeRoast) customization.roast = item.coffeeRoast;
      if (item.coffeeBlend) customization.blend = item.coffeeBlend;
      if (item.coffeeSugar) customization.sugar = item.coffeeSugar;
      items.push({
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity || 1,
        unitPrice: Number(product.price),
        customization: Object.keys(customization).length > 0 ? customization : undefined,
      });
    }

    if (items.length === 0) return null;

    const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    return {
      version: 1,
      createdAt: Date.now(),
      customerName: profile.preferredName,
      items,
      deliveryLocation: usual.deliveryLocation ? {
        name: usual.deliveryLocation.name || 'محل ستايل',
        notes: usual.deliveryLocation.description || undefined,
      } : undefined,
      paymentMethod: profile.orderingProfile.preferredPaymentMethod
        ? this.paymentMethodLabel(profile.orderingProfile.preferredPaymentMethod)
        : 'كاش',
      total,
    };
  }

  async buildRepeatLastDraft(customerId: string, cafeId: string, branchId: string): Promise<OrderDraft | null> {
    const lastOrder = await this.prisma.order.findFirst({
      where: { customerId, cafeId, status: { notIn: ['CANCELLED', 'ARCHIVED'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, items: { select: { productId: true, quantity: true, unitPrice: true } } },
    });

    if (!lastOrder || !lastOrder.items || lastOrder.items.length === 0) return null;

    const productIds = lastOrder.items.map(i => i.productId);
    const products = await this.prisma.product.findMany({
      where: { cafeId, active: true, id: { in: productIds } },
      select: { id: true, name: true, price: true },
    });

    const productMap = new Map(products.map(p => [p.id, p]));
    const items: DraftItem[] = [];

    for (const item of lastOrder.items) {
      const product = productMap.get(item.productId);
      if (!product) continue;
      items.push({
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: Number(product.price),
      });
    }

    if (items.length === 0) return null;

    const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    return {
      version: 1,
      createdAt: Date.now(),
      items,
      deliveryLocation: { name: 'محل ستايل' },
      paymentMethod: 'كاش',
      total,
    };
  }

  paymentMethodLabel(method: string): string {
    const map: Record<string, string> = {
      CASH: 'كاش',
      INSTANT_PAYMENT: 'دفع فوري',
      WEEKLY_ACCOUNT: 'الحساب الأسبوعي',
      MONTHLY_ACCOUNT: 'الحساب الشهري',
      PREPAID_BALANCE: 'الرصيد',
    };
    return map[method] || method;
  }

  async createOrderFromDraft(
    draft: OrderDraft,
    cafeId: string,
    branchId: string,
    chatId: string,
    refId: string,
  ): Promise<{ orderId: string; code: string }> {
    const phone = `tg_${chatId}`;

    const duplicateKey = IdempotencyService.generateKey('callback', cafeId, chatId, QuickAction.CONFIRM_DRAFT, refId);
    const dupCheck = await this.idempotencyService.isProcessed('telegram_callback', duplicateKey, cafeId);
    if (dupCheck.duplicated) {
      throw new Error(`Duplicate order prevention: already processed as ${dupCheck.entityType} ${dupCheck.entityId}`);
    }

    const customer = await this.getCustomerByTelegram(cafeId, chatId, branchId);
    if (!customer) throw new Error('Customer not found');

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Date.now().toString(36).toUpperCase() + randomBytes(2).toString('hex').toUpperCase();
    const code = `TEL-${dateStr}-${suffix}`;

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          code,
          cafeId,
          branchId,
          customerId: customer.customerId,
          status: 'NEW',
          type: 'TELEGRAM',
          total: draft.total,
          source: 'TELEGRAM',
          sourceType: 'TELEGRAM_ORDER',
          version: 1,
          items: {
            create: draft.items.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
          },
        },
        include: { items: { include: { product: true } }, customer: true },
      });

      await tx.customer.update({
        where: { id: customer.customerId },
        data: {
          totalOrders: { increment: 1 },
          totalSpent: { increment: draft.total },
          lastOrderDate: new Date(),
        },
      });

      await tx.telegramSession.update({
        where: { chatId_cafeId: { chatId: BigInt(chatId), cafeId } },
        data: { state: 'completed', context: {} },
      });

      await this.markIdempotent(cafeId, chatId, QuickAction.CONFIRM_DRAFT, refId, 'order', created.id, undefined, tx);

      return created;
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
          branchId,
          customerName: customer.customerName,
          phone: `tg_${chatId}`,
          status: 'NEW',
          total: draft.total,
          sourceType: 'TELEGRAM_ORDER',
          createdById: ownerStaff.id,
          items: {
            create: draft.items.map(i => ({
              cafeId,
              productId: i.productId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
            })),
          },
        },
      });
    }

    this.eventBus.publish('order.created', {
      orderId: order.id,
      code: order.code,
      total: draft.total,
      customerId: customer.customerId,
      customerPhone: `tg_${chatId}`,
      type: 'TELEGRAM',
      status: 'NEW',
      source: 'TELEGRAM',
      sourceType: 'TELEGRAM_ORDER',
      branchId,
      cafeId,
      items: draft.items.map(i => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      createdAt: new Date().toISOString(),
    } as any, cafeId);

    this.eventsService.emitToBarista('inCafe.order.created', {
      cafeId,
      orderCode: code,
      customerName: customer.customerName,
      total: draft.total,
      sourceType: 'TELEGRAM_ORDER',
      items: draft.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
    } as any, cafeId);

    return { orderId: order.id, code };
  }

  estimateDelivery(): string {
    return 'التوصيل المتوقع: 10–14 دقيقة';
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CoffeeMemoryAssist,
  CoffeeMemoryDraft,
  CoffeePreferenceField,
  ConversationStyle,
  CUSTOMER_MEMORY_KEY,
  CustomerMemoryEnvelope,
  CustomerMemoryMetrics,
  CustomerMemoryRecord,
  CustomerMemoryScope,
  CustomerMemorySummary,
  ExplicitCommandResult,
  ExplicitCustomerPreferences,
  ExplicitMemoryCommand,
  InferredCustomerPreferences,
  InferredPreferenceSignal,
  OrderMemoryObservation,
  RepeatOrderPreview,
} from './customer-memory.types';

const STRONG_CONFIDENCE = 0.8;
const STRONG_EVIDENCE = 5;
const INFERRED_EXPIRY_DAYS = 180;
const INFERRED_HALF_LIFE_DAYS = 90;
const MAX_AUDIT_ENTRIES = 20;
const MAX_PROCESSED_ORDERS = 50;
const ELIGIBLE_ORDER_STATUSES = new Set(['CONFIRMED', 'DELIVERED', 'COMPLETED']);

type JsonObject = Record<string, unknown>;

@Injectable()
export class CustomerMemoryService {
  private readonly locks = new Map<string, Promise<void>>();
  private readonly counters = {
    knownLookups: 0,
    knownHits: 0,
    repeatOrderRequests: 0,
    repeatOrdersConfirmed: 0,
    completedOrders: 0,
    completedOrderQuestions: 0,
    assistedStarts: 0,
    assistedCompletions: 0,
    corrections: 0,
    quickProposals: 0,
    quickAcceptances: 0,
    memoryRejections: 0,
    failedMemoryLookups: 0,
    crossTenantAccessRejections: 0,
    completionTimeMs: 0,
  };

  constructor(private readonly prisma: PrismaService) {}

  isLikelyName(value: string): boolean {
    const name = value.trim().replace(/\s+/g, ' ');
    if (!/^[\p{L}' -]{2,40}$/u.test(name)) return false;
    if (name.split(' ').length > 4) return false;
    const normalized = this.normalizeArabic(name);
    return !/(قهوه|شاي|لاتيه|طلب|منيو|سكر|باسورد|كلمه مرور|توكن|token|password)/i.test(normalized);
  }

  parseExplicitCommand(message: string): ExplicitMemoryCommand | null {
    const original = message.trim().replace(/\s+/g, ' ');
    const text = this.normalizeArabic(original);
    if (!text) return null;

    if (/(امسح|احذف).*(تفضيلاتي|كل التفضيلات)|انسى كل تفضيلاتي/.test(text)) {
      return { type: 'RESET_PREFERENCES' };
    }

    const originalNameMatch = original.match(/^ناديني\s+([\p{L}' -]{2,40}?)(?:\s+بدل\s+[\p{L}' -]{2,40})?$/u);
    if (originalNameMatch && this.isLikelyName(originalNameMatch[1])) {
      return { type: 'SET_NAME', value: originalNameMatch[1].trim() };
    }

    if (/^(كلمني|اتكلم معايا)\s+(عربي|بالعربي)$/.test(text)) {
      return { type: 'SET_LANGUAGE', value: 'ar-EG' };
    }
    if (/^(كلمني|اتكلم معايا)\s+(انجليزي|بالانجليزي|english)$/.test(text)) {
      return { type: 'SET_LANGUAGE', value: 'en' };
    }

    if (/عايز اطلب بسرعه|خليك مختصر|طلب سريع/.test(text)) {
      return { type: 'SET_STYLE', value: 'FAST' };
    }
    if (/اسالني خطوه خطوه|ساعدني اختار|وجهني/.test(text)) {
      return { type: 'SET_STYLE', value: 'GUIDED' };
    }
    if (/اقترحلي حاجه|وريني اختيارات|عايز اجرب/.test(text)) {
      return { type: 'SET_STYLE', value: 'EXPLORING' };
    }

    if (/متقترحليش.*اضاف|بدون اقتراحات|مش عايز اقتراحات/.test(text)) {
      return { type: 'DISABLE_SUGGESTIONS' };
    }

    const ingredient = this.extractIngredient(text);
    if (ingredient && /انسى.*(مش بحب|مبحبش)|شيل.*من المرفوض/.test(text)) {
      return { type: 'REMOVE_DISLIKED_INGREDIENT', value: ingredient };
    }
    if (ingredient && /(مش بحب|مبحبش|متحطليش|ما تحطليش|بدون|بلاش)/.test(text)) {
      return { type: 'ADD_DISLIKED_INGREDIENT', value: ingredient };
    }

    if (/(امسح|احذف|انسى).*(تفضيل )?(السكر|سكر)/.test(text)) {
      return { type: 'REMOVE_PREFERENCE', field: 'sugarPreference' };
    }
    if (/(امسح|احذف|انسى).*(تفضيل )?(التحميص|تحميص)/.test(text)) {
      return { type: 'REMOVE_PREFERENCE', field: 'coffeeRoast' };
    }
    if (/(امسح|احذف|انسى).*(تفضيل )?(الخلطه|التحويج|المحوج)/.test(text)) {
      return { type: 'REMOVE_PREFERENCE', field: 'coffeeBlend' };
    }
    if (/(امسح|احذف|انسى).*(تفضيل )?(الحجم|حجم)/.test(text)) {
      return { type: 'REMOVE_PREFERENCE', field: 'preferredSize' };
    }

    if (/بحب المشروبات الساقعه|مشروباتي دايما ساقعه/.test(text)) {
      return { type: 'SET_TEMPERATURE', value: 'COLD' };
    }
    if (/بحب المشروبات السخنه|مشروباتي دايما سخنه/.test(text)) {
      return { type: 'SET_TEMPERATURE', value: 'HOT' };
    }

    const permanent = /(دايما|دائما|المعتاد|من دلوقتي|كل مره)/.test(text);
    if (!permanent) return null;

    if (/من غير سكر|بدون سكر|بلا سكر/.test(text)) {
      return { type: 'SET_SUGAR', value: 'NO_SUGAR' };
    }
    if (/سكر خفيف|سكر قليل/.test(text)) {
      return { type: 'SET_SUGAR', value: 'LIGHT_SUGAR' };
    }
    if (/سكر زياده|سكر زياده/.test(text)) {
      return { type: 'SET_SUGAR', value: 'EXTRA_SUGAR' };
    }
    if (/سكر مظبوط|سكر وسط/.test(text)) {
      return { type: 'SET_SUGAR', value: 'MEDIUM_SUGAR' };
    }

    if (/(الحجم|خلي المعتاد).*(صغير)/.test(text)) {
      return { type: 'SET_SIZE', value: 'SMALL' };
    }
    if (/(الحجم|خلي المعتاد).*(وسط|متوسط)/.test(text)) {
      return { type: 'SET_SIZE', value: 'MEDIUM' };
    }
    if (/(الحجم|خلي المعتاد).*(كبير)/.test(text)) {
      return { type: 'SET_SIZE', value: 'LARGE' };
    }

    if (/(التحميص|القهوه).*(فاتح)/.test(text)) return { type: 'SET_ROAST', value: 'LIGHT' };
    if (/(التحميص|القهوه).*(غامق)/.test(text)) return { type: 'SET_ROAST', value: 'DARK' };
    if (/(التحميص).*(وسط|متوسط)/.test(text)) return { type: 'SET_ROAST', value: 'MEDIUM' };

    if (/غير محوج|ساده/.test(text)) return { type: 'SET_BLEND', value: 'PLAIN' };
    if (/محوج/.test(text)) return { type: 'SET_BLEND', value: 'SPICED' };

    return null;
  }

  async savePreferredName(scope: CustomerMemoryScope, name: string): Promise<boolean> {
    const preferredName = name.trim().replace(/\s+/g, ' ');
    if (!this.isLikelyName(preferredName)) return false;

    await this.mutateMemory(scope, 'preferred_name.updated', ['preferredName'], (memory) => {
      memory.preferredName = preferredName;
      return true;
    }, preferredName);
    return true;
  }

  async applyExplicitCommand(scope: CustomerMemoryScope, message: string): Promise<ExplicitCommandResult> {
    const command = this.parseExplicitCommand(message);
    if (!command) return { handled: false };

    let preferredName: string | undefined = command.type === 'SET_NAME' ? command.value : undefined;
    let customerNameUpdate: string | undefined = preferredName;
    let response = 'تمام، حفظت التفضيل.';

    await this.mutateMemory(scope, `explicit.${command.type.toLowerCase()}`, this.commandFields(command), (memory) => {
      const preferences = memory.explicitPreferences;
      switch (command.type) {
        case 'SET_NAME':
          memory.preferredName = command.value;
          response = `تمام، هناديك ${command.value}.`;
          this.counters.corrections++;
          break;
        case 'SET_LANGUAGE':
          memory.preferredLanguage = command.value;
          response = command.value === 'ar-EG' ? 'تمام، هكلمك بالعربي.' : 'Okay, I will use English.';
          break;
        case 'SET_STYLE':
          memory.conversationStyle = command.value;
          response = this.styleResponse(command.value);
          break;
        case 'SET_SUGAR':
          preferences.sugarPreference = command.value;
          response = 'تمام، حفظت تفضيل السكر للمرة الجاية.';
          break;
        case 'SET_ROAST':
          preferences.coffeeRoast = command.value;
          response = 'تمام، حفظت درجة التحميص المعتادة.';
          break;
        case 'SET_BLEND':
          preferences.coffeeBlend = command.value;
          response = 'تمام، حفظت تفضيل الخلطة المعتادة.';
          break;
        case 'SET_SIZE':
          preferences.preferredSizes.default = command.value;
          response = 'تمام، حفظت الحجم المعتاد.';
          break;
        case 'SET_TEMPERATURE':
          preferences.preferredTemperature.default = command.value;
          response = 'تمام، حفظت تفضيل حرارة المشروب.';
          break;
        case 'ADD_DISLIKED_INGREDIENT':
          preferences.dislikedIngredients = this.addUnique(preferences.dislikedIngredients, command.value);
          response = 'تمام، مش هاعتبر المكوّن ده اختيار مفضل.';
          break;
        case 'REMOVE_DISLIKED_INGREDIENT':
          preferences.dislikedIngredients = preferences.dislikedIngredients.filter((item) => item !== command.value);
          response = 'تمام، مسحت المكوّن من التفضيلات المرفوضة.';
          this.counters.corrections++;
          break;
        case 'DISABLE_SUGGESTIONS':
          preferences.disableUpselling = true;
          response = 'تمام، مش هاقترح إضافات.';
          break;
        case 'REMOVE_PREFERENCE':
          this.removePreference(memory, command.field);
          response = 'تمام، مسحت التفضيل المطلوب فقط.';
          this.counters.corrections++;
          break;
        case 'RESET_PREFERENCES':
          memory.explicitPreferences = this.emptyExplicitPreferences();
          memory.inferredPreferences = this.emptyInferredPreferences();
          delete memory.conversationStyle;
          delete memory.preferredLanguage;
          response = 'تمام، مسحت تفضيلات الطلب. سجل الطلبات نفسه محفوظ.';
          this.counters.corrections++;
          break;
      }
      return true;
    }, customerNameUpdate);

    return { handled: true, response, command, preferredName };
  }

  async getMemory(scope: CustomerMemoryScope, now = new Date()): Promise<CustomerMemoryRecord | null> {
    const customer = await this.findScopedCustomer(scope);
    if (!customer) return null;

    const root = this.asObject(customer.preferredProducts);
    const envelope = this.readEnvelope(root);
    const key = this.channelKey(scope);
    const stored = envelope.channels[key];
    const memory = stored
      ? this.normalizeMemory(stored, scope, customer.name || undefined)
      : this.newMemory(scope, customer.name || undefined);
    return this.applyDecay(memory, now);
  }

  async observeOrder(scope: CustomerMemoryScope, observation: OrderMemoryObservation): Promise<boolean> {
    if (!ELIGIBLE_ORDER_STATUSES.has(observation.status.toUpperCase())) return false;
    if (observation.isTest || observation.isDuplicate || !observation.orderId) return false;

    return this.mutateMemory(scope, 'inference.order_observed', ['inferredPreferences'], (memory) => {
      const orderHash = this.hash(`order|${observation.orderId}`);
      if (memory.processedOrderHashes.includes(orderHash)) return false;

      const observedAt = observation.occurredAt || new Date();
      const inferred = memory.inferredPreferences;
      if (observation.coffeeRoast) {
        inferred.coffeeRoast = this.observeSignal(this.decaySignal(inferred.coffeeRoast, observedAt), observation.coffeeRoast, observedAt);
      }
      if (observation.coffeeBlend) {
        inferred.coffeeBlend = this.observeSignal(this.decaySignal(inferred.coffeeBlend, observedAt), observation.coffeeBlend, observedAt);
      }
      if (observation.sugarPreference) {
        inferred.sugarPreference = this.observeSignal(this.decaySignal(inferred.sugarPreference, observedAt), observation.sugarPreference, observedAt);
      }
      if (observation.preferredSize) {
        inferred.preferredSizes.default = this.observeSignal(
          this.decaySignal(inferred.preferredSizes.default, observedAt),
          observation.preferredSize,
          observedAt,
        );
      }
      if (observation.preferredTemperature) {
        inferred.preferredTemperature.default = this.observeSignal(
          this.decaySignal(inferred.preferredTemperature.default, observedAt),
          observation.preferredTemperature,
          observedAt,
        );
      }

      for (const productId of observation.products || []) {
        inferred.preferredProducts[productId] = this.observeSignal(
          this.decaySignal(inferred.preferredProducts[productId], observedAt),
          productId,
          observedAt,
        );
      }
      for (const addOn of observation.addOns || []) {
        inferred.preferredAddOns[addOn] = this.observeSignal(
          this.decaySignal(inferred.preferredAddOns[addOn], observedAt),
          addOn,
          observedAt,
        );
      }
      for (const addOn of observation.rejectedAddOns || []) {
        inferred.rejectedAddOns[addOn] = this.observeSignal(
          this.decaySignal(inferred.rejectedAddOns[addOn], observedAt),
          addOn,
          observedAt,
        );
      }

      const hourBucket = `${String(observedAt.getHours()).padStart(2, '0')}:00`;
      inferred.typicalOrderTimes[hourBucket] = this.observeSignal(
        this.decaySignal(inferred.typicalOrderTimes[hourBucket], observedAt),
        hourBucket,
        observedAt,
      );

      memory.processedOrderHashes = [...memory.processedOrderHashes, orderHash].slice(-MAX_PROCESSED_ORDERS);
      return true;
    });
  }

  async resolveCoffeePreferences(
    scope: CustomerMemoryScope,
    currentDraft: CoffeeMemoryDraft,
  ): Promise<CoffeeMemoryAssist> {
    const memory = await this.getMemory(scope);
    const result: CoffeeMemoryAssist = {
      draft: { ...currentDraft },
      memoryFields: [],
      sources: {},
      requiresConfirmation: false,
    };
    const fields: CoffeePreferenceField[] = ['roast', 'blend', 'sugar'];
    for (const field of fields) {
      if (currentDraft[field]) result.sources[field] = 'CURRENT';
    }
    if (!memory) return result;

    this.applyCoffeePreference(result, 'roast', memory.explicitPreferences.coffeeRoast, memory.inferredPreferences.coffeeRoast);
    this.applyCoffeePreference(result, 'blend', memory.explicitPreferences.coffeeBlend, memory.inferredPreferences.coffeeBlend);
    this.applyCoffeePreference(
      result,
      'sugar',
      memory.explicitPreferences.sugarPreference,
      memory.inferredPreferences.sugarPreference,
    );

    if (result.memoryFields.length > 0) {
      result.requiresConfirmation = true;
      this.counters.assistedStarts++;
      if (result.memoryFields.length === 3) this.counters.quickProposals++;
    }
    return result;
  }

  async buildSummary(scope: CustomerMemoryScope, context: 'COFFEE' | 'GENERAL' = 'GENERAL'): Promise<CustomerMemorySummary | null> {
    const memory = await this.getMemory(scope);
    if (!memory) return null;

    const strongPreferences: CustomerMemorySummary['strongPreferences'] = {};
    const explicit = memory.explicitPreferences;
    const inferred = memory.inferredPreferences;
    if (context === 'COFFEE') {
      this.addSummaryPreference(strongPreferences, 'coffeeRoast', explicit.coffeeRoast, inferred.coffeeRoast);
      this.addSummaryPreference(strongPreferences, 'coffeeBlend', explicit.coffeeBlend, inferred.coffeeBlend);
      this.addSummaryPreference(strongPreferences, 'sugar', explicit.sugarPreference, inferred.sugarPreference);
    }
    if (explicit.preferredSizes.default) strongPreferences.preferredSize = explicit.preferredSizes.default;
    if (explicit.preferredTemperature.default) {
      strongPreferences.preferredTemperature = explicit.preferredTemperature.default;
    }
    if (explicit.dislikedIngredients.length) {
      strongPreferences.dislikedIngredients = [...explicit.dislikedIngredients];
    }
    if (explicit.disableUpselling) strongPreferences.disableUpselling = true;

    return {
      preferredName: memory.preferredName,
      language: memory.preferredLanguage,
      conversationStyle: memory.conversationStyle,
      strongPreferences,
    };
  }

  async buildRepeatOrderPreview(scope: CustomerMemoryScope, sourceOrderId?: string): Promise<RepeatOrderPreview | null> {
    const customer = await this.findScopedCustomer(scope);
    if (!customer) return null;
    this.counters.repeatOrderRequests++;

    const order = await this.prisma.order.findFirst({
      where: {
        ...(sourceOrderId ? { id: sourceOrderId } : {}),
        cafeId: scope.cafeId,
        customerId: scope.customerId,
        status: { in: ['DELIVERED', 'COMPLETED'] },
        sourceType: { notIn: ['TEST', 'DEBUG', 'DUPLICATE'] },
      },
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    if (!order || order.cafeId !== scope.cafeId || order.customerId !== scope.customerId) return null;

    const productIds = [...new Set(order.items.map((item: any) => item.productId))] as string[];
    const currentProducts = await this.prisma.product.findMany({
      where: { cafeId: scope.cafeId, id: { in: productIds } },
      select: { id: true, name: true, price: true, active: true },
    });
    const products = new Map(currentProducts.map((product: any) => [product.id, product]));

    const items = order.items.map((item: any) => {
      const product: any = products.get(item.productId);
      const available = Boolean(product?.active);
      const previousUnitPrice = Number(item.unitPrice);
      const currentUnitPrice = available ? Number(product.price) : undefined;
      return {
        productId: item.productId,
        productName: product?.name || item.product?.name || 'منتج غير متاح',
        quantity: item.quantity,
        notes: item.notes || undefined,
        previousUnitPrice,
        currentUnitPrice,
        priceChanged: available && currentUnitPrice !== previousUnitPrice,
        available,
      };
    });
    const unavailableItems = items.filter((item: any) => !item.available);
    return {
      sourceOrderId: order.id,
      branchId: order.branchId,
      items,
      currentTotal: items.reduce(
        (total: number, item: any) => total + (item.available ? item.currentUnitPrice * item.quantity : 0),
        0,
      ),
      unavailableItems,
      priceChanged: items.some((item: any) => item.priceChanged),
      requiresConfirmation: true,
      canConfirmAll: items.length > 0 && unavailableItems.length === 0,
    };
  }

  recordRepeatOrderConfirmed(): void {
    this.counters.repeatOrdersConfirmed++;
  }

  recordMemoryRejection(): void {
    this.counters.memoryRejections++;
  }

  recordOrderCompleted(questionCount: number, completionMs: number, memoryAssisted: boolean): void {
    this.counters.completedOrders++;
    this.counters.completedOrderQuestions += Math.max(0, questionCount);
    this.counters.completionTimeMs += Math.max(0, completionMs);
    if (memoryAssisted) {
      this.counters.assistedCompletions++;
      this.counters.quickAcceptances++;
    }
  }

  getMetricsSnapshot(): CustomerMemoryMetrics {
    const c = this.counters;
    return {
      knownCustomerPercentage: this.ratio(c.knownHits, c.knownLookups),
      repeatOrderUsage: c.repeatOrdersConfirmed,
      averageQuestionsPerCompletedOrder: c.completedOrders ? c.completedOrderQuestions / c.completedOrders : 0,
      memoryAssistedOrderCompletionRate: this.ratio(c.assistedCompletions, c.assistedStarts),
      customerCorrections: c.corrections,
      quickOrderAcceptanceRate: this.ratio(c.quickAcceptances, c.quickProposals),
      memoryRejectionRate: this.ratio(c.memoryRejections, c.assistedStarts),
      failedMemoryLookups: c.failedMemoryLookups,
      crossTenantAccessRejections: c.crossTenantAccessRejections,
      averageOrderCompletionMs: c.completedOrders ? c.completionTimeMs / c.completedOrders : 0,
    };
  }

  private async mutateMemory<T>(
    scope: CustomerMemoryScope,
    action: string,
    fields: string[],
    mutator: (memory: CustomerMemoryRecord) => T,
    customerName?: string,
  ): Promise<T> {
    const lockKey = `${scope.cafeId}|${scope.customerId}|${this.channelKey(scope)}`;
    return this.withLock(lockKey, async () => {
      const customer = await this.findScopedCustomer(scope);
      if (!customer) throw new Error('Customer memory scope rejected');

      const root = this.asObject(customer.preferredProducts);
      const envelope = this.readEnvelope(root);
      const channelKey = this.channelKey(scope);
      const memory = envelope.channels[channelKey]
        ? this.normalizeMemory(envelope.channels[channelKey], scope, customer.name || undefined)
        : this.newMemory(scope, customer.name || undefined);
      const result = mutator(memory);
      const now = new Date().toISOString();
      memory.lastUpdatedAt = now;
      memory.audit = [...memory.audit, { action, fields: [...fields], at: now }].slice(-MAX_AUDIT_ENTRIES);
      envelope.channels[channelKey] = memory;
      root[CUSTOMER_MEMORY_KEY] = envelope;

      const updated = await this.prisma.customer.updateMany({
        where: {
          id: scope.customerId,
          cafeId: scope.cafeId,
          phone: scope.channelIdentity,
        },
        data: {
          preferredProducts: root as Prisma.InputJsonValue,
          ...(customerName ? { name: customerName } : {}),
        },
      });
      if (updated.count !== 1) {
        this.counters.crossTenantAccessRejections++;
        throw new Error('Customer memory update scope rejected');
      }
      return result;
    });
  }

  private async findScopedCustomer(scope: CustomerMemoryScope): Promise<any | null> {
    this.counters.knownLookups++;
    if (!scope.cafeId || !scope.customerId || !scope.channel || !scope.channelIdentity) {
      this.counters.failedMemoryLookups++;
      this.counters.crossTenantAccessRejections++;
      return null;
    }
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: scope.customerId,
        cafeId: scope.cafeId,
        phone: scope.channelIdentity,
      },
      select: { id: true, cafeId: true, phone: true, name: true, preferredProducts: true },
    });
    if (!customer) {
      this.counters.failedMemoryLookups++;
      this.counters.crossTenantAccessRejections++;
      return null;
    }
    if (customer.name) this.counters.knownHits++;
    return customer;
  }

  private newMemory(scope: CustomerMemoryScope, preferredName?: string): CustomerMemoryRecord {
    return {
      version: 2,
      cafeId: scope.cafeId,
      customerId: scope.customerId,
      channel: scope.channel,
      channelIdentityHash: this.identityHash(scope),
      preferredName,
      preferredLanguage: undefined,
      explicitPreferences: this.emptyExplicitPreferences(),
      inferredPreferences: this.emptyInferredPreferences(),
      processedOrderHashes: [],
      audit: [],
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  private normalizeMemory(
    value: CustomerMemoryRecord,
    scope: CustomerMemoryScope,
    preferredName?: string,
  ): CustomerMemoryRecord {
    const fresh = this.newMemory(scope, preferredName);
    if (
      value?.version !== 2 ||
      value.cafeId !== scope.cafeId ||
      value.customerId !== scope.customerId ||
      value.channel !== scope.channel ||
      value.channelIdentityHash !== this.identityHash(scope)
    ) {
      this.counters.crossTenantAccessRejections++;
      return fresh;
    }
    return {
      ...fresh,
      ...value,
      explicitPreferences: { ...fresh.explicitPreferences, ...value.explicitPreferences },
      inferredPreferences: { ...fresh.inferredPreferences, ...value.inferredPreferences },
      processedOrderHashes: Array.isArray(value.processedOrderHashes) ? value.processedOrderHashes.slice(-MAX_PROCESSED_ORDERS) : [],
      audit: Array.isArray(value.audit) ? value.audit.slice(-MAX_AUDIT_ENTRIES) : [],
    };
  }

  private emptyExplicitPreferences(): ExplicitCustomerPreferences {
    return {
      preferredProducts: [],
      preferredSizes: {},
      preferredTemperature: {},
      preferredAddOns: [],
      dislikedIngredients: [],
      disableUpselling: false,
    };
  }

  private emptyInferredPreferences(): InferredCustomerPreferences {
    return {
      preferredProducts: {},
      preferredSizes: {},
      preferredTemperature: {},
      preferredAddOns: {},
      rejectedAddOns: {},
      typicalOrderTimes: {},
    };
  }

  private observeSignal(
    signal: InferredPreferenceSignal | undefined,
    observedValue: string,
    observedAt: Date,
  ): InferredPreferenceSignal {
    const at = observedAt.toISOString();
    const candidates = signal?.candidates ? { ...signal.candidates } : {};
    const candidate = candidates[observedValue];
    candidates[observedValue] = candidate
      ? { ...candidate, count: candidate.count + 1, lastObservedAt: at }
      : { count: 1, firstObservedAt: at, lastObservedAt: at };

    const ranked = Object.entries(candidates).sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count;
      return b[1].lastObservedAt.localeCompare(a[1].lastObservedAt);
    });
    const [value, winner] = ranked[0];
    const totalEvidence = ranked.reduce((sum, [, item]) => sum + item.count, 0);
    const strength = winner.count >= 5 ? 0.9 : winner.count === 4 ? 0.75 : winner.count === 3 ? 0.6 : winner.count === 2 ? 0.4 : 0.2;
    const confidence = Math.round(strength * (winner.count / totalEvidence) * 1000) / 1000;
    const expiresAt = new Date(observedAt.getTime() + INFERRED_EXPIRY_DAYS * 86400000).toISOString();
    return {
      value,
      confidence,
      evidenceCount: winner.count,
      firstObservedAt: winner.firstObservedAt,
      lastObservedAt: winner.lastObservedAt,
      expiresAt,
      candidates,
    };
  }

  private applyDecay(memory: CustomerMemoryRecord, now: Date): CustomerMemoryRecord {
    const copy = JSON.parse(JSON.stringify(memory)) as CustomerMemoryRecord;
    const inferred = copy.inferredPreferences;
    inferred.coffeeRoast = this.decaySignal(inferred.coffeeRoast, now);
    inferred.coffeeBlend = this.decaySignal(inferred.coffeeBlend, now);
    inferred.sugarPreference = this.decaySignal(inferred.sugarPreference, now);
    this.decaySignalMap(inferred.preferredProducts, now);
    this.decaySignalMap(inferred.preferredSizes, now);
    this.decaySignalMap(inferred.preferredTemperature, now);
    this.decaySignalMap(inferred.preferredAddOns, now);
    this.decaySignalMap(inferred.rejectedAddOns, now);
    this.decaySignalMap(inferred.typicalOrderTimes, now);
    return copy;
  }

  private decaySignal(signal: InferredPreferenceSignal | undefined, now: Date): InferredPreferenceSignal | undefined {
    if (!signal) return undefined;
    if (new Date(signal.expiresAt).getTime() <= now.getTime()) return undefined;
    const ageDays = Math.max(0, (now.getTime() - new Date(signal.lastObservedAt).getTime()) / 86400000);
    const decay = Math.pow(0.5, ageDays / INFERRED_HALF_LIFE_DAYS);
    const confidence = Math.round(signal.confidence * decay * 1000) / 1000;
    return confidence < 0.1 ? undefined : { ...signal, confidence };
  }

  private decaySignalMap(map: Record<string, InferredPreferenceSignal>, now: Date): void {
    for (const key of Object.keys(map)) {
      const decayed = this.decaySignal(map[key], now);
      if (decayed) map[key] = decayed;
      else delete map[key];
    }
  }

  private applyCoffeePreference(
    result: CoffeeMemoryAssist,
    field: CoffeePreferenceField,
    explicitValue: string | undefined,
    inferredSignal: InferredPreferenceSignal | undefined,
  ): void {
    if (result.draft[field]) return;
    if (explicitValue) {
      result.draft[field] = explicitValue;
      result.memoryFields.push(field);
      result.sources[field] = 'EXPLICIT';
      return;
    }
    if (this.isStrong(inferredSignal)) {
      result.draft[field] = inferredSignal!.value;
      result.memoryFields.push(field);
      result.sources[field] = 'INFERRED';
    }
  }

  private addSummaryPreference(
    summary: CustomerMemorySummary['strongPreferences'],
    key: string,
    explicitValue: string | undefined,
    inferredSignal: InferredPreferenceSignal | undefined,
  ): void {
    if (explicitValue) summary[key] = explicitValue;
    else if (this.isStrong(inferredSignal)) summary[key] = inferredSignal!.value;
  }

  private isStrong(signal?: InferredPreferenceSignal): boolean {
    return Boolean(signal && signal.confidence >= STRONG_CONFIDENCE && signal.evidenceCount >= STRONG_EVIDENCE);
  }

  private removePreference(memory: CustomerMemoryRecord, field: string): void {
    if (field === 'preferredSize') {
      delete memory.explicitPreferences.preferredSizes.default;
      delete memory.inferredPreferences.preferredSizes.default;
      return;
    }
    if (field === 'sugarPreference' || field === 'coffeeRoast' || field === 'coffeeBlend') {
      delete (memory.explicitPreferences as any)[field];
      delete (memory.inferredPreferences as any)[field];
    }
  }

  private commandFields(command: ExplicitMemoryCommand): string[] {
    if ('field' in command) return [command.field];
    if ('value' in command) return [command.type === 'SET_NAME' ? 'preferredName' : command.type.toLowerCase()];
    return [command.type.toLowerCase()];
  }

  private styleResponse(style: ConversationStyle): string {
    if (style === 'FAST') return 'تمام، هخلي الطلب سريع ومختصر.';
    if (style === 'GUIDED') return 'تمام، هنمشي خطوة خطوة.';
    return 'تمام، هاعرض لك اختيارات قليلة وواضحة.';
  }

  private extractIngredient(text: string): string | null {
    const aliases: Array<[RegExp, string]> = [
      [/قرفه/, 'cinnamon'],
      [/كريمه|كريم شانتيه/, 'cream'],
      [/مكسرات|لوز|بندق/, 'nuts'],
      [/كراميل/, 'caramel'],
      [/شوكولاته/, 'chocolate'],
    ];
    return aliases.find(([pattern]) => pattern.test(text))?.[1] || null;
  }

  private normalizeArabic(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[إأآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[؟?!.,،]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private readEnvelope(root: JsonObject): CustomerMemoryEnvelope {
    const stored = this.asObject(root[CUSTOMER_MEMORY_KEY]);
    const channels = this.asObject(stored.channels) as Record<string, CustomerMemoryRecord>;
    return { version: 2, channels: { ...channels } };
  }

  private asObject(value: unknown): JsonObject {
    return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as JsonObject) } : {};
  }

  private addUnique(values: string[], value: string): string[] {
    return values.includes(value) ? values : [...values, value];
  }

  private channelKey(scope: CustomerMemoryScope): string {
    return `${scope.channel}:${this.identityHash(scope)}`;
  }

  private identityHash(scope: CustomerMemoryScope): string {
    return this.hash(`${scope.channel}|${scope.botIdentity || ''}|${scope.channelIdentity}`);
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 24);
  }

  private ratio(numerator: number, denominator: number): number {
    return denominator ? Math.round((numerator / denominator) * 10000) / 10000 : 0;
  }

  private async withLock<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.locks.set(key, queued);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.locks.get(key) === queued) this.locks.delete(key);
    }
  }
}

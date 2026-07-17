import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CustomerMemoryService } from '../customer-memory/customer-memory.service';
import { CustomerMemoryRecord } from '../customer-memory/customer-memory.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  OwnerRecommendationRules,
  RecommendationCandidate,
  RecommendationConstraints,
  RecommendationContext,
  RecommendationDecision,
  RecommendationMetrics,
  RecommendationRejectionType,
  RecommendationType,
} from './recommendation.types';

interface InternalCandidate extends RecommendationCandidate {
  _product: any;
  _compatibility: number;
  _offerValue: number;
  _simplicity: number;
  _margin: number;
}

const UPSELL_TYPES = new Set<RecommendationType>([
  'SIZE_UPGRADE',
  'PREMIUM_VARIANT',
  'ADD_ON',
  'EXTRA_SHOT',
  'MILK_UPGRADE',
  'COMBO_UPGRADE',
]);
const CROSS_SELL_TYPES = new Set<RecommendationType>(['COMPLEMENTARY_PRODUCT', 'OFFER_BASED_RECOMMENDATION']);

@Injectable()
export class RecommendationService {
  private readonly cafeRules = new Map<string, OwnerRecommendationRules>();
  private readonly counters = {
    opportunities: 0,
    shown: 0,
    accepted: 0,
    rejected: 0,
    upsellShown: 0,
    upsellAccepted: 0,
    crossShown: 0,
    crossAccepted: 0,
    incrementalValue: 0,
    ordersBeforeTotal: 0,
    ordersAfterTotal: 0,
    completedOrders: 0,
    abandonedOrders: 0,
    messages: 0,
    repeatedViolations: 0,
    unavailable: 0,
    optOuts: 0,
    complaints: 0,
    latencyMs: 0,
    confidenceTotal: 0,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly customerMemory: CustomerMemoryService,
  ) {}

  configureCafe(cafeId: string, partial: Partial<OwnerRecommendationRules>): OwnerRecommendationRules {
    if (!cafeId) throw new Error('Cafe scope is required');
    const current = this.cafeRules.get(cafeId) || this.defaultRules();
    const next: OwnerRecommendationRules = {
      ...current,
      ...partial,
      maximumSuggestionsPerOrder: this.clamp(partial.maximumSuggestionsPerOrder ?? current.maximumSuggestionsPerOrder, 0, 2),
      maximumPriceIncrease: Math.max(0, partial.maximumPriceIncrease ?? current.maximumPriceIncrease),
      minimumConfidence: this.clamp(partial.minimumConfidence ?? current.minimumConfidence, 0.5, 0.98),
      overloadedQueueThreshold: Math.max(1, partial.overloadedQueueThreshold ?? current.overloadedQueueThreshold),
      weights: { ...current.weights, ...(partial.weights || {}) },
      relationships: [...(partial.relationships ?? current.relationships)],
      comboOffers: [...(partial.comboOffers ?? current.comboOffers)],
      blockedProductIds: [...(partial.blockedProductIds ?? current.blockedProductIds)],
      blockedCategories: [...(partial.blockedCategories ?? current.blockedCategories)],
      allowedHours: [...(partial.allowedHours ?? current.allowedHours)],
      allowedBranchIds: [...(partial.allowedBranchIds ?? current.allowedBranchIds)],
      experimentsEnabled: false,
    };
    this.cafeRules.set(cafeId, next);
    return next;
  }

  getCafeRules(cafeId: string): OwnerRecommendationRules {
    return this.cafeRules.get(cafeId) || this.defaultRules();
  }

  async recommend(context: RecommendationContext): Promise<RecommendationDecision> {
    const startedAt = Date.now();
    this.counters.opportunities++;
    const finish = (decision: Omit<RecommendationDecision, 'latencyMs'>): RecommendationDecision => {
      const latencyMs = Date.now() - startedAt;
      this.counters.latencyMs += latencyMs;
      return { ...decision, latencyMs };
    };

    const rules = this.getCafeRules(context.cafeId);
    const suppression = this.policySuppression(context, rules);
    if (suppression) return finish({ recommendations: [], suppressedReason: suppression });

    try {
      const [catalog, memory, persistentRejections] = await Promise.all([
        this.loadCatalog(context.cafeId, context.branchId),
        this.loadMemory(context),
        this.loadPersistentRejections(context),
      ]);
      if (!catalog.length) return finish({ recommendations: [], suppressedReason: 'NO_AVAILABLE_CATALOG' });
      if (memory?.explicitPreferences.disableUpselling && context.mode === 'PROACTIVE') {
        return finish({ recommendations: [], suppressedReason: 'CUSTOMER_OPT_OUT' });
      }

      const constraints = context.constraints || this.parseConstraints(context.currentMessage || '');
      if (context.mode === 'CUSTOMER_REQUEST' && this.hasUnsupportedSafetyConstraint(context.currentMessage || '')) {
        return finish({
          recommendations: [],
          clarification: 'ممكن توضح الاحتياج الغذائي؟ مش هافترض إن منتج مناسب من غير بيانات معتمدة.',
        });
      }
      let candidates: InternalCandidate[] = [];
      if (context.mode === 'CUSTOMER_REQUEST') {
        candidates = this.generateRequestedCandidates(context, catalog, constraints, memory);
      } else if (context.mode === 'UNAVAILABLE_ALTERNATIVE') {
        candidates = this.generateAlternatives(context, catalog);
      } else {
        candidates = [
          ...this.generateUpsells(context, catalog, rules),
          ...this.generateRelationshipCandidates(context, catalog, rules),
          ...this.generateComboCandidates(context, catalog, rules),
        ];
      }
      if (constraints.budget !== undefined) {
        const deliveryFee = Math.max(0, context.deliveryFee || 0);
        candidates = candidates.filter((candidate) => candidate.currentPrice + deliveryFee <= constraints.budget!);
      }

      const filtered = candidates.filter((candidate) => this.isCandidateAllowed(
        candidate,
        context,
        rules,
        memory,
        persistentRejections,
      ));
      const scored = filtered
        .map((candidate) => this.scoreCandidate(candidate, context, rules, memory, constraints))
        .sort((a, b) => b.confidence - a.confidence);
      if (constraints.cheapest) scored.sort((a, b) => a.currentPrice - b.currentPrice || b.confidence - a.confidence);
      const recommendations = this.applyRecommendationPolicy(scored, context, rules, memory);
      if (!recommendations.length && context.mode === 'CUSTOMER_REQUEST' && this.needsClarification(constraints, catalog)) {
        return finish({
          recommendations: [],
          clarification: 'تحبها سخنة ولا ساقعة، وفي حدود كام جنيه؟',
        });
      }
      return finish({ recommendations: recommendations.map((candidate) => this.publicCandidate(candidate)) });
    } catch {
      return finish({ recommendations: [], suppressedReason: 'SAFE_PIPELINE_FAILURE' });
    }
  }

  async revalidateForAcceptance(
    context: RecommendationContext,
    candidate: RecommendationCandidate,
  ): Promise<RecommendationCandidate | null> {
    try {
      const catalog = await this.loadCatalog(context.cafeId, context.branchId);
      const product = catalog.find((item) => item.id === candidate.productId);
      if (!product || !this.productAvailable(product, context.branchId)) {
        this.counters.unavailable++;
        return null;
      }
      const refreshed = { ...candidate };
      if (candidate.type === 'SIZE_UPGRADE') {
        const size = product.sizes?.find((item: any) => item.id === candidate.variantId && item.active);
        if (!size) return null;
        const previous = candidate.metadata?.priceBefore ?? this.effectivePrice(product, context.branchId);
        refreshed.currentPrice = this.money(this.effectivePrice(product, context.branchId) + Number(size.priceAdjust));
        refreshed.estimatedAddedValue = this.money(refreshed.currentPrice - previous);
      } else if (['ADD_ON', 'EXTRA_SHOT', 'MILK_UPGRADE'].includes(candidate.type)) {
        const addOn = product.addOns?.find((item: any) => item.id === candidate.variantId && item.active);
        if (!addOn || !this.addOnAvailable(addOn, context.branchId)) return null;
        refreshed.currentPrice = this.money(Number(addOn.price));
        refreshed.estimatedAddedValue = refreshed.currentPrice;
      } else if (candidate.type === 'COMBO_UPGRADE') {
        const ids = candidate.bundleItems?.map((item) => item.productId) || [];
        const products = ids.map((id) => catalog.find((item) => item.id === id));
        if (products.some((item) => !item || !this.productAvailable(item, context.branchId))) return null;
        const regular = products.reduce((total, item) => total + this.effectivePrice(item, context.branchId), 0);
        if (!candidate.discountedPrice || candidate.discountedPrice >= regular) return null;
        const covered = context.cart
          .filter((item) => ids.includes(item.productId))
          .reduce((total, item) => total + item.unitPrice * item.quantity, 0);
        refreshed.metadata = { ...refreshed.metadata, regularBundlePrice: this.money(regular) };
        refreshed.estimatedAddedValue = this.money(Math.max(0, candidate.discountedPrice - covered));
      } else {
        refreshed.currentPrice = this.money(this.effectivePrice(product, context.branchId));
        refreshed.estimatedAddedValue = refreshed.currentPrice;
      }
      if (!Number.isFinite(refreshed.currentPrice) || refreshed.currentPrice <= 0) return null;
      return refreshed;
    } catch {
      return null;
    }
  }

  async markShown(
    context: RecommendationContext,
    candidate: RecommendationCandidate,
    message: string,
  ): Promise<RecommendationCandidate> {
    this.counters.shown++;
    this.counters.confidenceTotal += candidate.confidence;
    if (UPSELL_TYPES.has(candidate.type)) this.counters.upsellShown++;
    if (CROSS_SELL_TYPES.has(candidate.type)) this.counters.crossShown++;
    if (!context.customerId || !this.prisma.suggestion?.create) return candidate;
    try {
      const created = await this.prisma.suggestion.create({
        data: {
          cafeId: context.cafeId,
          customerId: context.customerId,
          predictedHour: (context.now || new Date()).getHours(),
          confidence: candidate.confidence,
          predictedItems: { recommendation: candidate } as unknown as Prisma.InputJsonValue,
          suggestedMessage: message,
          reasoning: 'IN_ORDER_RECOMMENDATION',
          channelPrediction: context.channel,
          status: 'shown',
        },
      });
      return { ...candidate, trackingId: created.id };
    } catch {
      return candidate;
    }
  }

  async recordOutcome(
    context: RecommendationContext,
    candidate: RecommendationCandidate,
    accepted: boolean,
    rejectionType: RecommendationRejectionType = 'CURRENT_ORDER_ONLY',
  ): Promise<void> {
    if (accepted) {
      this.counters.accepted++;
      this.counters.incrementalValue += Math.max(0, candidate.estimatedAddedValue);
      if (UPSELL_TYPES.has(candidate.type)) this.counters.upsellAccepted++;
      if (CROSS_SELL_TYPES.has(candidate.type)) this.counters.crossAccepted++;
    } else {
      this.counters.rejected++;
    }
    if (!candidate.trackingId || !context.customerId || !this.prisma.suggestion?.updateMany) return;
    const status = accepted
      ? 'accepted'
      : rejectionType === 'PERMANENT'
        ? 'rejected_permanent'
        : rejectionType === 'TEMPORARY'
          ? 'rejected_temporary'
          : 'rejected_current';
    await this.prisma.suggestion.updateMany({
      where: { id: candidate.trackingId, cafeId: context.cafeId, customerId: context.customerId },
      data: { status },
    }).catch(() => undefined);
  }

  recordOrderCompleted(valueBefore: number, valueAfter: number, messages: number): void {
    this.counters.completedOrders++;
    this.counters.ordersBeforeTotal += Math.max(0, valueBefore);
    this.counters.ordersAfterTotal += Math.max(0, valueAfter);
    this.counters.messages += Math.max(0, messages);
  }

  recordAbandonment(): void {
    this.counters.abandonedOrders++;
  }

  recordOptOut(): void {
    this.counters.optOuts++;
  }

  recordComplaintAfterSuggestion(): void {
    this.counters.complaints++;
  }

  getMetricsSnapshot(): RecommendationMetrics {
    const c = this.counters;
    const totalOrders = c.completedOrders + c.abandonedOrders;
    return {
      recommendationOpportunities: c.opportunities,
      recommendationsShown: c.shown,
      recommendationsAccepted: c.accepted,
      recommendationsRejected: c.rejected,
      upsellAcceptanceRate: this.ratio(c.upsellAccepted, c.upsellShown),
      crossSellAcceptanceRate: this.ratio(c.crossAccepted, c.crossShown),
      incrementalOrderValue: this.money(c.incrementalValue),
      averageOrderValueBefore: c.completedOrders ? this.money(c.ordersBeforeTotal / c.completedOrders) : 0,
      averageOrderValueAfter: c.completedOrders ? this.money(c.ordersAfterTotal / c.completedOrders) : 0,
      orderCompletionRate: this.ratio(c.completedOrders, totalOrders),
      abandonmentRate: this.ratio(c.abandonedOrders, totalOrders),
      averageMessagesPerOrder: c.completedOrders ? c.messages / c.completedOrders : 0,
      repeatedSuggestionViolations: c.repeatedViolations,
      unavailableRecommendationRate: this.ratio(c.unavailable, c.opportunities),
      optOutRate: this.ratio(c.optOuts, c.opportunities),
      complaintsAfterSuggestions: c.complaints,
      averageRecommendationLatencyMs: c.opportunities ? c.latencyMs / c.opportunities : 0,
      averageRecommendationConfidence: c.shown ? c.confidenceTotal / c.shown : 0,
    };
  }

  isRecommendationRequest(message: string): boolean {
    const text = this.normalize(message);
    return /اقترحلي|رشحلي|مش عارف اطلب ايه|عايز حاجه (حلوه|ساقعه|خفيفه)|عايز الارخص|معايا \d+|اقل من \d+/.test(text);
  }

  isOptOutMessage(message: string): boolean {
    const text = this.normalize(message);
    return /من غير اقتراحات|متقترحليش|مش عايز (عروض|اقتراحات)|الطلب بس|متزودش حاجه|عايز اطلب بسرعه/.test(text);
  }

  isComplaintMessage(message: string): boolean {
    const text = this.normalize(message);
    return /شكوي|مشكله|زعلان|غلط|وحش|تاخير|اتاخرت|مش فاهمني/.test(text);
  }

  parseConstraints(message: string): RecommendationConstraints {
    const text = this.normalize(message).replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
    const constraints: RecommendationConstraints = {};
    const budget = text.match(/(?:اقل من|في حدود|معايا|ميزانيه)\s*(\d+(?:\.\d+)?)/);
    if (budget) constraints.budget = Number(budget[1]);
    if (/الارخص|اوفر|اقل سعر/.test(text)) constraints.cheapest = true;
    if (/ساقع|بارد|ايس/.test(text)) constraints.temperature = 'COLD';
    if (/سخن|دافي/.test(text)) constraints.temperature = 'HOT';
    if (/من غير سكر|مش مسكر|بدون سكر/.test(text)) constraints.sweetness = 'NO_SUGAR';
    else if (/سكر خفيف|مش حلو اوي/.test(text)) constraints.sweetness = 'LOW_SUGAR';
    else if (/حلو|مسكر/.test(text)) constraints.sweetness = 'SWEET';
    if (/ديكاف|من غير كافيين/.test(text)) constraints.caffeine = 'DECAF';
    if (/قهوه|كافيه|لاتيه|اسبريسو/.test(text)) constraints.category = 'coffee';
    else if (/حلو|حلويات|كيك|كوكيز/.test(text)) constraints.category = 'dessert';
    else if (/ساندوتش|برجر|اكل/.test(text)) constraints.category = 'food';
    if (/خفيف/.test(text)) constraints.light = true;
    if (/حجم صغير/.test(text)) constraints.size = 'SMALL';
    if (/حجم وسط|حجم متوسط/.test(text)) constraints.size = 'MEDIUM';
    if (/حجم كبير/.test(text)) constraints.size = 'LARGE';
    return constraints;
  }

  formatRecommendations(recommendations: RecommendationCandidate[]): string {
    if (!recommendations.length) return 'تمام، نكمل الطلب.';
    if (recommendations.length > 1) {
      const lines = recommendations.slice(0, 3).map((candidate, index) =>
        `${index + 1}. ${candidate.productName} - ${candidate.currentPrice.toFixed(2)} ج`,
      );
      return `ممكن تختار من دول:\n${lines.join('\n')}\n\nتحب أنهي؟`;
    }
    const candidate = recommendations[0];
    if (candidate.type === 'SIZE_UPGRADE') {
      return `تحب تخليها ${candidate.variantName} بفرق ${candidate.estimatedAddedValue.toFixed(2)} ج؟`;
    }
    if (['ADD_ON', 'EXTRA_SHOT', 'MILK_UPGRADE'].includes(candidate.type)) {
      return `تحب تضيف ${candidate.variantName || candidate.productName} بـ${candidate.currentPrice.toFixed(2)} ج؟`;
    }
    if (candidate.type === 'COMBO_UPGRADE') {
      const saving = (candidate.metadata?.regularBundlePrice || 0) - (candidate.discountedPrice || 0);
      return `فيه كومبو أوفر بـ${saving.toFixed(2)} ج. تحب أضيفه؟`;
    }
    if (candidate.type === 'AVAILABILITY_ALTERNATIVE' || candidate.type === 'ALTERNATIVE_PRODUCT') {
      return `${candidate.productName} متاح بديل بسعر ${candidate.currentPrice.toFixed(2)} ج. تحبّه؟`;
    }
    return `تحب تضيف ${candidate.productName} بـ${candidate.currentPrice.toFixed(2)} ج؟`;
  }

  private async loadCatalog(cafeId: string, branchId: string): Promise<any[]> {
    return this.prisma.product.findMany({
      where: { cafeId },
      include: {
        sizes: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
        addOns: { where: { active: true }, include: { inventory: true }, orderBy: { sortOrder: 'asc' } },
        branchProducts: { where: { branchId } },
        recipe: { include: { inventory: true } },
      },
    });
  }

  private async loadMemory(context: RecommendationContext): Promise<CustomerMemoryRecord | null> {
    if (!context.memoryScope) return null;
    return this.customerMemory.getMemory(context.memoryScope).catch(() => null);
  }

  private async loadPersistentRejections(context: RecommendationContext): Promise<Set<string>> {
    if (!context.customerId || !this.prisma.suggestion?.findMany) return new Set();
    const since = new Date((context.now || new Date()).getTime() - 30 * 86400000);
    const rows = await this.prisma.suggestion.findMany({
      where: {
        cafeId: context.cafeId,
        customerId: context.customerId,
        status: { in: ['rejected_current', 'rejected_temporary', 'rejected_permanent'] },
        createdAt: { gte: since },
      },
      select: { status: true, predictedItems: true },
    }).catch(() => []);
    const counts = new Map<string, number>();
    const blocked = new Set<string>();
    for (const row of rows) {
      const parsed = this.parseTrackedRecommendation(row.predictedItems);
      if (!parsed?.trackingKey) continue;
      if (row.status === 'rejected_permanent' || row.status === 'rejected_temporary') blocked.add(parsed.trackingKey);
      counts.set(parsed.trackingKey, (counts.get(parsed.trackingKey) || 0) + 1);
    }
    for (const [key, count] of counts) if (count >= 2) blocked.add(key);
    return blocked;
  }

  private parseTrackedRecommendation(value: unknown): RecommendationCandidate | null {
    try {
      const parsed: any = typeof value === 'string' ? JSON.parse(value) : value;
      return parsed?.recommendation || null;
    } catch {
      return null;
    }
  }

  private generateUpsells(
    context: RecommendationContext,
    catalog: any[],
    rules: OwnerRecommendationRules,
  ): InternalCandidate[] {
    if (!rules.enableUpselling) return [];
    const candidates: InternalCandidate[] = [];
    for (const item of context.cart) {
      const product = catalog.find((entry) => entry.id === item.productId);
      if (!product) continue;
      const sizes = [...(product.sizes || [])].sort((a: any, b: any) => a.sortOrder - b.sortOrder);
      let currentIndex = sizes.findIndex((size: any) => size.id === item.variantId || size.name === item.variantName);
      if (currentIndex < 0 && sizes.length > 1) currentIndex = 0;
      const nextSize = currentIndex >= 0 ? sizes[currentIndex + 1] : undefined;
      if (nextSize) {
        const previousPrice = item.unitPrice || this.effectivePrice(product, context.branchId);
        const nextPrice = this.money(this.effectivePrice(product, context.branchId) + Number(nextSize.priceAdjust));
        const difference = this.money(nextPrice - previousPrice);
        if (difference > 0) {
          candidates.push(this.internalCandidate({
            type: 'SIZE_UPGRADE',
            product,
            variantId: nextSize.id,
            variantName: nextSize.name,
            baseProductId: product.id,
            reason: 'LARGER_SIZE_AVAILABLE',
            currentPrice: nextPrice,
            estimatedAddedValue: difference,
            compatibility: 0.98,
            simplicity: 0.95,
            offerValue: 0,
            margin: this.margin(product, nextPrice),
            metadata: { priceBefore: previousPrice },
          }));
        }
      }

      for (const addOn of product.addOns || []) {
        const type = this.addOnType(addOn.name);
        candidates.push(this.internalCandidate({
          type,
          product,
          variantId: addOn.id,
          variantName: addOn.name,
          baseProductId: product.id,
          reason: 'DIRECT_PRODUCT_ADD_ON',
          currentPrice: Number(addOn.price),
          estimatedAddedValue: Number(addOn.price),
          compatibility: 1,
          simplicity: 0.85,
          offerValue: 0,
          margin: this.addOnMargin(addOn),
        }));
      }
    }
    return candidates;
  }

  private generateRelationshipCandidates(
    context: RecommendationContext,
    catalog: any[],
    rules: OwnerRecommendationRules,
  ): InternalCandidate[] {
    if (!rules.enableCrossSelling) return [];
    const candidates: InternalCandidate[] = [];
    const cartIds = new Set(context.cart.map((item) => item.productId));
    for (const relation of rules.relationships.filter((item) => item.enabled)) {
      if (!cartIds.has(relation.primaryProductId)) continue;
      const primary = catalog.find((item) => item.id === relation.primaryProductId);
      if (!primary || !this.productAvailable(primary, context.branchId)) continue;
      if (relation.branchRestrictions?.length && !relation.branchRestrictions.includes(context.branchId)) continue;
      const hour = (context.now || new Date()).getHours();
      if (relation.allowedHours?.length && !relation.allowedHours.includes(hour)) continue;
      if (relation.fulfillmentMethods?.length && !relation.fulfillmentMethods.includes(context.fulfillmentMethod || 'DELIVERY')) continue;
      const product = catalog.find((item) => item.id === relation.recommendedProductId);
      if (!product) continue;
      const type: RecommendationType = relation.relationshipType === 'PREMIUM_VARIANT'
        ? 'PREMIUM_VARIANT'
        : relation.relationshipType === 'ALTERNATIVE'
          ? 'ALTERNATIVE_PRODUCT'
          : 'COMPLEMENTARY_PRODUCT';
      const price = this.effectivePrice(product, context.branchId);
      candidates.push(this.internalCandidate({
        type,
        product,
        reason: relation.relationshipType === 'COMPLEMENTARY' ? 'OWNER_APPROVED_PAIRING' : relation.relationshipType,
        currentPrice: price,
        estimatedAddedValue: price,
        compatibility: this.clamp(relation.priority / 10, 0.5, 1),
        simplicity: 0.8,
        offerValue: 0,
        margin: this.margin(product, price),
      }));
    }

    const explicitPrimaries = new Set(rules.relationships.map((item) => item.primaryProductId));
    for (const cartItem of context.cart) {
      if (explicitPrimaries.has(cartItem.productId)) continue;
      const primary = catalog.find((item) => item.id === cartItem.productId);
      if (!primary || !this.isCoffee(primary)) continue;
      for (const product of catalog.filter((item) => this.isPastry(item)).slice(0, 3)) {
        const price = this.effectivePrice(product, context.branchId);
        candidates.push(this.internalCandidate({
          type: 'COMPLEMENTARY_PRODUCT',
          product,
          reason: 'CONSERVATIVE_CATEGORY_PAIRING',
          currentPrice: price,
          estimatedAddedValue: price,
          compatibility: 0.68,
          simplicity: 0.85,
          offerValue: 0,
          margin: this.margin(product, price),
          metadata: { inferredRelationship: true },
        }));
      }
    }
    return candidates;
  }

  private generateComboCandidates(
    context: RecommendationContext,
    catalog: any[],
    rules: OwnerRecommendationRules,
  ): InternalCandidate[] {
    if (!rules.enableComboSuggestions) return [];
    const now = context.now || new Date();
    const cartIds = new Set(context.cart.map((item) => item.productId));
    const candidates: InternalCandidate[] = [];
    for (const offer of rules.comboOffers.filter((item) => item.enabled)) {
      if (!offer.productIds.some((id) => cartIds.has(id))) continue;
      if (offer.branchRestrictions?.length && !offer.branchRestrictions.includes(context.branchId)) continue;
      if (offer.startsAt && new Date(offer.startsAt) > now) continue;
      if (offer.endsAt && new Date(offer.endsAt) <= now) continue;
      const products = offer.productIds.map((id) => catalog.find((item) => item.id === id));
      if (products.some((product) => !product || !this.productAvailable(product, context.branchId))) continue;
      const regular = products.reduce((total, product) => total + this.effectivePrice(product, context.branchId), 0);
      if (!Number.isFinite(offer.comboPrice) || offer.comboPrice <= 0 || offer.comboPrice >= regular) continue;
      const primary = products[0];
      const covered = context.cart
        .filter((item) => offer.productIds.includes(item.productId))
        .reduce((total, item) => total + item.unitPrice * item.quantity, 0);
      candidates.push(this.internalCandidate({
        type: 'COMBO_UPGRADE',
        product: primary,
        variantId: offer.id,
        variantName: 'كومبو',
        reason: 'OWNER_CONFIGURED_COMBO',
        currentPrice: offer.comboPrice,
        discountedPrice: offer.comboPrice,
        estimatedAddedValue: Math.max(0, offer.comboPrice - covered),
        compatibility: 1,
        simplicity: 0.75,
        offerValue: this.clamp((regular - offer.comboPrice) / regular, 0, 1),
        margin: 0.5,
        bundleItems: products.map((product) => ({
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitPrice: this.effectivePrice(product, context.branchId),
        })),
        metadata: { regularBundlePrice: this.money(regular) },
      }));
    }
    return candidates;
  }

  private generateRequestedCandidates(
    context: RecommendationContext,
    catalog: any[],
    constraints: RecommendationConstraints,
    memory: CustomerMemoryRecord | null,
  ): InternalCandidate[] {
    const cartIds = new Set(context.cart.map((item) => item.productId));
    return catalog
      .filter((product) => !cartIds.has(product.id))
      .filter((product) => this.matchesConstraints(product, constraints, context.branchId))
      .map((product) => {
        const price = this.effectivePrice(product, context.branchId);
        const personalized = this.memoryLikesProduct(memory, product.id);
        const type: RecommendationType = constraints.budget || constraints.cheapest
          ? 'BUDGET_RECOMMENDATION'
          : personalized
            ? 'PERSONALIZED_RECOMMENDATION'
            : 'TIME_BASED_RECOMMENDATION';
        return this.internalCandidate({
          type,
          product,
          reason: personalized ? 'STRONG_CUSTOMER_PREFERENCE' : 'CUSTOMER_REQUEST_CONSTRAINTS',
          currentPrice: price,
          estimatedAddedValue: price,
          compatibility: this.constraintCompatibility(product, constraints),
          simplicity: 0.8,
          offerValue: 0,
          margin: this.margin(product, price),
        });
      });
  }

  private generateAlternatives(context: RecommendationContext, catalog: any[]): InternalCandidate[] {
    const unavailable = catalog.find((product) => product.id === context.unavailableProductId);
    if (!unavailable) return [];
    return catalog
      .filter((product) => product.id !== unavailable.id && product.category === unavailable.category)
      .map((product) => {
        const price = this.effectivePrice(product, context.branchId);
        const priceDistance = Math.abs(price - this.effectivePrice(unavailable, context.branchId));
        return this.internalCandidate({
          type: 'AVAILABILITY_ALTERNATIVE',
          product,
          reason: 'SAME_CATEGORY_AVAILABLE_ALTERNATIVE',
          currentPrice: price,
          estimatedAddedValue: price,
          compatibility: this.clamp(1 - priceDistance / Math.max(price, 1), 0.5, 0.95),
          simplicity: 0.9,
          offerValue: 0,
          margin: this.margin(product, price),
        });
      });
  }

  private isCandidateAllowed(
    candidate: InternalCandidate,
    context: RecommendationContext,
    rules: OwnerRecommendationRules,
    memory: CustomerMemoryRecord | null,
    persistentRejections: Set<string>,
  ): boolean {
    if (candidate._product.cafeId !== context.cafeId) return false;
    if (!this.productAvailable(candidate._product, context.branchId)) return false;
    if (!Number.isFinite(candidate.currentPrice) || candidate.currentPrice <= 0) return false;
    if (rules.blockedProductIds.includes(candidate.productId)) return false;
    if (rules.blockedCategories.map((item) => this.normalize(item)).includes(this.normalize(candidate.category))) return false;
    if (context.session.rejectedCandidateKeys.includes(candidate.trackingKey) || persistentRejections.has(candidate.trackingKey)) return false;
    if (context.session.shownCandidateKeys.includes(candidate.trackingKey)) {
      this.counters.repeatedViolations++;
      return false;
    }
    if (context.mode === 'PROACTIVE' && candidate.estimatedAddedValue > rules.maximumPriceIncrease) return false;
    if (CROSS_SELL_TYPES.has(candidate.type) && context.cart.some((item) => item.productId === candidate.productId)) return false;
    if (this.conflictsWithDislikes(candidate, memory)) return false;
    if (rules.useProfitabilityWeight && candidate._margin < 0) return false;
    if (context.session.queueDepth && context.session.queueDepth >= rules.overloadedQueueThreshold && candidate._simplicity < 0.7) return false;
    if (['ADD_ON', 'EXTRA_SHOT', 'MILK_UPGRADE'].includes(candidate.type)) {
      const addOn = candidate._product.addOns?.find((item: any) => item.id === candidate.variantId);
      if (!addOn || !this.addOnAvailable(addOn, context.branchId)) return false;
    }
    return true;
  }

  private scoreCandidate(
    candidate: InternalCandidate,
    context: RecommendationContext,
    rules: OwnerRecommendationRules,
    memory: CustomerMemoryRecord | null,
    constraints: RecommendationConstraints,
  ): InternalCandidate {
    const customerPreference = this.customerPreferenceScore(candidate, memory, constraints);
    const orderRelevance = candidate.baseProductId && context.cart.some((item) => item.productId === candidate.baseProductId) ? 1 : 0.75;
    const priceSuitability = context.mode !== 'PROACTIVE' && constraints.budget === undefined
      ? 0.75
      : this.priceSuitability(candidate, constraints, context.cart);
    const timeRelevance = this.timeRelevance(candidate._product, context.now || new Date());
    const inventoryHealth = candidate.metadata?.lowStock ? 0.3 : 1;
    const businessRelevance = this.clamp(
      candidate._margin * 0.5 + inventoryHealth * 0.2 + candidate._simplicity * 0.3,
      0,
      1,
    );
    const weights = rules.weights;
    const weighted =
      customerPreference * weights.customerPreference +
      candidate._compatibility * weights.compatibility +
      orderRelevance * weights.orderRelevance +
      candidate._offerValue * weights.offerValue +
      priceSuitability * weights.priceSuitability +
      0.5 * weights.historicalAcceptance +
      timeRelevance * weights.timeRelevance +
      inventoryHealth * weights.inventoryHealth +
      candidate._margin * weights.marginContribution +
      candidate._simplicity * weights.preparationSimplicity +
      Math.max(customerPreference, candidate._compatibility) * weights.customerExperience;
    const weightTotal = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
    const frictionPenalty = Math.min(0.25, context.session.commercialSuggestionsShown * 0.12);
    const pricePenalty = context.mode === 'PROACTIVE' && priceSuitability < 0.4 ? 0.15 : 0;
    candidate.customerRelevance = this.money(this.clamp(customerPreference, 0, 1));
    candidate.businessRelevance = this.money(businessRelevance);
    candidate.confidence = this.money(this.clamp(weighted / weightTotal - frictionPenalty - pricePenalty, 0, 1));
    return candidate;
  }

  private applyRecommendationPolicy(
    candidates: InternalCandidate[],
    context: RecommendationContext,
    rules: OwnerRecommendationRules,
    memory: CustomerMemoryRecord | null,
  ): InternalCandidate[] {
    const style = context.conversationStyle || memory?.conversationStyle || 'GUIDED';
    const threshold = style === 'FAST' ? Math.max(0.85, rules.minimumConfidence) : rules.minimumConfidence;
    let eligible = candidates.filter((candidate) => candidate.confidence >= threshold);
    if (context.mode === 'CUSTOMER_REQUEST' || context.mode === 'UNAVAILABLE_ALTERNATIVE') {
      const maximum = style === 'EXPLORING' || context.mode === 'CUSTOMER_REQUEST' ? 3 : 1;
      return eligible.slice(0, maximum);
    }
    if (context.session.upsellShown) eligible = eligible.filter((candidate) => !UPSELL_TYPES.has(candidate.type));
    if (context.session.crossSellShown) eligible = eligible.filter((candidate) => !CROSS_SELL_TYPES.has(candidate.type));
    const upsell = eligible.find((candidate) => UPSELL_TYPES.has(candidate.type));
    if (upsell) return [upsell];
    const crossSell = eligible.find((candidate) => CROSS_SELL_TYPES.has(candidate.type) && candidate.confidence >= threshold + 0.05);
    return crossSell ? [crossSell] : [];
  }

  private policySuppression(context: RecommendationContext, rules: OwnerRecommendationRules): string | null {
    if (!context.cafeId || !context.branchId) return 'MISSING_TENANT_SCOPE';
    if (context.session.optOut || this.isOptOutMessage(context.currentMessage || '')) return 'CUSTOMER_OPT_OUT';
    if (context.session.complaint || this.isComplaintMessage(context.currentMessage || '')) return 'COMPLAINT_STATE';
    if (context.session.frustrated) return 'FRUSTRATED_CUSTOMER';
    if (context.session.repeatedMisunderstanding) return 'REPEATED_MISUNDERSTANDING';
    if (context.session.commercialSuggestionsShown >= rules.maximumSuggestionsPerOrder && context.mode === 'PROACTIVE') {
      return 'OWNER_SUGGESTION_LIMIT';
    }
    const now = context.now || new Date();
    if (rules.allowedHours.length && !rules.allowedHours.includes(now.getHours())) return 'OUTSIDE_ALLOWED_HOURS';
    if (rules.allowedBranchIds.length && !rules.allowedBranchIds.includes(context.branchId)) return 'BRANCH_NOT_ALLOWED';
    if (context.session.urgent && context.mode === 'PROACTIVE') return 'URGENT_ORDER';
    return null;
  }

  private productAvailable(product: any, branchId: string): boolean {
    if (!product?.active) return false;
    if (product.branchId && product.branchId !== branchId) return false;
    const branchEntry = product.branchProducts?.find((entry: any) => entry.branchId === branchId);
    if (branchEntry && !branchEntry.isAvailable) return false;
    if (product.isRefrigerated && Number(product.refrigeratorStock || 0) <= 0) return false;
    for (const recipeItem of product.recipe || []) {
      const inventory = recipeItem.inventory;
      if (!inventory || inventory.branchId !== branchId) return false;
      const available = Number(inventory.currentQty) - Number(inventory.reservedQty || 0);
      if (available < Number(recipeItem.quantity)) return false;
    }
    return true;
  }

  private addOnAvailable(addOn: any, branchId: string): boolean {
    if (!addOn?.active || !addOn.inventory || addOn.inventory.branchId !== branchId) return false;
    const available = Number(addOn.inventory.currentQty) - Number(addOn.inventory.reservedQty || 0);
    return available >= Number(addOn.quantity || 0);
  }

  private effectivePrice(product: any, branchId: string): number {
    const branchEntry = product.branchProducts?.find((entry: any) => entry.branchId === branchId && entry.isAvailable);
    const price = branchEntry ? Number(branchEntry.price) : Number(product.price);
    return this.money(price);
  }

  private matchesConstraints(product: any, constraints: RecommendationConstraints, branchId: string): boolean {
    if (!this.productAvailable(product, branchId)) return false;
    const price = this.effectivePrice(product, branchId);
    if (constraints.budget !== undefined && price > constraints.budget) return false;
    const text = this.normalize(`${product.name} ${product.category || ''} ${product.description || ''}`);
    if (constraints.temperature === 'COLD' && !/ساقع|بارد|ايس|iced|cold/.test(text)) return false;
    if (constraints.temperature === 'HOT' && /ساقع|بارد|ايس|iced|cold/.test(text)) return false;
    if (constraints.sweetness === 'NO_SUGAR' && /سكر|كراميل|شوكولاته|حلو/.test(text) && !/بدون سكر|من غير سكر/.test(text)) return false;
    if (constraints.caffeine === 'DECAF' && !/ديكاف|decaf/.test(text)) return false;
    if (constraints.category === 'coffee' && !this.isCoffee(product)) return false;
    if (constraints.category === 'dessert' && !this.isDessert(product)) return false;
    if (constraints.category === 'food' && !/برجر|ساندوتش|اكل|وجبه|food|burger|sandwich/.test(text)) return false;
    return true;
  }

  private constraintCompatibility(product: any, constraints: RecommendationConstraints): number {
    const count = Object.keys(constraints).length;
    if (!count) return this.timeRelevance(product, new Date());
    return this.clamp(0.72 + count * 0.05, 0.72, 0.98);
  }

  private customerPreferenceScore(
    candidate: InternalCandidate,
    memory: CustomerMemoryRecord | null,
    constraints: RecommendationConstraints,
  ): number {
    if (this.memoryLikesProduct(memory, candidate.productId)) return 0.98;
    if (candidate.type === 'SIZE_UPGRADE' && memory?.explicitPreferences.preferredSizes.default === candidate.variantName) return 0.95;
    if (constraints.temperature || constraints.category || constraints.sweetness || constraints.budget) {
      return this.constraintCompatibility(candidate._product, constraints);
    }
    return candidate._compatibility >= 0.9 ? 0.72 : 0.58;
  }

  private memoryLikesProduct(memory: CustomerMemoryRecord | null, productId: string): boolean {
    if (!memory) return false;
    if (memory.explicitPreferences.preferredProducts.includes(productId)) return true;
    const signal = memory.inferredPreferences.preferredProducts[productId];
    return Boolean(signal && signal.evidenceCount >= 5 && signal.confidence >= 0.8);
  }

  private conflictsWithDislikes(candidate: InternalCandidate, memory: CustomerMemoryRecord | null): boolean {
    if (!memory?.explicitPreferences.dislikedIngredients.length) return false;
    const text = this.normalize(`${candidate.productName} ${candidate.variantName || ''} ${candidate._product.description || ''}`);
    const aliases: Record<string, RegExp> = {
      cinnamon: /قرفه|cinnamon/,
      cream: /كريمه|cream/,
      nuts: /مكسرات|لوز|بندق|nuts|almond|hazelnut/,
      caramel: /كراميل|caramel/,
      chocolate: /شوكولاته|chocolate/,
    };
    return memory.explicitPreferences.dislikedIngredients.some((item) => aliases[item]?.test(text));
  }

  private priceSuitability(
    candidate: InternalCandidate,
    constraints: RecommendationConstraints,
    cart: RecommendationContext['cart'],
  ): number {
    if (constraints.budget !== undefined) return candidate.currentPrice <= constraints.budget ? 1 : 0;
    const cartTotal = cart.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
    if (candidate.estimatedAddedValue <= 0) return 0;
    const ratio = candidate.estimatedAddedValue / Math.max(cartTotal, 1);
    return this.clamp(1 - ratio, 0.25, 0.95);
  }

  private timeRelevance(product: any, now: Date): number {
    const hour = now.getHours();
    const text = this.normalize(`${product.name} ${product.category || ''}`);
    if (hour >= 5 && hour < 12 && /قهوه|فطار|كرواسون|ساندوتش/.test(text)) return 0.95;
    if (hour >= 12 && hour < 18 && /ساقع|ايس|حلو|برجر|ساندوتش/.test(text)) return 0.9;
    if ((hour >= 18 || hour < 2) && /سخن|قهوه|شاي|حلو|كيك/.test(text)) return 0.85;
    return 0.55;
  }

  private margin(product: any, price: number): number {
    if (!price) return 0;
    return this.clamp((price - Number(product.cost || 0)) / price, -1, 1);
  }

  private addOnMargin(addOn: any): number {
    const price = Number(addOn.price || 0);
    const cost = Number(addOn.inventory?.costPerUnit || 0) * Number(addOn.quantity || 0);
    return price ? this.clamp((price - cost) / price, -1, 1) : 0;
  }

  private addOnType(name: string): RecommendationType {
    const text = this.normalize(name);
    if (/شوت|shot/.test(text)) return 'EXTRA_SHOT';
    if (/لبن|milk/.test(text)) return 'MILK_UPGRADE';
    return 'ADD_ON';
  }

  private internalCandidate(input: {
    type: RecommendationType;
    product: any;
    variantId?: string;
    variantName?: string;
    baseProductId?: string;
    reason: string;
    currentPrice: number;
    discountedPrice?: number | null;
    estimatedAddedValue: number;
    compatibility: number;
    simplicity: number;
    offerValue: number;
    margin: number;
    bundleItems?: RecommendationCandidate['bundleItems'];
    metadata?: RecommendationCandidate['metadata'];
  }): InternalCandidate {
    const trackingKey = `${input.type}:${input.product.id}:${input.variantId || ''}`;
    return {
      type: input.type,
      productId: input.product.id,
      productName: input.product.name,
      category: input.product.category || 'general',
      variantId: input.variantId,
      variantName: input.variantName,
      baseProductId: input.baseProductId,
      reason: input.reason,
      currentPrice: this.money(input.currentPrice),
      discountedPrice: input.discountedPrice ?? null,
      estimatedAddedValue: this.money(input.estimatedAddedValue),
      customerRelevance: 0,
      businessRelevance: 0,
      confidence: 0,
      expiresAt: null,
      trackingKey,
      bundleItems: input.bundleItems,
      metadata: {
        ...input.metadata,
        compatibility: input.compatibility,
        lowStock: this.isLowStock(input.product),
      },
      _product: input.product,
      _compatibility: input.compatibility,
      _offerValue: input.offerValue,
      _simplicity: input.simplicity,
      _margin: input.margin,
    };
  }

  private publicCandidate(candidate: InternalCandidate): RecommendationCandidate {
    const { _product, _compatibility, _offerValue, _simplicity, _margin, ...result } = candidate;
    return result;
  }

  private isLowStock(product: any): boolean {
    if (product.isRefrigerated) return Number(product.refrigeratorStock || 0) <= Number(product.lowStockThreshold || 0);
    return (product.recipe || []).some((item: any) => {
      const available = Number(item.inventory?.currentQty || 0) - Number(item.inventory?.reservedQty || 0);
      return available <= Number(item.inventory?.minThreshold || 0);
    });
  }

  private isCoffee(product: any): boolean {
    return /قهوه|كافيه|لاتيه|اسبريسو|كابتشينو|coffee|latte|espresso|cappuccino/.test(
      this.normalize(`${product.name} ${product.category || ''}`),
    );
  }

  private isPastry(product: any): boolean {
    return /كرواسون|كوكيز|مخبوز|pastry|croissant|cookie/.test(this.normalize(`${product.name} ${product.category || ''}`));
  }

  private isDessert(product: any): boolean {
    return /حلو|حلويات|كيك|كوكيز|ديسرت|dessert|cake|cookie/.test(this.normalize(`${product.name} ${product.category || ''}`));
  }

  private needsClarification(constraints: RecommendationConstraints, catalog: any[]): boolean {
    return Object.keys(constraints).length > 0 && catalog.length > 0;
  }

  private hasUnsupportedSafetyConstraint(message: string): boolean {
    return /حساسيه|نباتي|فيجان|جلوتين|كيتو|دايت طبي/.test(this.normalize(message));
  }

  private normalize(value: string): string {
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

  private defaultRules(): OwnerRecommendationRules {
    return {
      enableUpselling: true,
      enableCrossSelling: true,
      enableComboSuggestions: false,
      enableOptOutMemory: true,
      maximumSuggestionsPerOrder: 2,
      maximumPriceIncrease: 100,
      minimumConfidence: 0.65,
      blockedProductIds: [],
      blockedCategories: [],
      allowedHours: [],
      allowedBranchIds: [],
      useProfitabilityWeight: true,
      useCustomerHistoryWeight: true,
      overloadedQueueThreshold: 10,
      relationships: [],
      comboOffers: [],
      weights: {
        customerPreference: 0.2,
        compatibility: 0.18,
        orderRelevance: 0.14,
        offerValue: 0.06,
        priceSuitability: 0.1,
        historicalAcceptance: 0.05,
        timeRelevance: 0.05,
        inventoryHealth: 0.06,
        marginContribution: 0.05,
        preparationSimplicity: 0.05,
        customerExperience: 0.06,
      },
      experimentsEnabled: false,
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private money(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  private ratio(numerator: number, denominator: number): number {
    return denominator ? Math.round((numerator / denominator) * 10000) / 10000 : 0;
  }
}

import { CustomerMemoryService } from '../customer-memory/customer-memory.service';
import { CustomerMemoryRecord } from '../customer-memory/customer-memory.types';
import { RecommendationService } from './recommendation.service';
import { RecommendationContext } from './recommendation.types';

describe('RecommendationService', () => {
  let service: RecommendationService;
  let products: any[];
  let memory: CustomerMemoryRecord | null;
  let prisma: any;

  const inventory = (qty = 100, min = 10) => ({
    branchId: 'branch-a',
    currentQty: qty,
    reservedQty: 0,
    minThreshold: min,
    costPerUnit: 1,
  });

  const session = () => ({
    commercialSuggestionsShown: 0,
    upsellShown: false,
    crossSellShown: false,
    rejectedCandidateKeys: [],
    shownCandidateKeys: [],
    optOut: false,
    complaint: false,
    frustrated: false,
    repeatedMisunderstanding: false,
    urgent: false,
    queueDepth: 0,
  });

  const context = (overrides: Partial<RecommendationContext> = {}): RecommendationContext => ({
    cafeId: 'cafe-a',
    branchId: 'branch-a',
    customerId: 'customer-a',
    memoryScope: {
      cafeId: 'cafe-a', customerId: 'customer-a', channel: 'TELEGRAM', channelIdentity: 'tg_100',
    },
    channel: 'TELEGRAM',
    mode: 'PROACTIVE',
    currentMessage: '',
    cart: [{ productId: 'coffee', quantity: 1, unitPrice: 60, variantId: 'small' }],
    session: session(),
    now: new Date('2026-07-13T09:00:00Z'),
    ...overrides,
  });

  const emptyMemory = (): CustomerMemoryRecord => ({
    version: 2,
    cafeId: 'cafe-a',
    customerId: 'customer-a',
    channel: 'TELEGRAM',
    channelIdentityHash: 'hash',
    preferredName: 'أحمد',
    conversationStyle: 'GUIDED',
    explicitPreferences: {
      preferredProducts: [],
      preferredSizes: {},
      preferredTemperature: {},
      preferredAddOns: [],
      dislikedIngredients: [],
      disableUpselling: false,
    },
    inferredPreferences: {
      preferredProducts: {},
      preferredSizes: {},
      preferredTemperature: {},
      preferredAddOns: {},
      rejectedAddOns: {},
      typicalOrderTimes: {},
    },
    processedOrderHashes: [],
    audit: [],
    lastUpdatedAt: new Date().toISOString(),
  });

  beforeEach(() => {
    products = [
      {
        id: 'coffee', cafeId: 'cafe-a', branchId: null, name: 'قهوة', category: 'coffee', description: 'قهوة ساخنة',
        price: 60, cost: 20, active: true, isRefrigerated: false, refrigeratorStock: 0, lowStockThreshold: 0,
        branchProducts: [{ branchId: 'branch-a', price: 60, isAvailable: true }],
        sizes: [
          { id: 'small', name: 'صغير', priceAdjust: 0, sortOrder: 0, active: true },
          { id: 'medium', name: 'وسط', priceAdjust: 10, sortOrder: 1, active: true },
          { id: 'large', name: 'كبير', priceAdjust: 25, sortOrder: 2, active: true },
        ],
        addOns: [{ id: 'shot', name: 'شوت إضافي', price: 12, quantity: 1, active: true, inventory: inventory() }],
        recipe: [{ quantity: 10, inventory: inventory() }],
      },
      {
        id: 'croissant', cafeId: 'cafe-a', branchId: null, name: 'كرواسون', category: 'pastry', description: 'مخبوزات',
        price: 35, cost: 14, active: true, isRefrigerated: false, branchProducts: [{ branchId: 'branch-a', price: 35, isAvailable: true }],
        sizes: [], addOns: [], recipe: [],
      },
      {
        id: 'iced', cafeId: 'cafe-a', branchId: null, name: 'آيس أمريكانو بدون سكر', category: 'coffee', description: 'ساقع وخفيف',
        price: 65, cost: 20, active: true, isRefrigerated: false, branchProducts: [{ branchId: 'branch-a', price: 65, isAvailable: true }],
        sizes: [], addOns: [], recipe: [],
      },
      {
        id: 'cake', cafeId: 'cafe-a', branchId: null, name: 'كيك شوكولاتة', category: 'dessert', description: 'حلو',
        price: 80, cost: 30, active: true, isRefrigerated: true, refrigeratorStock: 5, lowStockThreshold: 2,
        branchProducts: [{ branchId: 'branch-a', price: 80, isAvailable: true }], sizes: [], addOns: [], recipe: [],
      },
      {
        id: 'inactive', cafeId: 'cafe-a', branchId: null, name: 'منتج متوقف', category: 'pastry',
        price: 30, cost: 10, active: false, isRefrigerated: false,
        branchProducts: [{ branchId: 'branch-a', price: 30, isAvailable: true }], sizes: [], addOns: [], recipe: [],
      },
      {
        id: 'bad-price', cafeId: 'cafe-a', branchId: null, name: 'منتج بسعر خاطئ', category: 'pastry',
        price: 0, cost: 10, active: true, isRefrigerated: false,
        branchProducts: [{ branchId: 'branch-a', price: 0, isAvailable: true }], sizes: [], addOns: [], recipe: [],
      },
      {
        id: 'foreign', cafeId: 'cafe-b', branchId: null, name: 'منتج كافيه آخر', category: 'pastry',
        price: 20, cost: 5, active: true, isRefrigerated: false,
        branchProducts: [{ branchId: 'branch-a', price: 20, isAvailable: true }], sizes: [], addOns: [], recipe: [],
      },
    ];
    memory = emptyMemory();
    prisma = {
      product: {
        findMany: jest.fn(async ({ where }: any) => products.filter((product) => product.cafeId === where.cafeId)),
      },
      suggestion: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'suggestion-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const customerMemory = { getMemory: jest.fn(async () => memory) } as unknown as CustomerMemoryService;
    service = new RecommendationService(prisma, customerMemory);
    service.configureCafe('cafe-a', {
      relationships: [{
        primaryProductId: 'coffee',
        recommendedProductId: 'croissant',
        relationshipType: 'COMPLEMENTARY',
        priority: 10,
        enabled: true,
      }],
    });
  });

  describe('candidate safety', () => {
    it('never recommends a foreign-cafe product', async () => {
      const result = await service.recommend(context({ mode: 'CUSTOMER_REQUEST', currentMessage: 'اقترحلي حاجة' }));
      expect(result.recommendations.map((item) => item.productId)).not.toContain('foreign');
      expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { cafeId: 'cafe-a' } }));
    });

    it('never recommends inactive products', async () => {
      const result = await service.recommend(context({ mode: 'CUSTOMER_REQUEST', currentMessage: 'اقترحلي حاجة' }));
      expect(result.recommendations.map((item) => item.productId)).not.toContain('inactive');
    });

    it('never recommends branch-unavailable products', async () => {
      products.find((item) => item.id === 'croissant').branchProducts[0].isAvailable = false;
      const result = await service.recommend(context());
      expect(result.recommendations.map((item) => item.productId)).not.toContain('croissant');
    });

    it('rejects invalid real prices', async () => {
      const result = await service.recommend(context({ mode: 'CUSTOMER_REQUEST', currentMessage: 'اقترحلي حاجة' }));
      expect(result.recommendations.map((item) => item.productId)).not.toContain('bad-price');
    });

    it('respects product branch restrictions', async () => {
      products.find((item) => item.id === 'croissant').branchId = 'branch-b';
      const result = await service.recommend(context());
      expect(result.recommendations.map((item) => item.productId)).not.toContain('croissant');
    });

    it('excludes owner-blocked products and categories', async () => {
      service.configureCafe('cafe-a', { blockedProductIds: ['croissant'], blockedCategories: ['dessert'] });
      const result = await service.recommend(context({ mode: 'CUSTOMER_REQUEST', currentMessage: 'اقترحلي حاجة' }));
      expect(result.recommendations.map((item) => item.productId)).not.toEqual(expect.arrayContaining(['croissant', 'cake']));
    });

    it('filters products with unavailable recipe inventory', async () => {
      products.find((item) => item.id === 'coffee').recipe[0].inventory.currentQty = 0;
      const result = await service.recommend(context());
      expect(result.recommendations).toEqual([]);
    });
  });

  describe('upselling policy', () => {
    it('suggests the next valid size upgrade', async () => {
      const result = await service.recommend(context());
      expect(result.recommendations[0]).toMatchObject({ type: 'SIZE_UPGRADE', variantId: 'medium' });
    });

    it('calculates the size difference from real prices', async () => {
      const result = await service.recommend(context());
      expect(result.recommendations[0].currentPrice).toBe(70);
      expect(result.recommendations[0].estimatedAddedValue).toBe(10);
    });

    it('does not suggest a nonexistent next size', async () => {
      const result = await service.recommend(context({
        cart: [{ productId: 'coffee', quantity: 1, unitPrice: 85, variantId: 'large' }],
      }));
      expect(result.recommendations.find((item) => item.type === 'SIZE_UPGRADE')).toBeUndefined();
    });

    it('returns at most one proactive upsell', async () => {
      const result = await service.recommend(context());
      expect(result.recommendations).toHaveLength(1);
    });

    it('does not repeat a rejected candidate in the same order', async () => {
      const first = await service.recommend(context());
      const result = await service.recommend(context({
        session: { ...session(), rejectedCandidateKeys: [first.recommendations[0].trackingKey] },
      }));
      expect(result.recommendations.map((item) => item.trackingKey)).not.toContain(first.recommendations[0].trackingKey);
    });

    it('suppresses a suggestion repeatedly rejected in previous orders', async () => {
      prisma.suggestion.findMany.mockResolvedValueOnce([
        { status: 'rejected_current', predictedItems: { recommendation: { trackingKey: 'SIZE_UPGRADE:coffee:medium' } } },
        { status: 'rejected_current', predictedItems: { recommendation: { trackingKey: 'SIZE_UPGRADE:coffee:medium' } } },
      ]);
      const result = await service.recommend(context());
      expect(result.recommendations.map((item) => item.trackingKey)).not.toContain('SIZE_UPGRADE:coffee:medium');
    });

    it('disables upselling during a complaint', async () => {
      const result = await service.recommend(context({ session: { ...session(), complaint: true } }));
      expect(result.suppressedReason).toBe('COMPLAINT_STATE');
    });

    it('requires high confidence for FAST customers', async () => {
      memory!.conversationStyle = 'FAST';
      const result = await service.recommend(context());
      expect(result.recommendations).toEqual([]);
    });

    it('respects current and persistent customer opt-out', async () => {
      let result = await service.recommend(context({ session: { ...session(), optOut: true } }));
      expect(result.recommendations).toEqual([]);
      memory!.explicitPreferences.disableUpselling = true;
      result = await service.recommend(context());
      expect(result.recommendations).toEqual([]);
    });

    it('enforces owner maximum price increase', async () => {
      service.configureCafe('cafe-a', { maximumPriceIncrease: 5 });
      const result = await service.recommend(context());
      expect(result.recommendations.find((item) => item.type === 'SIZE_UPGRADE')).toBeUndefined();
    });

    it('enforces maximum commercial suggestions', async () => {
      service.configureCafe('cafe-a', { maximumSuggestionsPerOrder: 1 });
      const result = await service.recommend(context({ session: { ...session(), commercialSuggestionsShown: 1 } }));
      expect(result.suppressedReason).toBe('OWNER_SUGGESTION_LIMIT');
    });

    it('respects owner hours and allowed branches', async () => {
      service.configureCafe('cafe-a', { allowedHours: [12], allowedBranchIds: ['branch-b'] });
      const result = await service.recommend(context());
      expect(result.recommendations).toEqual([]);
      expect(result.suppressedReason).toMatch(/OUTSIDE_ALLOWED_HOURS|BRANCH_NOT_ALLOWED/);
    });
  });

  describe('cross-selling and combos', () => {
    it('allows an owner-approved coffee and pastry pairing', async () => {
      const result = await service.recommend(context({ session: { ...session(), upsellShown: true } }));
      expect(result.recommendations[0]).toMatchObject({ type: 'COMPLEMENTARY_PRODUCT', productId: 'croissant' });
    });

    it('does not generate an unrelated owner relationship target', async () => {
      service.configureCafe('cafe-a', { relationships: [] });
      const result = await service.recommend(context({
        cart: [{ productId: 'cake', quantity: 1, unitPrice: 80 }],
        session: { ...session(), upsellShown: true },
      }));
      expect(result.recommendations).toEqual([]);
    });

    it('does not repeat a cross-sell product already in the cart', async () => {
      const result = await service.recommend(context({
        cart: [
          { productId: 'coffee', quantity: 1, unitPrice: 60, variantId: 'small' },
          { productId: 'croissant', quantity: 1, unitPrice: 35 },
        ],
        session: { ...session(), upsellShown: true },
      }));
      expect(result.recommendations.map((item) => item.productId)).not.toContain('croissant');
    });

    it('calculates combo savings from current catalog prices', async () => {
      products.find((item) => item.id === 'coffee').sizes = [];
      products.find((item) => item.id === 'coffee').addOns = [];
      service.configureCafe('cafe-a', {
        enableComboSuggestions: true,
        comboOffers: [{ id: 'combo-1', productIds: ['coffee', 'croissant'], comboPrice: 80, enabled: true }],
      });
      const result = await service.recommend(context());
      const combo = result.recommendations.find((item) => item.type === 'COMBO_UPGRADE');
      expect(combo?.metadata?.regularBundlePrice).toBe(95);
      expect(combo?.discountedPrice).toBe(80);
    });

    it('does not claim savings for an invalid combo', async () => {
      service.configureCafe('cafe-a', {
        enableComboSuggestions: true,
        comboOffers: [{ id: 'combo-1', productIds: ['coffee', 'croissant'], comboPrice: 100, enabled: true }],
      });
      const result = await service.recommend(context());
      expect(result.recommendations.find((item) => item.type === 'COMBO_UPGRADE')).toBeUndefined();
    });

    it('respects cross-sell owner switch', async () => {
      service.configureCafe('cafe-a', { enableCrossSelling: false });
      const result = await service.recommend(context({ session: { ...session(), upsellShown: true } }));
      expect(result.recommendations.find((item) => item.type === 'COMPLEMENTARY_PRODUCT')).toBeUndefined();
    });
  });

  describe('personalization', () => {
    it('strong product preference improves ranking', async () => {
      memory!.inferredPreferences.preferredProducts.iced = {
        value: 'iced', confidence: 0.9, evidenceCount: 5,
        firstObservedAt: new Date().toISOString(), lastObservedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(), candidates: {},
      };
      const result = await service.recommend(context({ mode: 'CUSTOMER_REQUEST', currentMessage: 'اقترحلي حاجة ساقعة' }));
      expect(result.recommendations[0].productId).toBe('iced');
    });

    it('one past order does not dominate ranking', async () => {
      memory!.inferredPreferences.preferredProducts.cake = {
        value: 'cake', confidence: 0.2, evidenceCount: 1,
        firstObservedAt: new Date().toISOString(), lastObservedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(), candidates: {},
      };
      const result = await service.recommend(context({ mode: 'CUSTOMER_REQUEST', currentMessage: 'عايز حاجة ساقعة' }));
      expect(result.recommendations[0].productId).toBe('iced');
    });

    it('explicit dislike removes a candidate', async () => {
      memory!.explicitPreferences.dislikedIngredients = ['chocolate'];
      const result = await service.recommend(context({ mode: 'CUSTOMER_REQUEST', currentMessage: 'عايز حاجة حلوة' }));
      expect(result.recommendations.map((item) => item.productId)).not.toContain('cake');
    });

    it('current request overrides stored preference', async () => {
      memory!.explicitPreferences.preferredProducts = ['cake'];
      const result = await service.recommend(context({ mode: 'CUSTOMER_REQUEST', currentMessage: 'عايز حاجة ساقعة ومش مسكرة' }));
      expect(result.recommendations[0].productId).toBe('iced');
    });

    it('does not load cross-cafe memory when no scoped memory is supplied', async () => {
      const result = await service.recommend(context({ memoryScope: undefined }));
      expect(result.recommendations[0].reason).not.toBe('STRONG_CUSTOMER_PREFERENCE');
    });
  });

  describe('context, acceptance, and tracking', () => {
    it('recognizes no as rejection context without treating it as opt-out', () => {
      expect(service.isOptOutMessage('لا')).toBe(false);
    });

    it('recognizes explicit suggestion opt-out', () => {
      expect(service.isOptOutMessage('مش عايز اقتراحات')).toBe(true);
    });

    it('revalidates real price and availability before acceptance', async () => {
      const candidate = (await service.recommend(context())).recommendations[0];
      products.find((item) => item.id === 'coffee').branchProducts[0].price = 65;
      const refreshed = await service.revalidateForAcceptance(context(), candidate);
      expect(refreshed?.currentPrice).toBe(75);
      products.find((item) => item.id === 'coffee').active = false;
      expect(await service.revalidateForAcceptance(context(), candidate)).toBeNull();
    });

    it('tracks acceptance without changing a permanent preference', async () => {
      const candidate = (await service.recommend(context())).recommendations[0];
      const shown = await service.markShown(context(), candidate, 'اقتراح');
      await service.recordOutcome(context(), shown, true);
      expect(prisma.suggestion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'accepted' } }));
      expect(memory!.explicitPreferences.preferredProducts).toEqual([]);
    });

    it('tracks current-order rejection separately', async () => {
      const candidate = (await service.recommend(context())).recommendations[0];
      const shown = await service.markShown(context(), candidate, 'اقتراح');
      await service.recordOutcome(context(), shown, false, 'CURRENT_ORDER_ONLY');
      expect(prisma.suggestion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'rejected_current' } }));
    });

    it('never returns more than three recommendation choices', async () => {
      const result = await service.recommend(context({ mode: 'CUSTOMER_REQUEST', currentMessage: 'اقترحلي حاجة' }));
      expect(result.recommendations.length).toBeLessThanOrEqual(3);
    });

    it('uses deterministic tracking metrics without customer identifiers', async () => {
      const candidate = (await service.recommend(context())).recommendations[0];
      await service.markShown(context(), candidate, 'اقتراح');
      await service.recordOutcome(context(), candidate, true);
      service.recordOrderCompleted(60, 70, 5);
      const metrics = service.getMetricsSnapshot();
      expect(metrics.incrementalOrderValue).toBe(10);
      expect(JSON.stringify(metrics)).not.toContain('customer-a');
    });
  });

  describe('customer recommendation requests', () => {
    it('respects a stated budget', async () => {
      const result = await service.recommend(context({ mode: 'CUSTOMER_REQUEST', currentMessage: 'عايز حاجة أقل من 70 جنيه' }));
      expect(result.recommendations.every((item) => item.currentPrice <= 70)).toBe(true);
    });

    it('includes a supplied delivery fee in the budget limit', async () => {
      const result = await service.recommend(context({
        mode: 'CUSTOMER_REQUEST', currentMessage: 'معايا 70 جنيه', deliveryFee: 10,
      }));
      expect(result.recommendations.every((item) => item.currentPrice + 10 <= 70)).toBe(true);
    });

    it('returns the cheapest valid item first when requested', async () => {
      const result = await service.recommend(context({ mode: 'CUSTOMER_REQUEST', currentMessage: 'عايز الأرخص' }));
      expect(result.recommendations[0].productId).toBe('croissant');
    });

    it('respects cold temperature and no-sugar constraints', async () => {
      const result = await service.recommend(context({ mode: 'CUSTOMER_REQUEST', currentMessage: 'عايز حاجة ساقعة ومش مسكرة' }));
      expect(result.recommendations.map((item) => item.productId)).toEqual(['iced']);
    });

    it('does not dump the full menu', async () => {
      const result = await service.recommend(context({ mode: 'CUSTOMER_REQUEST', currentMessage: 'اقترحلي حاجة' }));
      const reply = service.formatRecommendations(result.recommendations);
      expect((reply.match(/^\d+\./gm) || []).length).toBeLessThanOrEqual(3);
      expect(reply).not.toContain('منتج متوقف');
    });

    it('offers same-category alternatives for unavailable favorites', async () => {
      products.find((item) => item.id === 'coffee').active = false;
      const result = await service.recommend(context({
        mode: 'UNAVAILABLE_ALTERNATIVE',
        unavailableProductId: 'coffee',
        cart: [],
      }));
      expect(result.recommendations.every((item) => item.type === 'AVAILABILITY_ALTERNATIVE')).toBe(true);
      expect(result.recommendations.map((item) => item.productId)).toContain('iced');
    });

    it('fails open without blocking the order', async () => {
      prisma.product.findMany.mockRejectedValueOnce(new Error('catalog unavailable'));
      const result = await service.recommend(context());
      expect(result.recommendations).toEqual([]);
      expect(result.suppressedReason).toBe('SAFE_PIPELINE_FAILURE');
    });

    it('asks a focused clarification for unsupported dietary constraints', async () => {
      const result = await service.recommend(context({ mode: 'CUSTOMER_REQUEST', currentMessage: 'اقترحلي حاجة نباتي' }));
      expect(result.recommendations).toEqual([]);
      expect(result.clarification).toContain('مش هافترض');
    });
  });
});

import { OrderFlowService, OrderFlowSession } from '../order-flow/order-flow.service';
import { RecommendationCandidate } from './recommendation.types';
import { ReplyEngineService } from '../reply-engine/reply-engine.service';

describe('OrderFlow Stage 3 recommendation integration', () => {
  let service: OrderFlowService;
  let recommendations: any;
  let customerMemory: any;
  let prisma: any;

  const crossSell: RecommendationCandidate = {
    type: 'COMPLEMENTARY_PRODUCT',
    productId: 'croissant',
    productName: 'كرواسون',
    category: 'pastry',
    reason: 'OWNER_APPROVED_PAIRING',
    currentPrice: 35,
    discountedPrice: null,
    estimatedAddedValue: 35,
    customerRelevance: 0.9,
    businessRelevance: 0.7,
    confidence: 0.85,
    expiresAt: null,
    trackingKey: 'COMPLEMENTARY_PRODUCT:croissant:',
    trackingId: 'suggestion-1',
  };

  const sizeUpgrade: RecommendationCandidate = {
    type: 'SIZE_UPGRADE',
    productId: 'coffee',
    productName: 'قهوة',
    category: 'coffee',
    variantId: 'medium',
    variantName: 'وسط',
    baseProductId: 'coffee',
    reason: 'LARGER_SIZE_AVAILABLE',
    currentPrice: 70,
    discountedPrice: null,
    estimatedAddedValue: 10,
    customerRelevance: 0.85,
    businessRelevance: 0.7,
    confidence: 0.82,
    expiresAt: null,
    trackingKey: 'SIZE_UPGRADE:coffee:medium',
    trackingId: 'suggestion-2',
  };

  const makeSession = (candidate: RecommendationCandidate): OrderFlowSession => ({
    phone: 'tg_100',
    step: 'RECOMMENDATION_PENDING',
    cafeId: 'cafe-a',
    branchId: 'branch-a',
    customerId: 'customer-a',
    customerName: 'أحمد',
    productId: 'coffee',
    productName: 'قهوة',
    productPrice: 60,
    quantity: 1,
    notes: [],
    selectedOptions: {},
    currentOptionIndex: 0,
    optionsCache: [],
    recommendationItems: [],
    pendingRecommendation: candidate,
    commercialSuggestionsShown: 1,
    upsellShown: candidate.type === 'SIZE_UPGRADE',
    crossSellShown: candidate.type === 'COMPLEMENTARY_PRODUCT',
    rejectedRecommendationKeys: [],
    shownRecommendationKeys: [candidate.trackingKey],
    messageCount: 1,
  });

  beforeEach(() => {
    prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'coffee', cafeId: 'cafe-a', name: 'قهوة', price: 60, active: true,
          sizes: [{ id: 'large', name: 'كبير', priceAdjust: 25, active: true }],
          branchProducts: [{ branchId: 'branch-a', price: 60, isAvailable: true }],
        }),
      },
    };
    recommendations = {
      isRecommendationRequest: jest.fn().mockReturnValue(false),
      isOptOutMessage: jest.fn((message: string) => message.includes('من غير اقتراحات')),
      isComplaintMessage: jest.fn().mockReturnValue(false),
      revalidateForAcceptance: jest.fn(async (_context: any, candidate: any) => candidate),
      recordOutcome: jest.fn().mockResolvedValue(undefined),
      recordOptOut: jest.fn(),
      recordComplaintAfterSuggestion: jest.fn(),
      recordAbandonment: jest.fn(),
      formatRecommendations: jest.fn((items: any[]) => `تحب تضيف ${items[0].productName}؟`),
    };
    customerMemory = {
      applyExplicitCommand: jest.fn().mockResolvedValue({ handled: false }),
    };
    const redis = {
      acquireOrderFlowLock: jest.fn().mockResolvedValue(true),
      releaseOrderFlowLock: jest.fn().mockResolvedValue(undefined),
      getOrderFlowSession: jest.fn().mockResolvedValue(null),
      setOrderFlowSession: jest.fn().mockResolvedValue(undefined),
      deleteOrderFlowSession: jest.fn().mockResolvedValue(undefined),
    };
    service = new OrderFlowService(
      prisma,
      {} as any,
      {} as any,
      redis as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      customerMemory as any,
      recommendations as any,
      new ReplyEngineService(),
    );
  });

  it('contextual no rejects the suggestion without cancelling the order', async () => {
    (service as any).sessions.set('tg_100', makeSession(crossSell));
    const reply = await service.handleMessage('tg_100', 'لا', 'cafe-a');
    const session = await service.getSession('tg_100');
    expect(reply).toContain('نكمل الطلب كده');
    expect(session?.step).toBe('SUMMARY');
    expect(session?.recommendationItems).toEqual([]);
    expect(recommendations.recordOutcome).toHaveBeenCalledWith(expect.anything(), crossSell, false, 'CURRENT_ORDER_ONLY');
  });

  it('acceptance adds the verified cross-sell and recalculates total deterministically', async () => {
    (service as any).sessions.set('tg_100', makeSession(crossSell));
    const reply = await service.handleMessage('tg_100', 'أيوه', 'cafe-a');
    const session = await service.getSession('tg_100');
    expect(session?.recommendationItems).toEqual([expect.objectContaining({ productId: 'croissant', unitPrice: 35 })]);
    expect(reply).toContain('95.00 ج');
    expect(session?.step).toBe('SUMMARY');
  });

  it('acceptance applies the verified size price and keeps final confirmation pending', async () => {
    (service as any).sessions.set('tg_100', makeSession(sizeUpgrade));
    const reply = await service.handleMessage('tg_100', 'نعم', 'cafe-a');
    const session = await service.getSession('tg_100');
    expect(session?.productPrice).toBe(70);
    expect(session?.selectedSizeName).toBe('وسط');
    expect(session?.step).toBe('SUMMARY');
    expect(reply).toContain('1️⃣ تأكيد الطلب');
  });

  it('customer opt-out ends commercial suggestions but preserves ordering assistance', async () => {
    (service as any).sessions.set('tg_100', makeSession(crossSell));
    const reply = await service.handleMessage('tg_100', 'من غير اقتراحات', 'cafe-a');
    const session = await service.getSession('tg_100');
    expect(session?.recommendationOptOut).toBe(true);
    expect(session?.step).toBe('SUMMARY');
    expect(reply).toContain('هكمل الطلب من غير اقتراحات');
    expect(recommendations.recordOptOut).toHaveBeenCalled();
  });

  it('rejects a cross-sell while applying the requested large size', async () => {
    (service as any).sessions.set('tg_100', makeSession(crossSell));
    const reply = await service.handleMessage('tg_100', 'لا، خليها كبيرة', 'cafe-a');
    const session = await service.getSession('tg_100');
    expect(session?.recommendationItems).toEqual([]);
    expect(session?.selectedSizeName).toBe('كبير');
    expect(session?.productPrice).toBe(85);
    expect(reply).toContain('85.00 ج');
  });

  it('does not create an order immediately after accepting a recommendation', async () => {
    prisma.order = { create: jest.fn() };
    (service as any).sessions.set('tg_100', makeSession(crossSell));
    await service.handleMessage('tg_100', 'أيوه', 'cafe-a');
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect((await service.getSession('tg_100'))?.step).toBe('SUMMARY');
  });
});

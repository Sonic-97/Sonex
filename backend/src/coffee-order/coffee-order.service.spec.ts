import { Test, TestingModule } from '@nestjs/testing';
import { CoffeeOrderService, CoffeeStep } from './coffee-order.service';
import { CoffeeAttributeExtractor } from './coffee-attribute-extractor';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { IdempotencyService } from '../common/idempotency.service';
import { CustomerLearningService } from '../customer-learning/customer-learning.service';
import { StructuredUnderstandingService } from '../ai-orchestration/structured-understanding.service';
import { CustomerMemoryService } from '../customer-memory/customer-memory.service';
import { RecommendationService } from '../recommendations/recommendation.service';
import { PersonalizationProfileService } from '../personalization/personalization-profile.service';
import { ReplyEngineService } from '../reply-engine/reply-engine.service';

describe('CoffeeOrderService', () => {
  let service: CoffeeOrderService;
  let prisma: any;

  const mockPrisma = {
    branch: {
      findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }),
    },
    customer: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 'cust-1', name: 'أحمد' }),
    },
    product: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'prod-1', name: 'قهوة', price: 18, category: 'مشروبات' },
      ]),
    },
    productCategory: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'cat-1', name: 'مشروبات', icon: '☕', active: true, products: [
          { id: 'prod-1', name: 'قهوة', price: 18, emoji: '☕' },
          { id: 'prod-2', name: 'شاي', price: 10, emoji: '🫖' },
        ]},
      ]),
    },
    staff: {
      findFirst: jest.fn().mockResolvedValue({ id: 'staff-1' }),
    },
    order: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'order-1',
        code: 'COF-20260711-0001',
        total: 18,
        customerId: 'cust-1',
        customer: { phone: 'tg_12345', name: 'أحمد' },
        items: [],
      }),
    },
    inCafeOrder: {
      create: jest.fn().mockResolvedValue({ id: 'ic-1' }),
    },
    $transaction: jest.fn((cb: any) => cb({
      customer: {
        upsert: jest.fn().mockResolvedValue({ id: 'cust-1', name: 'أحمد' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'cust-1', preferredProducts: {} }),
      },
      order: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'order-1',
          code: 'COF-20260711-0001',
          total: 18,
          customerId: 'cust-1',
          customer: { phone: 'tg_12345', name: 'أحمد' },
          items: [],
        }),
      },
      inCafeOrder: {
        create: jest.fn().mockResolvedValue({ id: 'ic-1' }),
      },
      staff: {
        findFirst: jest.fn().mockResolvedValue({ id: 'staff-1' }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    })),
  };

  const mockEvents = {
    broadcast: jest.fn(),
    emitToBarista: jest.fn(),
  };

  const mockIdempotency = {
    isProcessed: jest.fn().mockResolvedValue({ duplicated: false }),
    record: jest.fn(),
  };

  const mockLearning = {
    learn: jest.fn().mockResolvedValue(undefined),
  };

  const mockMemory = {
    isLikelyName: jest.fn((name: string) => /^[\p{L}' -]{2,40}$/u.test(name) && !name.includes('قهوة')),
    applyExplicitCommand: jest.fn().mockResolvedValue({ handled: false }),
    savePreferredName: jest.fn().mockResolvedValue(true),
    resolveCoffeePreferences: jest.fn(async (_scope: any, draft: any) => ({
      draft,
      memoryFields: [],
      sources: {},
      requiresConfirmation: false,
    })),
    observeOrder: jest.fn().mockResolvedValue(true),
    recordMemoryRejection: jest.fn(),
    recordOrderCompleted: jest.fn(),
  };

  const mockRecommendations = {
    isOptOutMessage: jest.fn().mockReturnValue(false),
    isComplaintMessage: jest.fn().mockReturnValue(false),
    recommend: jest.fn().mockResolvedValue({ recommendations: [], latencyMs: 0 }),
    formatRecommendations: jest.fn().mockReturnValue('اقتراح'),
    markShown: jest.fn(async (_context: any, candidate: any) => candidate),
    revalidateForAcceptance: jest.fn(async (_context: any, candidate: any) => candidate),
    recordOutcome: jest.fn().mockResolvedValue(undefined),
    recordOptOut: jest.fn(),
    recordComplaintAfterSuggestion: jest.fn(),
    recordOrderCompleted: jest.fn(),
  };

  const mockPersonalization = {
    getProfile: jest.fn().mockResolvedValue({
      level: 0,
      conversationStyle: 'GUIDED',
      personalizationOptOut: false,
      usualOrder: null,
      customerName: '',
    }),
    isUsualOrderMessage: jest.fn().mockReturnValue(false),
    isOptOutMessage: jest.fn().mockReturnValue(false),
    isOptInMessage: jest.fn().mockReturnValue(false),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoffeeOrderService,
        CoffeeAttributeExtractor,
        StructuredUnderstandingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsService, useValue: mockEvents },
        { provide: IdempotencyService, useValue: mockIdempotency },
        { provide: CustomerLearningService, useValue: mockLearning },
        { provide: CustomerMemoryService, useValue: mockMemory },
        { provide: RecommendationService, useValue: mockRecommendations },
        { provide: PersonalizationProfileService, useValue: mockPersonalization },
        ReplyEngineService,
      ],
    }).compile();

    service = module.get<CoffeeOrderService>(CoffeeOrderService);
  });

  // ── Customer name flow ────────────────────────────────

  describe('Customer name flow', () => {
    test('new customer without name is asked for name', async () => {
      const reply = await service.startCoffeeFlow('tg_12345', 'cafe-1');
      expect(reply).toContain('ممكن أعرف اسمك؟');
    });

    test('known customer is not asked for name', async () => {
      mockPrisma.customer.findUnique.mockResolvedValueOnce({
        id: 'cust-1',
        name: 'أحمد',
      });
      const reply = await service.startCoffeeFlow('tg_12345', 'cafe-1', undefined, 'أحمد');
      expect(reply).toContain('أحمد');
      expect(reply).toContain('تحب تشرب إيه؟');
    });

    test('name is saved and not treated as order', async () => {
      await service.startCoffeeFlow('tg_12345', 'cafe-1');
      const reply = await service.handleMessage('tg_12345', 'أحمد');
      expect(reply).toContain('تشرفنا');
      expect(reply).toContain('أحمد');
    });

    test('known customer greeted properly on return', async () => {
      const session = {
        phone: 'tg_12345',
        cafeId: 'cafe-1',
        branchId: 'branch-1',
        customerName: 'أحمد',
        step: CoffeeStep.AWAITING_ORDER,
        quantity: 1,
        notes: [],
      };
      // Set existing session
      (service as any).sessions.set('tg_12345', session);

      const reply = await service.handleMessage('tg_12345', 'عايز قهوة');
      expect(reply).toContain('فاتح');
    });
  });

  // ── Coffee extraction ─────────────────────────────────

  describe('Coffee extraction flow', () => {
    beforeEach(async () => {
      await service.startCoffeeFlow('tg_99999', 'cafe-1');
      await service.handleMessage('tg_99999', 'أحمد');
    });

    test('"قهوة" asks for roast', async () => {
      const reply = await service.handleMessage('tg_99999', 'قهوة');
      expect(reply).toMatch(/فاتح|وسط|غامق/);
      expect(reply).not.toContain('المنيو');
    });

    test('"قهوة فاتح" asks for blend', async () => {
      const reply = await service.handleMessage('tg_99999', 'قهوة فاتح');
      expect(reply).toContain('محوج');
    });

    test('"قهوة فاتح سادة" asks for sugar', async () => {
      const reply = await service.handleMessage('tg_99999', 'قهوة فاتح سادة');
      expect(reply).toContain('السكر');
    });

    test('"قهوة فاتح زيادة" asks for blend', async () => {
      const reply = await service.handleMessage('tg_99999', 'قهوة فاتح زيادة');
      expect(reply).toContain('محوج');
    });

    test('"قهوة فاتح سادة زيادة" goes to confirmation', async () => {
      const reply = await service.handleMessage('tg_99999', 'قهوة فاتح سادة زيادة');
      expect(reply).toMatch(/أأكد|أثبت|نطلبه|نأكد/);
    });

    test('"قهوة غامق محوج مظبوط" goes to confirmation', async () => {
      const reply = await service.handleMessage('tg_99999', 'قهوة غامق محوج مظبوط');
      expect(reply).toMatch(/أأكد|أثبت|نطلبه|نأكد/);
    });

    test('existing supplied attributes not asked again', async () => {
      // Step 1: قهوة فاتح
      let reply = await service.handleMessage('tg_99999', 'قهوة فاتح');
      expect(reply).toContain('محوج');

      // Step 2: say سادة
      reply = await service.handleMessage('tg_99999', 'سادة');
      expect(reply).toContain('السكر');
      expect(reply).not.toContain('فاتح');
      expect(reply).not.toContain('محوج');
    });
  });

  // ── Contextual "لا" ───────────────────────────────────

  describe('Contextual "لا" handling', () => {
    test('"لا" after sugar question means no sugar', async () => {
      await service.startCoffeeFlow('tg_55555', 'cafe-1');
      await service.handleMessage('tg_55555', 'أحمد');
      await service.handleMessage('tg_55555', 'قهوة فاتح');
      await service.handleMessage('tg_55555', 'سادة');
      // Now at sugar question
      const reply = await service.handleMessage('tg_55555', 'لا');
      expect(reply).toMatch(/أأكد|أثبت|نطلبه|نأكد/);
    });

    test('"لا" after blend question means plain', async () => {
      await service.startCoffeeFlow('tg_66666', 'cafe-1');
      await service.handleMessage('tg_66666', 'أحمد');
      await service.handleMessage('tg_66666', 'قهوة فاتح');
      // At blend question, say لا
      const reply = await service.handleMessage('tg_66666', 'لا');
      expect(reply).toContain('السكر');
    });

    test('"لا" after confirmation moves to modification', async () => {
      await service.startCoffeeFlow('tg_77777', 'cafe-1');
      await service.handleMessage('tg_77777', 'أحمد');
      await service.handleMessage('tg_77777', 'قهوة فاتح سادة زيادة');
      const reply = await service.handleMessage('tg_77777', 'لا');
      expect(reply).toContain('تعدل');
    });

    test('explicit "الغي الطلب" cancels', async () => {
      await service.startCoffeeFlow('tg_88888', 'cafe-1');
      await service.handleMessage('tg_88888', 'أحمد');
      await service.handleMessage('tg_88888', 'قهوة فاتح');
      const reply = await service.handleMessage('tg_88888', 'الغي الطلب');
      expect(reply).toContain('ألغي');
    });
  });

  // ── Menu behavior ─────────────────────────────────────

  describe('Menu behavior', () => {
    test('"عايز قهوة" does not show full menu', async () => {
      await service.startCoffeeFlow('tg_11111', 'cafe-1');
      await service.handleMessage('tg_11111', 'أحمد');
      const reply = await service.handleMessage('tg_11111', 'عايز قهوة');
      expect(reply).toMatch(/فاتح|وسط|غامق/);
      expect(reply).not.toContain('المنيو');
    });

    test('"وريني المنيو" shows the menu', async () => {
      await service.startCoffeeFlow('tg_22222', 'cafe-1');
      await service.handleMessage('tg_22222', 'أحمد');
      const reply = await service.handleMessage('tg_22222', 'وريني المنيو');
      expect(reply).toContain('المنيو');
    });

    test('non-coffee request shows menu', async () => {
      await service.startCoffeeFlow('tg_33333', 'cafe-1');
      await service.handleMessage('tg_33333', 'أحمد');
      const reply = await service.handleMessage('tg_33333', 'عايز شاي');
      expect(reply).toContain('المنيو');
    });
  });

  // ── Natural replies ───────────────────────────────────

  describe('Natural replies', () => {
    test('no reply contains "مرحبًا أيها العميل"', async () => {
      const reply = await service.startCoffeeFlow('tg_44444', 'cafe-1');
      expect(reply).not.toContain('مرحبًا أيها العميل');
    });

    test('no reply contains internal state terminology', async () => {
      await service.startCoffeeFlow('tg_44444', 'cafe-1');
      await service.handleMessage('tg_44444', 'أحمد');
      const reply = await service.handleMessage('tg_44444', 'قهوة فاتح سادة زيادة');
      expect(reply).not.toMatch(/AWAITING|INTENT|COFFEE_|state|step/i);
    });

    test('every collection step asks only one question', async () => {
      await service.startCoffeeFlow('tg_44444', 'cafe-1');
      await service.handleMessage('tg_44444', 'أحمد');
      const reply1 = await service.handleMessage('tg_44444', 'قهوة');
      const questionMarks = (reply1.match(/\?/g) || []).length;
      expect(questionMarks).toBeLessThanOrEqual(1);
    });
  });

  // ── Order confirmation ────────────────────────────────

  describe('Order confirmation', () => {
    test('confirms with "نعم"', async () => {
      await service.startCoffeeFlow('tg_10101', 'cafe-1');
      await service.handleMessage('tg_10101', 'أحمد');
      await service.handleMessage('tg_10101', 'قهوة فاتح سادة زيادة');
      const reply = await service.handleMessage('tg_10101', 'نعم');
      expect(reply).toContain('اتأكد');
      expect(reply).toContain('رقم الطلب');
    });

    test('confirms with "1"', async () => {
      await service.startCoffeeFlow('tg_10102', 'cafe-1');
      await service.handleMessage('tg_10102', 'أحمد');
      await service.handleMessage('tg_10102', 'قهوة فاتح سادة زيادة');
      const reply = await service.handleMessage('tg_10102', '1');
      expect(reply).toContain('اتأكد');
      expect(reply).toContain('رقم الطلب');
    });
  });

  // ── Modification ──────────────────────────────────────

  describe('Modification', () => {
    test('customer modifies roast after seeing summary', async () => {
      await service.startCoffeeFlow('tg_12121', 'cafe-1');
      await service.handleMessage('tg_12121', 'أحمد');
      await service.handleMessage('tg_12121', 'قهوة فاتح سادة زيادة');
      // Say لا to go to modification
      await service.handleMessage('tg_12121', 'لا');
      const reply = await service.handleMessage('tg_12121', 'خليها غامق');
      expect(reply).toContain('غامق');
      expect(reply).toMatch(/أأكد|أثبت|نطلبه|نأكد/);
    });
  });

  describe('Stage 2 memory assistance', () => {
    test('strong stored preferences reduce questions but remain visible before confirmation', async () => {
      mockPrisma.customer.findUnique.mockResolvedValueOnce({ id: 'cust-1', name: 'أحمد' });
      mockMemory.resolveCoffeePreferences.mockResolvedValueOnce({
        draft: { roast: 'LIGHT', blend: 'PLAIN', sugar: 'NO_SUGAR' },
        memoryFields: ['roast', 'blend', 'sugar'],
        sources: { roast: 'INFERRED', blend: 'INFERRED', sugar: 'EXPLICIT' },
        requiresConfirmation: true,
      });
      await service.startCoffeeFlow('tg_memory', 'cafe-1', undefined, 'أحمد');
      const reply = await service.handleMessage('tg_memory', 'قهوة');
      expect(reply).toContain('تفضيلاتك المحفوظة');
      expect(reply).toMatch(/أأكد|أثبت|نطلبه|نأكد/);
      expect(reply).toContain('من غير سكر');
    });

    test('current order wording overrides remembered sugar', async () => {
      mockPrisma.customer.findUnique.mockResolvedValueOnce({ id: 'cust-1', name: 'أحمد' });
      mockMemory.resolveCoffeePreferences.mockImplementationOnce(async (_scope: any, draft: any) => ({
        draft: { roast: 'LIGHT', blend: 'PLAIN', sugar: draft.sugar },
        memoryFields: ['roast', 'blend'],
        sources: { roast: 'INFERRED', blend: 'INFERRED', sugar: 'CURRENT' },
        requiresConfirmation: true,
      }));
      await service.startCoffeeFlow('tg_current', 'cafe-1', undefined, 'أحمد');
      const reply = await service.handleMessage('tg_current', 'قهوة من غير سكر');
      expect(reply).toContain('من غير سكر');
    });

    test('no rejects the memory proposal without cancelling the order', async () => {
      mockPrisma.customer.findUnique.mockResolvedValueOnce({ id: 'cust-1', name: 'أحمد' });
      mockMemory.resolveCoffeePreferences.mockResolvedValueOnce({
        draft: { roast: 'LIGHT', blend: 'PLAIN', sugar: 'NO_SUGAR' },
        memoryFields: ['roast', 'blend', 'sugar'],
        sources: {},
        requiresConfirmation: true,
      });
      await service.startCoffeeFlow('tg_reject', 'cafe-1', undefined, 'أحمد');
      await service.handleMessage('tg_reject', 'قهوة');
      const reply = await service.handleMessage('tg_reject', 'لا');
      expect(reply).toContain('تعدل');
      expect(await service.hasSession('tg_reject')).toBe(true);
      expect(mockMemory.recordMemoryRejection).toHaveBeenCalled();
    });
  });

  describe('Stage 3 recommendation handling', () => {
    const sizeRecommendation = {
      type: 'SIZE_UPGRADE', productId: 'prod-1', productName: 'قهوة', category: 'مشروبات',
      variantId: 'medium', variantName: 'وسط', baseProductId: 'prod-1', reason: 'LARGER_SIZE_AVAILABLE',
      currentPrice: 28, discountedPrice: null, estimatedAddedValue: 10,
      customerRelevance: 0.8, businessRelevance: 0.7, confidence: 0.82,
      expiresAt: null, trackingKey: 'SIZE_UPGRADE:prod-1:medium',
    };

    test('a coffee recommendation is shown at most once before confirmation', async () => {
      mockPrisma.customer.findUnique.mockResolvedValueOnce({ id: 'cust-1', name: 'أحمد' });
      mockRecommendations.recommend.mockResolvedValueOnce({ recommendations: [sizeRecommendation], latencyMs: 1 });
      mockRecommendations.formatRecommendations.mockReturnValueOnce('تحب تخليها وسط بفرق 10 جنيه؟');
      await service.startCoffeeFlow('tg_stage3_show', 'cafe-1', undefined, 'أحمد');
      const reply = await service.handleMessage('tg_stage3_show', 'قهوة فاتح سادة زيادة');
      expect(reply).toContain('وسط');
      expect((await service.getSession('tg_stage3_show'))?.step).toBe(CoffeeStep.AWAITING_RECOMMENDATION);
    });

    test('no rejects the coffee upsell without cancelling the order', async () => {
      mockPrisma.customer.findUnique.mockResolvedValueOnce({ id: 'cust-1', name: 'أحمد' });
      mockRecommendations.recommend.mockResolvedValueOnce({ recommendations: [sizeRecommendation], latencyMs: 1 });
      await service.startCoffeeFlow('tg_stage3_no', 'cafe-1', undefined, 'أحمد');
      await service.handleMessage('tg_stage3_no', 'قهوة فاتح سادة زيادة');
      const reply = await service.handleMessage('tg_stage3_no', 'لا');
      expect(reply).toMatch(/أأكد|أثبت|نطلبه|نأكد/);
      expect(await service.hasSession('tg_stage3_no')).toBe(true);
      expect(mockRecommendations.recordOutcome).toHaveBeenCalledWith(
        expect.anything(), expect.objectContaining({ type: 'SIZE_UPGRADE' }), false, 'CURRENT_ORDER_ONLY',
      );
    });

    test('accepted coffee upsell updates total and still requires final confirmation', async () => {
      mockPrisma.customer.findUnique.mockResolvedValueOnce({ id: 'cust-1', name: 'أحمد' });
      mockRecommendations.recommend.mockResolvedValueOnce({ recommendations: [sizeRecommendation], latencyMs: 1 });
      await service.startCoffeeFlow('tg_stage3_yes', 'cafe-1', undefined, 'أحمد');
      await service.handleMessage('tg_stage3_yes', 'قهوة فاتح سادة زيادة');
      const reply = await service.handleMessage('tg_stage3_yes', 'أيوه');
      expect(reply).toContain('28.00 ج');
      expect(reply).toMatch(/أأكد|أثبت|نطلبه|نأكد/);
      expect((await service.getSession('tg_stage3_yes'))?.step).toBe(CoffeeStep.AWAITING_CONFIRMATION);
    });
  });
});

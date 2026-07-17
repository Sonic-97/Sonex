import { Test, TestingModule } from '@nestjs/testing';
import { PersonalizationProfileService } from './personalization-profile.service';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerMemoryService } from '../customer-memory/customer-memory.service';

describe('PersonalizationProfileService', () => {
  let service: PersonalizationProfileService;
  let mockPrisma: any;
  let mockMemory: any;

  beforeEach(async () => {
    mockPrisma = {
      customer: { findFirst: jest.fn() },
      customerHabit: { findUnique: jest.fn() },
      order: { findMany: jest.fn() },
    };
    mockMemory = {
      getMemory: jest.fn(),
      buildRepeatOrderPreview: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonalizationProfileService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CustomerMemoryService, useValue: mockMemory },
      ],
    }).compile();

    service = module.get<PersonalizationProfileService>(PersonalizationProfileService);
  });

  describe('isUsualOrderMessage', () => {
    const cases: [string, boolean][] = [
      ['المعتاد', true],
      ['هات المعتاد', true],
      ['زي كل مرة', true],
      ['نفس بتاعة الصبح', true],
      ['كرر الطلب', true],
      ['واحده كمان', true],
      ['هات كمان', true],
      ['عايز قهوة', false],
      ['فاتح', false],
    ];
    test.each(cases)('"%s" → %s', async (msg, expected) => {
      expect(await service.isUsualOrderMessage(msg)).toBe(expected);
    });
  });

  describe('isOptOutMessage', () => {
    const cases: [string, boolean][] = [
      ['متفتكرش طلباتي', true],
      ['امسح تفضيلاتي', true],
      ['متقترحليش حاجات', true],
      ['متستخدمش طلبي القديم', true],
      ['خليني أطلب من الأول', true],
      ['المعتاد', false],
      ['عايز قهوة', false],
    ];
    test.each(cases)('"%s" → %s', async (msg, expected) => {
      expect(await service.isOptOutMessage(msg)).toBe(expected);
    });
  });

  describe('isOptInMessage', () => {
    const cases: [string, boolean][] = [
      ['افتكر تاني', true],
      ['رجّع التفضيلات', true],
      ['عايز الاقتراحات', true],
      ['كمل تذكر', true],
      ['المعتاد', false],
      ['امسح تفضيلاتي', false],
    ];
    test.each(cases)('"%s" → %s', async (msg, expected) => {
      expect(await service.isOptInMessage(msg)).toBe(expected);
    });
  });

  describe('getProfile — level computation', () => {
    test('Level 0 — new customer, no orders', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue({
        id: 'c1', cafeId: 'cafe1', name: 'أحمد',
        totalOrders: 0, totalSpent: 0, lastOrderDate: null, preferredProducts: null,
      });
      mockPrisma.customerHabit.findUnique.mockResolvedValue(null);
      mockMemory.getMemory.mockResolvedValue(null);
      mockPrisma.order.findMany.mockResolvedValue([]);

      const profile = await service.getProfile('cafe1', 'c1', 'tg_123');
      expect(profile.level).toBe(0);
      expect(profile.hasStrongEvidence).toBe(false);
    });

    test('Level 1 — recognized customer with 1 order', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue({
        id: 'c1', cafeId: 'cafe1', name: 'محمد',
        totalOrders: 1, totalSpent: 50, lastOrderDate: new Date(), preferredProducts: null,
      });
      mockPrisma.customerHabit.findUnique.mockResolvedValue(null);
      mockMemory.getMemory.mockResolvedValue({
        version: 2, cafeId: 'cafe1', customerId: 'c1', channel: 'TELEGRAM',
        channelIdentityHash: 'hash', explicitPreferences: {
          preferredProducts: [], preferredSizes: {}, preferredTemperature: {},
          coffeeRoast: 'LIGHT', coffeeBlend: 'PLAIN', sugarPreference: 'MEDIUM_SUGAR',
          preferredAddOns: [], dislikedIngredients: [], disableUpselling: false,
        }, inferredPreferences: {
          preferredProducts: {}, preferredSizes: {}, preferredTemperature: {},
          preferredAddOns: {}, rejectedAddOns: {}, typicalOrderTimes: {},
        },
        processedOrderHashes: [], audit: [], lastUpdatedAt: new Date().toISOString(),
      });
      mockPrisma.order.findMany.mockResolvedValue([{ total: 50 }]);

      const profile = await service.getProfile('cafe1', 'c1', 'tg_123');
      expect(profile.level).toBe(1);
      expect(profile.orderingProfile.totalOrders).toBe(1);
    });

    test('Level 2 — repeat customer with 5+ orders and known preferences', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue({
        id: 'c2', cafeId: 'cafe1', name: 'منى',
        totalOrders: 6, totalSpent: 300, lastOrderDate: new Date(), preferredProducts: { __sonexMemoryV2: { version: 2, channels: {} } },
      });
      mockPrisma.customerHabit.findUnique.mockResolvedValue({
        customerId: 'c2', frequencyPattern: 'daily', peakOrderHour: 10, usualTime: '10:00',
        patternConsistency: 0.9, overallConfidence: 0.85,
      });
      mockMemory.getMemory.mockResolvedValue({
        version: 2, cafeId: 'cafe1', customerId: 'c2', channel: 'TELEGRAM',
        channelIdentityHash: 'hash', explicitPreferences: {
          preferredProducts: ['coffee-1'], preferredSizes: {}, preferredTemperature: {},
          coffeeRoast: 'DARK', coffeeBlend: 'SPICED', sugarPreference: 'EXTRA_SUGAR',
          preferredAddOns: [], dislikedIngredients: [], disableUpselling: false,
        }, inferredPreferences: {
          preferredProducts: {}, preferredSizes: {}, preferredTemperature: {},
          preferredAddOns: {}, rejectedAddOns: {}, typicalOrderTimes: {},
        },
        processedOrderHashes: [], audit: [], lastUpdatedAt: new Date().toISOString(),
      });
      mockMemory.buildRepeatOrderPreview.mockResolvedValue({
        sourceOrderId: 'order1', branchId: 'b1', items: [
          { productId: 'p1', productName: 'قهوة', quantity: 1, previousUnitPrice: 25, currentUnitPrice: 25, priceChanged: false, available: true, notes: 'غامق' },
        ], currentTotal: 25, unavailableItems: [], priceChanged: false, requiresConfirmation: true, canConfirmAll: true,
      });
      mockPrisma.order.findMany.mockResolvedValue([
        { total: 50 }, { total: 60 }, { total: 45 }, { total: 55 }, { total: 40 }, { total: 50 },
      ]);

      const profile = await service.getProfile('cafe1', 'c2', 'tg_456');
      expect(profile.level).toBe(2);
      expect(profile.coffeePreferences.roast).toBe('DARK');
      expect(profile.coffeePreferences.roastConfidence).toBe('EXPLICIT');
      expect(profile.coffeePreferences.blendConfidence).toBe('EXPLICIT');
      expect(profile.orderingProfile.morningCustomer).toBe(true);
    });

    test('Level 3 — highly familiar, 10+ orders, morning pattern, strong preferences', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue({
        id: 'c3', cafeId: 'cafe1', name: 'أحمد',
        totalOrders: 12, totalSpent: 500, lastOrderDate: new Date(), preferredProducts: {},
      });
      mockPrisma.customerHabit.findUnique.mockResolvedValue({
        customerId: 'c3', frequencyPattern: 'daily', peakOrderHour: 8, usualTime: '08:30',
        patternConsistency: 0.95, overallConfidence: 0.9,
      });
      mockMemory.getMemory.mockResolvedValue({
        version: 2, cafeId: 'cafe1', customerId: 'c3', channel: 'TELEGRAM',
        channelIdentityHash: 'hash', explicitPreferences: {
          preferredProducts: ['coffee-1'], preferredSizes: {}, preferredTemperature: {},
          coffeeRoast: 'LIGHT', coffeeBlend: 'PLAIN', sugarPreference: 'EXTRA_SUGAR',
          preferredAddOns: [], dislikedIngredients: [], disableUpselling: false,
        }, inferredPreferences: {
          preferredProducts: {}, preferredSizes: {}, preferredTemperature: {},
          preferredAddOns: {}, rejectedAddOns: {}, typicalOrderTimes: {},
        },
        processedOrderHashes: [], audit: [], lastUpdatedAt: new Date().toISOString(),
      });
      mockMemory.buildRepeatOrderPreview.mockResolvedValue({
        sourceOrderId: 'order2', branchId: 'b1', items: [
          { productId: 'p1', productName: 'قهوة', quantity: 1, previousUnitPrice: 30, currentUnitPrice: 30, priceChanged: false, available: true, notes: 'فاتح' },
        ], currentTotal: 30, unavailableItems: [], priceChanged: false, requiresConfirmation: true, canConfirmAll: true,
      });
      mockPrisma.order.findMany.mockResolvedValue(new Array(12).fill({ total: 40 }));

      const profile = await service.getProfile('cafe1', 'c3', 'tg_789');
      expect(profile.level).toBe(3);
      expect(profile.orderingProfile.morningCustomer).toBe(true);
      expect(profile.hasStrongEvidence).toBe(true);
    });
  });

  describe('customer identity isolation', () => {
    test('same shop, two different customers remain separate', async () => {
      mockPrisma.customer.findFirst
        .mockResolvedValueOnce({ id: 'c1', cafeId: 'cafe1', name: 'أحمد', totalOrders: 3, totalSpent: 150, lastOrderDate: new Date(), preferredProducts: null })
        .mockResolvedValueOnce({ id: 'c2', cafeId: 'cafe1', name: 'محمود', totalOrders: 5, totalSpent: 200, lastOrderDate: new Date(), preferredProducts: null });
      mockPrisma.customerHabit.findUnique.mockResolvedValue(null);
      mockMemory.getMemory.mockResolvedValue(null);
      mockPrisma.order.findMany.mockResolvedValue([]);

      const p1 = await service.getProfile('cafe1', 'c1', 'tg_111');
      const p2 = await service.getProfile('cafe1', 'c2', 'tg_222');

      expect(p1.customerId).toBe('c1');
      expect(p2.customerId).toBe('c2');
      expect(p1.phone).toBe('tg_111');
      expect(p2.phone).toBe('tg_222');
      expect(p1.preferredName).toBe('أحمد');
      expect(p2.preferredName).toBe('محمود');
    });
  });

  describe('usable order — usual order retrieval', () => {
    test('retrieves usual order when available', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue({
        id: 'c1', cafeId: 'cafe1', name: 'أحمد',
        totalOrders: 5, totalSpent: 200, lastOrderDate: new Date(), preferredProducts: {},
      });
      mockPrisma.customerHabit.findUnique.mockResolvedValue({ customerId: 'c1', peakOrderHour: 10, usualTime: '10:00' });
      mockMemory.getMemory.mockResolvedValue({
        version: 2, cafeId: 'cafe1', customerId: 'c1', channel: 'TELEGRAM',
        channelIdentityHash: 'hash',
        explicitPreferences: { preferredProducts: [], preferredSizes: {}, preferredTemperature: {}, coffeeRoast: 'LIGHT', coffeeBlend: 'PLAIN', sugarPreference: 'MEDIUM', preferredAddOns: [], dislikedIngredients: [], disableUpselling: false },
        inferredPreferences: { preferredProducts: {}, preferredSizes: {}, preferredTemperature: {}, preferredAddOns: {}, rejectedAddOns: {}, typicalOrderTimes: {} },
        processedOrderHashes: [], audit: [], lastUpdatedAt: new Date().toISOString(),
      });
      mockMemory.buildRepeatOrderPreview.mockResolvedValue({
        sourceOrderId: 'order-1', branchId: 'b1', items: [
          { productId: 'p1', productName: 'قهوة', quantity: 1, previousUnitPrice: 25, currentUnitPrice: 25, priceChanged: false, available: true, notes: 'فاتح | غير محوج | سكر زيادة' },
        ], currentTotal: 25, unavailableItems: [], priceChanged: false, requiresConfirmation: true, canConfirmAll: true,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ total: 25 }, { total: 30 }, { total: 20 }, { total: 25 }, { total: 30 }]);

      const profile = await service.getProfile('cafe1', 'c1', 'tg_111');
      expect(profile.orderingProfile.usualOrder).toBeDefined();
      expect(profile.orderingProfile.usualOrder!.items.length).toBe(1);
      expect(profile.orderingProfile.usualOrder!.items[0].productName).toBe('قهوة');
      expect(profile.orderingProfile.usualOrder!.total).toBe(25);
    });
  });
});

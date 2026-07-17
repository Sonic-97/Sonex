import { Test, TestingModule } from '@nestjs/testing';
import { PricingRuleService } from './pricing-rule.service';
import { RuleEngine } from './rule-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { DynamicPricingRuleType } from '@prisma/client';

const mockPrisma = {
  dynamicPricingRule: {
    create: jest.fn().mockImplementation((data) =>
      Promise.resolve({ id: 'rule-1', ...data.data, createdAt: new Date(), updatedAt: new Date() }),
    ),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockImplementation((args) => {
      if (args.where.id === 'rule-1') return Promise.resolve({
        id: 'rule-1', cafeId: 'cafe-1', name: 'Happy Hour', ruleType: 'TIME_WINDOW',
        enabled: true, priority: 10, value: 20, currency: 'SAR',
        conditions: { startTime: '14:00', endTime: '17:00' },
        productIds: null, categoryIds: null, maxRedemptions: null, currentRedemptions: 0,
        validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(),
      });
      if (args.where.id === 'rule-disabled') return Promise.resolve({
        id: 'rule-disabled', cafeId: 'cafe-1', name: 'Disabled', ruleType: 'FIXED_DISCOUNT',
        enabled: false, priority: 5, value: 5, currency: 'SAR',
        conditions: {}, productIds: null, categoryIds: null, maxRedemptions: null, currentRedemptions: 0,
        validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(),
      });
      if (args.where.id === 'rule-expired') return Promise.resolve({
        id: 'rule-expired', cafeId: 'cafe-1', name: 'Expired', ruleType: 'FIXED_DISCOUNT',
        enabled: true, priority: 5, value: 10, currency: 'SAR',
        conditions: {}, productIds: null, categoryIds: null, maxRedemptions: null, currentRedemptions: 0,
        validFrom: new Date('2020-01-01'), validTo: new Date('2020-12-31'), createdAt: new Date(), updatedAt: new Date(),
      });
      if (args.where.id === 'rule-future') return Promise.resolve({
        id: 'rule-future', cafeId: 'cafe-1', name: 'Future', ruleType: 'PERCENTAGE_DISCOUNT',
        enabled: true, priority: 5, value: 15, currency: 'SAR',
        conditions: {}, productIds: null, categoryIds: null, maxRedemptions: null, currentRedemptions: 0,
        validFrom: new Date('2030-01-01'), validTo: null, createdAt: new Date(), updatedAt: new Date(),
      });
      return Promise.resolve(null);
    }),
    update: jest.fn().mockImplementation((args) =>
      Promise.resolve({ id: args.where.id, ...args.data, updatedAt: new Date() }),
    ),
    delete: jest.fn().mockResolvedValue({ id: 'rule-1' }),
  },
  product: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'prod-1', name: 'Latte', price: 20, category: 'Drinks',
      categoryId: 'cat-1', cafeId: 'cafe-1',
    }),
  },
};

const mockEventCallback = jest.fn();

describe('PricingRuleService', () => {
  let service: PricingRuleService;
  let engine: RuleEngine;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingRuleService,
        RuleEngine,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PricingRuleService>(PricingRuleService);
    engine = module.get<RuleEngine>(RuleEngine);
    service.onEvent(mockEventCallback);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── CRUD ──

  it('creates a pricing rule', async () => {
    const rule = await service.create({
      name: 'Happy Hour',
      ruleType: DynamicPricingRuleType.TIME_WINDOW,
      value: 20,
      priority: 10,
      conditions: { startTime: '14:00', endTime: '17:00' },
    }, 'cafe-1');

    expect(rule.name).toBe('Happy Hour');
    expect(mockEventCallback).toHaveBeenCalledWith('PricingRuleCreated', expect.any(Object));
  });

  it('finds all rules for a cafe', async () => {
    mockPrisma.dynamicPricingRule.findMany.mockResolvedValueOnce([
      { id: 'r1', name: 'Rule 1', priority: 10 },
      { id: 'r2', name: 'Rule 2', priority: 5 },
    ]);

    const rules = await service.findAll('cafe-1');
    expect(rules.length).toBe(2);
    expect(mockPrisma.dynamicPricingRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cafeId: 'cafe-1', enabled: true } }),
    );
  });

  it('finds a rule by id', async () => {
    const rule = await service.findOne('rule-1');
    expect(rule.name).toBe('Happy Hour');
  });

  it('throws on non-existent rule', async () => {
    await expect(service.findOne('nonexistent')).rejects.toThrow('not found');
  });

  it('updates a rule', async () => {
    const updated = await service.update('rule-1', { name: 'Happy Hour Extended' }, 'cafe-1');
    expect(updated.name).toBe('Happy Hour Extended');
    expect(mockEventCallback).toHaveBeenCalledWith('PricingRuleUpdated', expect.any(Object));
  });

  it('enables a rule', async () => {
    const result = await service.enable('rule-disabled', 'cafe-1');
    expect(result.enabled).toBe(true);
    expect(mockEventCallback).toHaveBeenCalledWith('PricingRuleActivated', expect.any(Object));
  });

  it('disables a rule', async () => {
    const result = await service.disable('rule-1', 'cafe-1');
    expect(result.enabled).toBe(false);
    expect(mockEventCallback).toHaveBeenCalledWith('PricingRuleDeactivated', expect.any(Object));
  });

  it('deletes a rule', async () => {
    await expect(service.delete('rule-1', 'cafe-1')).resolves.not.toThrow();
  });

  // ── Date Validation ──

  it('detects expired rule', async () => {
    const rule = await service.findOne('rule-expired');
    expect(rule.name).toBe('Expired');
  });

  it('detects future rule', async () => {
    const rule = await service.findOne('rule-future');
    expect(rule.name).toBe('Future');
  });

  // ── Rule Engine ──

  it('evaluates time-based rules', () => {
    const rules = [{
      id: 'r1', cafeId: 'cafe-1', name: 'Happy Hour', ruleType: 'TIME_WINDOW' as any,
      enabled: true, priority: 10, value: 20, currency: 'SAR',
      conditions: { startTime: '14:00', endTime: '17:00' },
      productIds: null, categoryIds: null, maxRedemptions: null, currentRedemptions: 0,
      validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(),
    }];

    const context = {
      productId: 'p1', quantity: 1, currentPrice: 20,
      dateTime: new Date('2026-07-17T15:00:00'),
      dayOfWeek: 5, hour: 15,
    };

    const result = engine.evaluate(rules, context);
    expect(result.appliedRules.length).toBe(1);
    expect(result.finalPrice).toBe(16);
  });

  it('does not apply time rule outside window', () => {
    const rules = [{
      id: 'r1', cafeId: 'cafe-1', name: 'Happy Hour', ruleType: 'TIME_WINDOW' as any,
      enabled: true, priority: 10, value: 20, currency: 'SAR',
      conditions: { startTime: '14:00', endTime: '17:00' },
      productIds: null, categoryIds: null, maxRedemptions: null, currentRedemptions: 0,
      validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(),
    }];

    const context = {
      productId: 'p1', quantity: 1, currentPrice: 20,
      dateTime: new Date('2026-07-17T18:00:00'),
      dayOfWeek: 5, hour: 18,
    };

    const result = engine.evaluate(rules, context);
    expect(result.appliedRules.length).toBe(0);
    expect(result.finalPrice).toBe(20);
  });

  it('evaluates day-of-week rules', () => {
    const rules = [{
      id: 'r1', cafeId: 'cafe-1', name: 'Weekend Special', ruleType: 'DAY_OF_WEEK' as any,
      enabled: true, priority: 10, value: 10, currency: 'SAR',
      conditions: { daysOfWeek: [5, 6] },
      productIds: null, categoryIds: null, maxRedemptions: null, currentRedemptions: 0,
      validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(),
    }];

    const context = {
      productId: 'p1', quantity: 1, currentPrice: 20,
      dateTime: new Date('2026-07-17T15:00:00'),
      dayOfWeek: 5, hour: 15,
    };

    const result = engine.evaluate(rules, context);
    expect(result.appliedRules.length).toBe(1);
    expect(result.finalPrice).toBe(18);
  });

  it('evaluates quantity-based rules', () => {
    const rules = [{
      id: 'r1', cafeId: 'cafe-1', name: 'Bulk Discount', ruleType: 'MINIMUM_QUANTITY' as any,
      enabled: true, priority: 10, value: 15, currency: 'SAR',
      conditions: { minQuantity: 3 },
      productIds: null, categoryIds: null, maxRedemptions: null, currentRedemptions: 0,
      validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(),
    }];

    // Quantity 2: doesn't meet minimum
    const ctx1 = { productId: 'p1', quantity: 2, currentPrice: 20,
      dateTime: new Date(), dayOfWeek: 5, hour: 12 };
    expect(engine.evaluate(rules, ctx1).appliedRules.length).toBe(0);

    // Quantity 3: meets minimum
    const ctx2 = { ...ctx1, quantity: 3 };
    expect(engine.evaluate(rules, ctx2).appliedRules.length).toBe(1);
  });

  it('resolves priority conflicts correctly', () => {
    const rules = [
      {
        id: 'r1', cafeId: 'cafe-1', name: 'High Priority', ruleType: 'FIXED_DISCOUNT' as any,
        enabled: true, priority: 100, value: 5, currency: 'SAR',
        conditions: {}, productIds: null, categoryIds: null, maxRedemptions: null, currentRedemptions: 0,
        validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 'r2', cafeId: 'cafe-1', name: 'Low Priority', ruleType: 'PERCENTAGE_DISCOUNT' as any,
        enabled: true, priority: 10, value: 50, currency: 'SAR',
        conditions: {}, productIds: null, categoryIds: null, maxRedemptions: null, currentRedemptions: 0,
        validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(),
      },
    ];

    const context = {
      productId: 'p1', quantity: 1, currentPrice: 20,
      dateTime: new Date(), dayOfWeek: 5, hour: 12,
    };

    const result = engine.evaluate(rules, context);
    expect(result.appliedRules.length).toBe(2);
    expect(result.appliedRules[0].discount).toBe(5);
    expect(result.appliedRules[1].discount).toBe(10);
    expect(result.finalPrice).toBe(5);
  });

  it('excludes disabled rules', () => {
    const rules = [
      {
        id: 'r1', cafeId: 'cafe-1', name: 'Active', ruleType: 'FIXED_DISCOUNT' as any,
        enabled: true, priority: 10, value: 5, currency: 'SAR',
        conditions: {}, productIds: null, categoryIds: null, maxRedemptions: null, currentRedemptions: 0,
        validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 'r2', cafeId: 'cafe-1', name: 'Disabled', ruleType: 'FIXED_DISCOUNT' as any,
        enabled: false, priority: 10, value: 10, currency: 'SAR',
        conditions: {}, productIds: null, categoryIds: null, maxRedemptions: null, currentRedemptions: 0,
        validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(),
      },
    ];

    const context = {
      productId: 'p1', quantity: 1, currentPrice: 20,
      dateTime: new Date(), dayOfWeek: 5, hour: 12,
    };

    const result = engine.evaluate(rules, context);
    expect(result.appliedRules.length).toBe(1);
    expect(result.finalPrice).toBe(15);
  });

  it('handles expired rules', () => {
    const rules = [{
      id: 'r1', cafeId: 'cafe-1', name: 'Expired', ruleType: 'FIXED_DISCOUNT' as any,
      enabled: true, priority: 10, value: 10, currency: 'SAR',
      conditions: {}, productIds: null, categoryIds: null, maxRedemptions: null, currentRedemptions: 0,
      validFrom: new Date('2020-01-01'), validTo: new Date('2020-12-31'),
      createdAt: new Date(), updatedAt: new Date(),
    }];

    const context = {
      productId: 'p1', quantity: 1, currentPrice: 20,
      dateTime: new Date('2026-07-17'), dayOfWeek: 5, hour: 12,
    };

    const result = engine.evaluate(rules, context);
    expect(result.appliedRules.length).toBe(0);
  });

  it('handles future rules', () => {
    const rules = [{
      id: 'r1', cafeId: 'cafe-1', name: 'Future', ruleType: 'PERCENTAGE_DISCOUNT' as any,
      enabled: true, priority: 10, value: 15, currency: 'SAR',
      conditions: {}, productIds: null, categoryIds: null, maxRedemptions: null, currentRedemptions: 0,
      validFrom: new Date('2030-01-01'), validTo: null,
      createdAt: new Date(), updatedAt: new Date(),
    }];

    const context = {
      productId: 'p1', quantity: 1, currentPrice: 20,
      dateTime: new Date('2026-07-17'), dayOfWeek: 5, hour: 12,
    };

    const result = engine.evaluate(rules, context);
    expect(result.appliedRules.length).toBe(0);
  });

  it('applies price override as highest priority', () => {
    const rules = [
      {
        id: 'r1', cafeId: 'cafe-1', name: 'Override', ruleType: 'PRICE_OVERRIDE' as any,
        enabled: true, priority: 10, value: 15, currency: 'SAR',
        conditions: {}, productIds: null, categoryIds: null, maxRedundants: null, currentRedemptions: 0,
        validFrom: null, validTo: null, maxRedemptions: null, createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 'r2', cafeId: 'cafe-1', name: 'Discount', ruleType: 'FIXED_DISCOUNT' as any,
        enabled: true, priority: 5, value: 5, currency: 'SAR',
        conditions: {}, productIds: null, categoryIds: null, maxRedemptions: null, currentRedemptions: 0,
        validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(),
      },
    ];

    const context = {
      productId: 'p1', quantity: 1, currentPrice: 20,
      dateTime: new Date(), dayOfWeek: 5, hour: 12,
    };

    const result = engine.evaluate(rules, context);
    expect(result.finalPrice).toBe(15);
    expect(result.appliedRules.length).toBe(1);
  });

  it('applies only to specified product', () => {
    const rules = [{
      id: 'r1', cafeId: 'cafe-1', name: 'Latte Discount', ruleType: 'FIXED_DISCOUNT' as any,
      enabled: true, priority: 10, value: 3, currency: 'SAR',
      conditions: {}, productIds: ['prod-latte'], categoryIds: null,
      maxRedemptions: null, currentRedemptions: 0,
      validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(),
    }];

    // Specific product gets discount
    const ctx1 = { productId: 'prod-latte', quantity: 1, currentPrice: 20,
      dateTime: new Date(), dayOfWeek: 5, hour: 12 };
    expect(engine.evaluate(rules, ctx1).appliedRules.length).toBe(1);

    // Other product doesn't
    const ctx2 = { ...ctx1, productId: 'prod-mocha' };
    expect(engine.evaluate(rules, ctx2).appliedRules.length).toBe(0);
  });

  it('applies category discount rules', () => {
    const rules = [{
      id: 'r1', cafeId: 'cafe-1', name: 'Drinks Discount', ruleType: 'CATEGORY_DISCOUNT' as any,
      enabled: true, priority: 10, value: 10, currency: 'SAR',
      conditions: {}, productIds: null, categoryIds: ['cat-drinks'],
      maxRedemptions: null, currentRedemptions: 0,
      validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(),
    }];

    const ctx = { productId: 'p1', quantity: 1, currentPrice: 20,
      categoryId: 'cat-drinks',
      dateTime: new Date(), dayOfWeek: 5, hour: 12 };
    const result = engine.evaluate(rules, ctx);
    expect(result.appliedRules.length).toBe(1);
    expect(result.finalPrice).toBe(18);
  });

  // ── Pricing Preview ──

  it('previews price with applicable rules', async () => {
    mockPrisma.dynamicPricingRule.findMany.mockResolvedValueOnce([
      {
        id: 'r1', cafeId: 'cafe-1', name: 'Happy Hour', ruleType: 'TIME_WINDOW' as any,
        enabled: true, priority: 10, value: 20, currency: 'SAR',
        conditions: { startTime: '14:00', endTime: '17:00' },
        productIds: null, categoryIds: null, maxRedemptions: null, currentRedemptions: 0,
        validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(),
      },
    ]);

    const breakdown = await service.previewPrice('cafe-1', 'prod-1', 1);

    expect(breakdown.basePrice).toBe(20);
    expect(breakdown.finalPrice).toBeGreaterThanOrEqual(0);
    expect(breakdown.currency).toBe('SAR');
  });

  it('previews price with no rules returns base price', async () => {
    mockPrisma.dynamicPricingRule.findMany.mockResolvedValueOnce([]);

    const breakdown = await service.previewPrice('cafe-1', 'prod-1', 1);

    expect(breakdown.basePrice).toBe(20);
    expect(breakdown.finalPrice).toBe(20);
    expect(breakdown.appliedRules.length).toBe(0);
  });

  // ── Rule Validation ──

  it('validates value is non-negative on creation', async () => {
    await expect(service.create({
      name: 'Invalid', ruleType: DynamicPricingRuleType.FIXED_DISCOUNT, value: -5,
    }, 'cafe-1')).rejects.toThrow();
  });

  // ── Concurrent Evaluation ──

  it('evaluates multiple rules simultaneously', () => {
    const rules = [
      {
        id: 'r1', cafeId: 'cafe-1', name: 'Weekend', ruleType: 'DAY_OF_WEEK' as any,
        enabled: true, priority: 10, value: 10, currency: 'SAR',
        conditions: { daysOfWeek: [5] }, productIds: null, categoryIds: null,
        maxRedemptions: null, currentRedemptions: 0,
        validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 'r2', cafeId: 'cafe-1', name: 'Happy Hour', ruleType: 'TIME_WINDOW' as any,
        enabled: true, priority: 5, value: 20, currency: 'SAR',
        conditions: { startTime: '14:00', endTime: '17:00' }, productIds: null, categoryIds: null,
        maxRedemptions: null, currentRedemptions: 0,
        validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(),
      },
    ];

    const context = {
      productId: 'p1', quantity: 1, currentPrice: 20,
      dateTime: new Date('2026-07-17T15:00:00'),
      dayOfWeek: 5, hour: 15,
    };

    const result = engine.evaluate(rules, context);
    expect(result.appliedRules.length).toBe(2);
    expect(result.finalPrice).toBe(14);
  });
});

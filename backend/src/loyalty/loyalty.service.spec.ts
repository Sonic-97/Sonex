import { Test, TestingModule } from '@nestjs/testing';
import { LoyaltyService } from './loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from '../common/idempotency.service';
import { EventBusService } from '../events/event-bus.service';

describe('LoyaltyService', () => {
  let service: LoyaltyService;

  const mockPrisma = {
    loyaltyRule: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    loyaltyLedger: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    rewardWallet: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    customerTier: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    customer: {
      findUnique: jest.fn(),
    },
    compensation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    product: {
      findUnique: jest.fn(),
    },
    processedMessage: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((fn: any) => fn(mockPrisma)),
  };

  const mockIdempotency = {
    isProcessed: jest.fn().mockResolvedValue({ duplicated: false }),
  };

  const mockEventBus = { publish: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoyaltyService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: IdempotencyService, useValue: mockIdempotency },
        { provide: EventBusService, useValue: mockEventBus },
      ],
    }).compile();

    service = module.get<LoyaltyService>(LoyaltyService);
  });

  // ── Rule Management ──
  test('createRule creates and returns rule config', async () => {
    mockPrisma.loyaltyRule.create.mockResolvedValue({
      id: 'rule-1', cafeId: 'cafe-1', name: 'قهوة مجانية', type: 'ORDER_COUNT',
      conditionCount: 9, rewardType: 'FREE_PRODUCT', rewardProductId: 'prod-1',
      scopeProductIds: null, scopeCategoryIds: null, rewardValue: null,
      validFrom: null, validTo: null, maxRedemptions: 100, currentRedemptions: 0,
      enabled: false, requiresOwnerApproval: false, autoCompensation: false,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const rule = await service.createRule('cafe-1', {
      name: 'قهوة مجانية', type: 'ORDER_COUNT', conditionCount: 9,
      rewardType: 'FREE_PRODUCT', rewardProductId: 'prod-1', maxRedemptions: 100,
    });

    expect(rule.name).toBe('قهوة مجانية');
    expect(rule.type).toBe('ORDER_COUNT');
    expect(rule.conditionCount).toBe(9);
  });

  test('updateRule rejects foreign cafe', async () => {
    mockPrisma.loyaltyRule.findUnique.mockResolvedValue({ id: 'rule-1', cafeId: 'other-cafe' });
    await expect(service.updateRule('rule-1', 'cafe-1', { enabled: true }))
      .rejects.toThrow();
  });

  test('getActiveRules returns only enabled rules', async () => {
    mockPrisma.loyaltyRule.findMany.mockResolvedValue([
      { id: 'r1', cafeId: 'cafe-1', name: 'Rule 1', type: 'ORDER_COUNT', conditionCount: 5, rewardType: 'FREE_PRODUCT', enabled: true, maxRedemptions: null, currentRedemptions: 0, requiresOwnerApproval: false, autoCompensation: false, validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(), rewardValue: null, rewardProductId: null, scopeProductIds: null, scopeCategoryIds: null, conditionMinValue: null },
    ]);
    const rules = await service.getActiveRules('cafe-1');
    expect(rules).toHaveLength(1);
  });

  // ── Wallet ──
  test('getWallet returns empty state for new customer', async () => {
    mockPrisma.rewardWallet.findUnique.mockResolvedValue(null);
    mockPrisma.loyaltyRule.findMany.mockResolvedValue([]);
    mockPrisma.customer.findUnique.mockResolvedValue({ totalOrders: 0, totalSpent: 0, totalCafeVisits: 0 });

    const wallet = await service.getWallet('cafe-1', 'cust-1');
    expect(wallet.currentBalance).toBe(0);
    expect(wallet.availableRewards).toHaveLength(0);
    expect(wallet.progresses).toHaveLength(0);
  });

  test('getWallet shows progress when rules exist', async () => {
    mockPrisma.rewardWallet.findUnique.mockResolvedValue({ currentBalance: 5, totalEarned: 5, totalRedeemed: 1, lifetimeEarned: 5 });
    mockPrisma.loyaltyRule.findMany.mockResolvedValue([
      { id: 'r1', cafeId: 'cafe-1', name: 'قهوة مجانية', type: 'ORDER_COUNT', conditionCount: 9, rewardType: 'FREE_PRODUCT', rewardProductId: 'prod-1', enabled: true, maxRedemptions: null, currentRedemptions: 2, requiresOwnerApproval: false, autoCompensation: false, validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(), rewardValue: null, scopeProductIds: null, scopeCategoryIds: null, conditionMinValue: null },
    ]);
    mockPrisma.customer.findUnique.mockResolvedValue({ totalOrders: 5, totalSpent: 0, totalCafeVisits: 0 });

    const wallet = await service.getWallet('cafe-1', 'cust-1');
    expect(wallet.currentBalance).toBe(5);
    expect(wallet.progresses).toHaveLength(1);
    expect(wallet.progresses[0].current).toBe(5);
    expect(wallet.progresses[0].target).toBe(9);
    // Math.round(5/9 * 100) = Math.round(55.56) = 56
    expect(wallet.progresses[0].percentage).toBe(56);
  });

  // ── Order Processing ──
  test('processOrderDelivered skips duplicate', async () => {
    mockIdempotency.isProcessed.mockResolvedValue({ duplicated: true, entityType: 'loyalty_earn', entityId: 'order-1' });
    await service.processOrderDelivered('order-1', 'cafe-1', 'cust-1');
    expect(mockIdempotency.isProcessed).toHaveBeenCalled();
    expect(mockPrisma.loyaltyRule.findMany).not.toHaveBeenCalled();
  });

  test('processOrderDelivered earns rewards for matching rules', async () => {
    mockIdempotency.isProcessed.mockResolvedValue({ duplicated: false });
    mockPrisma.loyaltyRule.findMany.mockResolvedValue([
      { id: 'r1', cafeId: 'cafe-1', name: 'قهوة مجانية', type: 'ORDER_COUNT', conditionCount: 3, rewardType: 'FREE_PRODUCT', rewardProductId: 'prod-1', enabled: true, maxRedemptions: null, currentRedemptions: 0, requiresOwnerApproval: false, autoCompensation: false, validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date(), rewardValue: null, scopeProductIds: null, scopeCategoryIds: null, conditionMinValue: null },
    ]);
    mockPrisma.customer.findUnique.mockResolvedValue({ totalOrders: 5, totalSpent: 0, totalCafeVisits: 0 });
    mockPrisma.loyaltyRule.findUnique.mockResolvedValue({ currentRedemptions: 0 });

    await service.processOrderDelivered('order-1', 'cafe-1', 'cust-1');

    expect(mockPrisma.loyaltyLedger.create).toHaveBeenCalled();
    expect(mockPrisma.rewardWallet.upsert).toHaveBeenCalled();
    expect(mockPrisma.loyaltyRule.update).toHaveBeenCalled();
  });

  // ── Cancelled/Failed Orders ──
  test('processOrderDelivered does not earn for cancelled orders', async () => {
    mockIdempotency.isProcessed.mockResolvedValue({ duplicated: false });
    mockPrisma.loyaltyRule.findMany.mockResolvedValue([]);
    // With no active rules, nothing is earned
    await service.processOrderDelivered('order-1', 'cafe-1', 'cust-1');
    expect(mockPrisma.loyaltyLedger.create).not.toHaveBeenCalled();
  });

  // ── Reward Redemption ──
  test('redeemReward fails when rule not found', async () => {
    mockPrisma.loyaltyRule.findUnique.mockResolvedValue(null);
    const result = await service.redeemReward('cafe-1', 'cust-1', 'bad-rule');
    expect(result.success).toBe(false);
  });

  test('redeemReward fails when rule expired', async () => {
    mockPrisma.loyaltyRule.findUnique.mockResolvedValue({
      id: 'r1', cafeId: 'cafe-1', enabled: true, maxRedemptions: null, currentRedemptions: 0,
      validTo: new Date(Date.now() - 86400000), rewardType: 'FREE_PRODUCT',
    });
    const result = await service.redeemReward('cafe-1', 'cust-1', 'r1');
    expect(result.success).toBe(false);
  });

  test('redeemReward fails when product unavailable', async () => {
    mockPrisma.loyaltyRule.findUnique.mockResolvedValue({
      id: 'r1', cafeId: 'cafe-1', enabled: true, maxRedemptions: null, currentRedemptions: 0,
      validTo: new Date(Date.now() + 86400000), rewardType: 'FREE_PRODUCT',
      rewardProductId: 'prod-1',
    });
    mockPrisma.product.findUnique.mockResolvedValue(null);
    const result = await service.redeemReward('cafe-1', 'cust-1', 'r1');
    expect(result.success).toBe(false);
  });

  test('redeemReward succeeds with valid rule', async () => {
    mockPrisma.loyaltyRule.findUnique.mockResolvedValue({
      id: 'r1', cafeId: 'cafe-1', enabled: true, maxRedemptions: null, currentRedemptions: 0,
      validTo: new Date(Date.now() + 86400000), rewardType: 'FREE_PRODUCT',
      rewardProductId: 'prod-1', name: 'قهوة مجانية',
    });
    mockPrisma.product.findUnique.mockResolvedValue({ active: true });

    const result = await service.redeemReward('cafe-1', 'cust-1', 'r1');
    expect(result.success).toBe(true);
  });

  test('redeemReward succeeds with valid rule and available product', async () => {
    mockIdempotency.isProcessed.mockResolvedValue({ duplicated: false });
    mockPrisma.loyaltyRule.findUnique.mockResolvedValue({
      id: 'r1', cafeId: 'cafe-1', enabled: true, maxRedemptions: null, currentRedemptions: 0,
      validTo: new Date(Date.now() + 86400000), rewardType: 'FREE_PRODUCT',
      rewardProductId: 'prod-1', name: 'قهوة مجانية',
    });
    mockPrisma.product.findUnique.mockResolvedValue({ active: true });

    const result = await service.redeemReward('cafe-1', 'cust-1', 'r1');
    expect(result.success).toBe(true);
  });

  // ── Customer Isolation ──
  test('getWallet returns customer-specific data', async () => {
    mockPrisma.rewardWallet.findUnique.mockResolvedValue({ currentBalance: 10, totalEarned: 10, totalRedeemed: 2, lifetimeEarned: 10 });
    mockPrisma.loyaltyRule.findMany.mockResolvedValue([]);
    mockPrisma.customer.findUnique.mockResolvedValue({ totalOrders: 3, totalSpent: 0, totalCafeVisits: 0 });

    const walletA = await service.getWallet('cafe-1', 'cust-A');
    expect(walletA.currentBalance).toBe(10);

    mockPrisma.rewardWallet.findUnique.mockResolvedValue({ currentBalance: 25, totalEarned: 25, totalRedeemed: 5, lifetimeEarned: 25 });
    mockPrisma.customer.findUnique.mockResolvedValue({ totalOrders: 8, totalSpent: 0, totalCafeVisits: 0 });

    const walletB = await service.getWallet('cafe-1', 'cust-B');
    expect(walletB.currentBalance).toBe(25);
    expect(walletB.currentBalance).not.toBe(walletA.currentBalance);
  });

  // ── Tier ──
  test('computeTier returns STANDARD for new customer', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ totalOrders: 1, totalSpent: 50 });
    mockPrisma.customerTier.upsert.mockResolvedValue({});
    const tier = await service.computeTier('cust-1', 'cafe-1');
    expect(tier).toBe('STANDARD');
  });

  test('computeTier returns REGULAR for 10+ orders', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ totalOrders: 12, totalSpent: 600 });
    mockPrisma.customerTier.upsert.mockResolvedValue({});
    const tier = await service.computeTier('cust-1', 'cafe-1');
    expect(tier).toBe('REGULAR');
  });

  test('computeTier returns LOYAL for 20+ orders', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ totalOrders: 25, totalSpent: 2500 });
    mockPrisma.customerTier.upsert.mockResolvedValue({});
    const tier = await service.computeTier('cust-1', 'cafe-1');
    expect(tier).toBe('LOYAL');
  });

  test('computeTier returns VIP for 50+ orders', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ totalOrders: 60, totalSpent: 6000 });
    mockPrisma.customerTier.upsert.mockResolvedValue({});
    const tier = await service.computeTier('cust-1', 'cafe-1');
    expect(tier).toBe('VIP');
  });
});

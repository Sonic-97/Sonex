import { Test, TestingModule } from '@nestjs/testing';
import { TrustReputationService } from './trust-reputation.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewInput } from './trust-reputation.types';

function mockPrisma() {
  const store = new Map<string, any>();
  const reviewStore = new Map<string, any>();
  const repStore = new Map<string, any>();

  function genId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const merchantOrder = {
    findUnique: jest.fn(async (args: { where: { id: string }; select?: any }) => {
      const record = store.get(args.where.id);
      if (!record || !record.cafeId) return null;
      if (args.select) {
        const result: any = {};
        for (const key of Object.keys(args.select)) {
          if (key === 'customerOrder') {
            result.customerOrder = record.customerOrder || { customerId: record.customerId };
          } else if (key in record) {
            result[key] = record[key];
          }
        }
        return result;
      }
      return record;
    }),
    count: jest.fn(async (args: { where?: any }) => {
      let results = Array.from(store.values()).filter(v => v.cafeId);
      if (args?.where?.cafeId) {
        results = results.filter(r => r.cafeId === args.where.cafeId);
      }
      if (args?.where?.status) {
        results = results.filter(r => r.status === args.where.status);
      }
      if (args?.where?.status?.notIn) {
        results = results.filter(r => !args.where.status.notIn.includes(r.status));
      }
      return results.length;
    }),
  };

  const merchantReview = {
    findUnique: jest.fn(async (args: { where: { merchantOrderId: string } }) => {
      const all = Array.from(reviewStore.values());
      return all.find(r => r.merchantOrderId === args.where.merchantOrderId) || null;
    }),
    findMany: jest.fn(async (args: { where?: any; orderBy?: any; skip?: number; take?: number }) => {
      let results = Array.from(reviewStore.values());
      if (args?.where?.merchantId) {
        results = results.filter(r => r.merchantId === args.where.merchantId);
      }
      if (args?.orderBy?.createdAt === 'desc') {
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } else {
        results.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      }
      if (args?.skip != null && args?.take != null) {
        results = results.slice(args.skip, args.skip + args.take);
      }
      return results;
    }),
    count: jest.fn(async (args: { where?: any }) => {
      let results = Array.from(reviewStore.values());
      if (args?.where?.merchantId) {
        results = results.filter(r => r.merchantId === args.where.merchantId);
      }
      return results.length;
    }),
    create: jest.fn(async (args: { data: any }) => {
      const id = genId('rev');
      const record = { id, ...args.data, createdAt: new Date(), updatedAt: new Date() };
      reviewStore.set(id, record);
      return record;
    }),
  };

  const merchantReputation = {
    findUnique: jest.fn(async (args: { where: { merchantId: string } }) => {
      const all = Array.from(repStore.values());
      return all.find(r => r.merchantId === args.where.merchantId) || null;
    }),
    findMany: jest.fn(async (args: { where: { merchantId: { in: string[] } } }) => {
      return Array.from(repStore.values()).filter(r => args.where.merchantId.in.includes(r.merchantId));
    }),
    upsert: jest.fn(async (args: { where: { merchantId: string }; create: any; update: any }) => {
      const all = Array.from(repStore.values());
      const existing = all.find(r => r.merchantId === args.where.merchantId);
      if (existing) {
        const updated = { ...existing, ...args.update, updatedAt: new Date() };
        repStore.set(existing.id, updated);
        return updated;
      }
      const id = genId('rep');
      const record = { id, ...args.create, updatedAt: new Date() };
      repStore.set(id, record);
      return record;
    }),
  };

  const result: any = { merchantOrder, merchantReview, merchantReputation };
  return { prisma: result, store, reviewStore, repStore };
}

function addMerchantOrder(store: Map<string, any>, overrides: any = {}): any {
  const id = overrides.id || `mo-${Math.random().toString(36).slice(2, 8)}`;
  const order = {
    id, cafeId: 'cafe-1', customerOrder: { customerId: 'cust-1' },
    customerId: 'cust-1', status: 'COMPLETED', preparationTimeMinutes: 15,
    ...overrides,
  };
  store.set(id, order);
  return order;
}

describe('TrustReputationService', () => {
  let service: TrustReputationService;
  let prisma: any;
  let store: Map<string, any>;
  let reviewStore: Map<string, any>;

  beforeEach(async () => {
    const m = mockPrisma();
    prisma = m.prisma;
    store = m.store;
    reviewStore = m.reviewStore;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrustReputationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(TrustReputationService);
  });

  function makeReview(overrides: Partial<ReviewInput> = {}): ReviewInput {
    return {
      customerId: 'cust-1',
      merchantId: 'cafe-1',
      merchantOrderId: 'mo-1',
      ratings: { productQuality: 5, preparationSpeed: 4, deliverySpeed: 4, packaging: 5, staffBehaviour: 5, valueForMoney: 4, overallSatisfaction: 5 },
      ...overrides,
    };
  }

  it('submits verified review for completed order', async () => {
    addMerchantOrder(store, { id: 'mo-1' });
    const result = await service.submitReview(makeReview());
    expect(result.verified).toBe(true);
    expect(result.reviewId).toBeTruthy();
  });

  it('rejects duplicate review for same order', async () => {
    addMerchantOrder(store, { id: 'mo-1' });
    await service.submitReview(makeReview());
    await expect(service.submitReview(makeReview())).rejects.toThrow('Review already submitted');
  });

  it('rejects review for non-completed order', async () => {
    addMerchantOrder(store, { id: 'mo-1', status: 'PREPARING' });
    await expect(service.submitReview(makeReview())).rejects.toThrow('Order must be COMPLETED');
  });

  it('rejects review for wrong customer', async () => {
    addMerchantOrder(store, { id: 'mo-1', customerOrder: { customerId: 'cust-2' } });
    await expect(service.submitReview(makeReview())).rejects.toThrow('Order does not belong to this customer');
  });

  it('detects complaints from low ratings', async () => {
    addMerchantOrder(store, { id: 'mo-1' });
    const result = await service.submitReview(makeReview({
      ratings: { productQuality: 2, preparationSpeed: 4, deliverySpeed: 1, packaging: 5, staffBehaviour: 5, valueForMoney: 4, overallSatisfaction: 3 },
    }));
    expect(result.complaints.length).toBeGreaterThan(0);
    expect(result.complaints).toContain('Wrong Order');
    expect(result.complaints).toContain('Late Delivery');
  });

  it('calculates trust score from multiple reviews', async () => {
    addMerchantOrder(store, { id: 'mo-1' });
    addMerchantOrder(store, { id: 'mo-2' });
    addMerchantOrder(store, { id: 'mo-3' });

    await service.submitReview(makeReview({ merchantOrderId: 'mo-1', ratings: { productQuality: 5, preparationSpeed: 5, deliverySpeed: 5, packaging: 5, staffBehaviour: 5, valueForMoney: 5, overallSatisfaction: 5 } }));
    await service.submitReview(makeReview({ merchantOrderId: 'mo-2', ratings: { productQuality: 4, preparationSpeed: 4, deliverySpeed: 4, packaging: 4, staffBehaviour: 4, valueForMoney: 4, overallSatisfaction: 4 } }));
    await service.submitReview(makeReview({ merchantOrderId: 'mo-3', ratings: { productQuality: 5, preparationSpeed: 4, deliverySpeed: 5, packaging: 5, staffBehaviour: 5, valueForMoney: 5, overallSatisfaction: 5 } }));

    const rep = await service.getReputation('cafe-1');
    expect(rep).not.toBeNull();
    expect(rep!.totalReviews).toBe(3);
    expect(rep!.trustScore).toBeGreaterThan(0);
  });

  it('assigns badges based on performance', async () => {
    addMerchantOrder(store, { id: 'mo-1' });
    addMerchantOrder(store, { id: 'mo-2' });
    addMerchantOrder(store, { id: 'mo-3' });
    addMerchantOrder(store, { id: 'mo-4' });
    addMerchantOrder(store, { id: 'mo-5' });

    for (let i = 1; i <= 5; i++) {
      await service.submitReview(makeReview({
        merchantOrderId: `mo-${i}`,
        ratings: { productQuality: 5, preparationSpeed: 5, deliverySpeed: 5, packaging: 5, staffBehaviour: 5, valueForMoney: 5, overallSatisfaction: 5 },
      }));
    }

    const badges = await service.getMerchantBadges('cafe-1');
    expect(badges.length).toBeGreaterThanOrEqual(2);
    expect(badges.some(b => b.badge === 'Top Rated')).toBe(true);
  });

  it('generates quality alert when complaint threshold exceeded', async () => {
    for (let i = 1; i <= 4; i++) {
      addMerchantOrder(store, { id: `mo-${i}` });
      await service.submitReview(makeReview({
        merchantOrderId: `mo-${i}`,
        ratings: { productQuality: 2, preparationSpeed: 5, deliverySpeed: 5, packaging: 5, staffBehaviour: 5, valueForMoney: 5, overallSatisfaction: 3 },
      }));
    }

    const alerts = await service.getQualityAlerts('cafe-1');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts.some(a => a.complaintType === 'Wrong Order')).toBe(true);
  });

  it('applies lower weight to old reviews', async () => {
    addMerchantOrder(store, { id: 'mo-1' });
    await service.submitReview(makeReview({
      merchantOrderId: 'mo-1',
      ratings: { productQuality: 5, preparationSpeed: 5, deliverySpeed: 5, packaging: 5, staffBehaviour: 5, valueForMoney: 5, overallSatisfaction: 5 },
    }));

    const review = Array.from(reviewStore.values())[0];
    const oldDate = new Date(Date.now() - 100 * 86400000);
    review.createdAt = oldDate;
    reviewStore.set(review.id, review);

    await service.recalculateReputation('cafe-1');
    const rep = await service.getReputation('cafe-1');
    expect(rep).not.toBeNull();
    expect(rep!.trustScore).toBeGreaterThan(0);
  });

  it('ranks merchants by trust score', async () => {
    addMerchantOrder(store, { id: 'mo-1' });
    addMerchantOrder(store, { id: 'mo-2' });
    addMerchantOrder(store, { id: 'mo-3' });

    await service.submitReview(makeReview({ merchantOrderId: 'mo-1', ratings: { productQuality: 5, preparationSpeed: 5, deliverySpeed: 5, packaging: 5, staffBehaviour: 5, valueForMoney: 5, overallSatisfaction: 5 } }));

    addMerchantOrder(store, { id: 'mo-4', cafeId: 'cafe-2', customerOrder: { customerId: 'cust-1' } });
    addMerchantOrder(store, { id: 'mo-5', cafeId: 'cafe-2', customerOrder: { customerId: 'cust-1' } });
    addMerchantOrder(store, { id: 'mo-6', cafeId: 'cafe-2', customerOrder: { customerId: 'cust-1' } });

    await service.submitReview(makeReview({ merchantOrderId: 'mo-4', merchantId: 'cafe-2', ratings: { productQuality: 3, preparationSpeed: 3, deliverySpeed: 3, packaging: 3, staffBehaviour: 3, valueForMoney: 3, overallSatisfaction: 3 } }));

    const ranked = await service.getRankedMerchants(['cafe-1', 'cafe-2']);
    expect(ranked.length).toBe(2);
    expect(ranked[0].trustScore).toBeGreaterThanOrEqual(ranked[1].trustScore);
  });
});

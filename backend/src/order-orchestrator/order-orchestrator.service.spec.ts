import { Test, TestingModule } from '@nestjs/testing';
import { OrderOrchestratorService } from './order-orchestrator.service';
import { OrderSplitterService } from './order-splitter.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerOrderInput } from './order-orchestrator.types';

function mockPrisma() {
  const store = new Map<string, any>();

  function createModel(name: string) {
    const defaults: Record<string, any> = { customerOrder: { readyMerchantCount: 0 } };

    return {
      create: jest.fn(async (args: any) => {
        const id = `id-${Math.random().toString(36).slice(2, 8)}`;
        const record = { id, ...defaults[name], ...args.data, createdAt: new Date(), updatedAt: new Date() };
        if (args.include) {
          if (args.include.merchantOrders) {
            record.merchantOrders = (args.data.merchantOrders?.create || []).map((moData: any, i: number) => {
              const moId = `mo-${Math.random().toString(36).slice(2, 8)}`;
              const mo = {
                id: moId,
                customerOrderId: id,
                cafeId: moData.cafeId,
                businessName: moData.businessName,
                businessType: moData.businessType,
                status: 'CREATED',
                pickupSequence: moData.pickupSequence || i,
                preparationTimeMinutes: moData.preparationTimeMinutes || 15,
                items: (moData.items?.create || []).map((itemData: any) => ({
                  id: `mi-${Math.random().toString(36).slice(2, 8)}`,
                  merchantOrderId: moId,
                  ...itemData,
                })),
                createdAt: new Date(), updatedAt: new Date(),
              };
              store.set(moId, mo);
              return mo;
            });
          }
        }
        if (args.include?.merchantOrders?.include?.items) {
          // already handled above
        }
        store.set(id, record);
        return record;
      }),
      findUnique: jest.fn(async (args: { where: { id: string }; include?: any }) => {
        const record = store.get(args.where.id);
        if (!record) return null;
        if (args.include?.merchantOrders) {
          record.merchantOrders = Array.from(store.values())
            .filter((v: any) => v.customerOrderId === record.id && v.cafeId)
            .map((v: any) => ({ ...v }));
        }
        return record;
      }),
      findMany: jest.fn(async (args: { where?: any; orderBy?: any }) => {
        let results = Array.from(store.values()).filter(r => r.customerOrderId);
        if (args?.where?.customerOrderId) {
          results = results.filter(r => r.customerOrderId === args.where.customerOrderId);
        }
        if (args?.where?.status?.notIn) {
          results = results.filter(r => !args.where.status.notIn.includes(r.status));
        }
        if (args?.orderBy?.pickupSequence) {
          results.sort((a, b) => (a.pickupSequence || 0) - (b.pickupSequence || 0));
        }
        return results;
      }),
      update: jest.fn(async (args: { where: { id: string }; data: any }) => {
        const existing = store.get(args.where.id);
        if (!existing) throw new Error('Not found');
        const updated = { ...existing, ...args.data, updatedAt: new Date() };
        store.set(args.where.id, updated);
        return updated;
      }),
      updateMany: jest.fn(async (args: { where: any; data: any }) => {
        let count = 0;
        for (const [key, val] of store) {
          if (val.customerOrderId === args.where.customerOrderId) {
            if (args.where.status?.notIn) {
              if (args.where.status.notIn.includes(val.status)) continue;
            }
            store.set(key, { ...val, ...args.data });
            count++;
          }
        }
        return { count };
      }),
    };
  }

  const customerOrder = createModel('customerOrder');
  const merchantOrder = createModel('merchantOrder');
  const merchantOrderItem = createModel('merchantOrderItem');

  const result: any = {
    customerOrder,
    merchantOrder,
    merchantOrderItem,
    $transaction: jest.fn((fn: any) => fn(result)),
  };
  return result;
}

describe('OrderOrchestratorService', () => {
  let service: OrderOrchestratorService;
  let prisma: ReturnType<typeof mockPrisma>;

  function singleMerchantInput(): CreateCustomerOrderInput {
    return {
      customerName: 'Ahmed',
      customerPhone: '0100000000',
      address: '12 Main St',
      deliveryMethod: 'DELIVERY',
      items: [
        { productName: 'Cappuccino', quantity: 2, unitPrice: 3.5, cafeId: 'cafe-1', businessName: 'Cafe 1', businessType: 'cafe' },
      ],
      deliveryFee: 5,
    };
  }

  function twoMerchantInput(): CreateCustomerOrderInput {
    return {
      customerName: 'Ahmed',
      items: [
        { productName: 'Cappuccino', quantity: 1, unitPrice: 3.5, cafeId: 'cafe-1', businessName: 'Cafe', businessType: 'cafe' },
        { productName: 'Bread', quantity: 2, unitPrice: 1.0, cafeId: 'cafe-2', businessName: 'Bakery', businessType: 'bakery' },
      ],
    };
  }

  function fiveMerchantInput(): CreateCustomerOrderInput {
    return {
      customerName: 'Multi',
      items: [
        { productName: 'Cappuccino', quantity: 1, unitPrice: 3.5, cafeId: 'cafe-1', businessName: 'Cafe' },
        { productName: 'Bread', quantity: 2, unitPrice: 1.0, cafeId: 'cafe-2', businessName: 'Bakery' },
        { productName: 'Tomatoes', quantity: 1, unitPrice: 2.0, cafeId: 'cafe-3', businessName: 'Fruit' },
        { productName: 'Panadol', quantity: 1, unitPrice: 5.0, cafeId: 'cafe-4', businessName: 'Pharmacy' },
        { productName: 'Rice', quantity: 1, unitPrice: 3.0, cafeId: 'cafe-5', businessName: 'Grocery' },
      ],
    };
  }

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderOrchestratorService,
        OrderSplitterService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(OrderOrchestratorService);
  });

  // ── Single Merchant ──

  describe('Single merchant', () => {
    it('creates a customer order with one merchant order', async () => {
      const result = await service.createCustomerOrder(singleMerchantInput());
      expect(result.status).toBe('PROCESSING');
      expect(result.merchantOrders).toHaveLength(1);
      expect(result.totalMerchantCount).toBe(1);
    });

    it('transitions through full lifecycle', async () => {
      const co = await service.createCustomerOrder(singleMerchantInput());
      const mo = co.merchantOrders[0];

      await service.acceptMerchantOrder(mo.id);
      await service.startPreparing(mo.id);
      await service.markMerchantReady(mo.id);
      await service.pickupMerchantOrder(mo.id);
      await service.completeMerchantOrder(mo.id);
      const delivered = await service.deliverCustomerOrder(co.id);

      expect(delivered.status).toBe('COMPLETED');
    });
  });

  // ── Two Merchants ──

  describe('Two merchants', () => {
    it('creates a customer order with two merchant orders', async () => {
      const result = await service.createCustomerOrder(twoMerchantInput());
      expect(result.merchantOrders).toHaveLength(2);
      expect(result.totalMerchantCount).toBe(2);
    });

    it('shows PARTIALLY_READY when one merchant is ready', async () => {
      const co = await service.createCustomerOrder(twoMerchantInput());
      const mo1 = co.merchantOrders[0];

      await service.acceptMerchantOrder(mo1.id);
      await service.markMerchantReady(mo1.id);

      const tracking = await service.getCustomerTracking(co.id);
      expect(tracking!.summary).toContain('1 of 2 merchants ready');
    });
  });

  // ── Five Merchants ──

  describe('Five merchants', () => {
    it('creates five merchant orders', async () => {
      const result = await service.createCustomerOrder(fiveMerchantInput());
      expect(result.merchantOrders).toHaveLength(5);
      expect(result.totalMerchantCount).toBe(5);
    });
  });

  // ── Merchant Rejection ──

  describe('Merchant rejection', () => {
    it('handles merchant rejection and emits PartialFailure', async () => {
      const events: string[] = [];
      service.onEvent(e => events.push(e.type));

      const co = await service.createCustomerOrder(twoMerchantInput());
      const mo1 = co.merchantOrders[0];
      await service.acceptMerchantOrder(mo1.id);
      await service.markMerchantReady(mo1.id);
      await service.rejectMerchantOrder(co.merchantOrders[1].id, 'Out of stock');

      expect(events).toContain('PartialFailure');
    });
  });

  // ── Merchant Timeout / Delay ──

  describe('Merchant delay', () => {
    it('delays merchant order and updates estimated ready time', async () => {
      const co = await service.createCustomerOrder(singleMerchantInput());
      const mo = co.merchantOrders[0];
      await service.acceptMerchantOrder(mo.id);
      await service.delayMerchantOrder(mo.id, 10);

      const events: string[] = [];
      service.onEvent(e => events.push(e.type));
      await service.delayMerchantOrder(mo.id, 5);
      expect(events).toContain('MerchantDelayed');
    });
  });

  // ── Replacements ──

  describe('Replacements', () => {
    it('proposes and accepts replacement', async () => {
      const events: string[] = [];
      service.onEvent(e => events.push(e.type));

      const co = await service.createCustomerOrder(singleMerchantInput());
      const mo = co.merchantOrders[0];

      const proposal = {
        merchantOrderId: mo.id,
        cafeId: 'cafe-1',
        originalProductName: 'Cappuccino',
        suggestedProductName: 'Latte',
        suggestedProductId: 'prod-latte',
        reason: 'Out of cappuccino',
      };

      await service.proposeReplacement(mo.id, proposal);
      expect(events).toContain('ReplacementRequested');

      await service.acceptReplacement(mo.id, proposal);
      expect(events).toContain('ReplacementAccepted');
    });

    it('proposes and rejects replacement', async () => {
      const events: string[] = [];
      service.onEvent(e => events.push(e.type));

      const co = await service.createCustomerOrder(singleMerchantInput());
      const mo = co.merchantOrders[0];

      const proposal = {
        merchantOrderId: mo.id,
        cafeId: 'cafe-1',
        originalProductName: 'Cappuccino',
        suggestedProductName: 'Latte',
        suggestedProductId: 'prod-latte',
        reason: 'Out of cappuccino',
      };

      await service.rejectReplacement(mo.id, proposal);
      expect(events).toContain('ReplacementRejected');
    });
  });

  // ── Driver ──

  describe('Driver collecting', () => {
    it('assigns driver and starts collection', async () => {
      const events: string[] = [];
      service.onEvent(e => events.push(e.type));

      const co = await service.createCustomerOrder(singleMerchantInput());
      await service.assignDriver(co.id, 'driver-1');
      expect(events).toContain('DriverAssigned');
    });

    it('returns driver route', async () => {
      const co = await service.createCustomerOrder(twoMerchantInput());
      const route = await service.getDriverRoute(co.id);
      expect(route).toHaveLength(2);
      expect(route[0].sequence).toBe(0);
      expect(route[1].sequence).toBe(1);
    });

    it('optimizes route putting ready merchants first', async () => {
      const co = await service.createCustomerOrder(twoMerchantInput());
      const mo1 = co.merchantOrders[0];
      const mo2 = co.merchantOrders[1];

      await service.acceptMerchantOrder(mo2.id);
      await service.markMerchantReady(mo2.id);

      const route = await service.optimizeRoute(co.id);
      expect(route[0].merchantOrderId).toBe(mo2.id);
    });
  });

  // ── Driver Completed ──

  describe('Driver completed', () => {
    it('completes delivery and marks order COMPLETED', async () => {
      const events: string[] = [];
      service.onEvent(e => events.push(e.type));

      const co = await service.createCustomerOrder(singleMerchantInput());
      const mo = co.merchantOrders[0];
      await service.acceptMerchantOrder(mo.id);
      await service.markMerchantReady(mo.id);
      await service.pickupMerchantOrder(mo.id);
      await service.completeMerchantOrder(mo.id);
      await service.deliverCustomerOrder(co.id);

      expect(events).toContain('CustomerDelivered');
      const tracking = await service.getCustomerTracking(co.id);
      expect(tracking!.status).toBe('COMPLETED');
    });
  });

  // ── Customer Cancellation ──

  describe('Customer cancellation', () => {
    it('cancels customer order and all merchant orders', async () => {
      const co = await service.createCustomerOrder(twoMerchantInput());
      await service.cancelCustomerOrder(co.id);

      const tracking = await service.getCustomerTracking(co.id);
      expect(tracking!.status).toBe('CANCELLED');
    });
  });

  // ── Partial Cancellation ──

  describe('Partial cancellation', () => {
    it('cancels one merchant and keeps others', async () => {
      const co = await service.createCustomerOrder(twoMerchantInput());
      const mo1 = co.merchantOrders[0];
      const mo2 = co.merchantOrders[1];

      await service.cancelMerchantOrder(mo1.id, 'Out of stock');
      await service.acceptMerchantOrder(mo2.id);
      await service.markMerchantReady(mo2.id);

      const route = await service.getDriverRoute(co.id);
      expect(route).toHaveLength(1);
      expect(route[0].merchantOrderId).toBe(mo2.id);
    });
  });

  // ── Mixed Business Types ──

  describe('Mixed business types', () => {
    it('preserves business types on merchant orders', async () => {
      const result = await service.createCustomerOrder(twoMerchantInput());
      expect(result.merchantOrders[0].businessType).toBe('cafe');
      expect(result.merchantOrders[1].businessType).toBe('bakery');
    });
  });

  // ── Tracking ──

  describe('Tracking', () => {
    it('returns null for non-existent order', async () => {
      const tracking = await service.getCustomerTracking('nonexistent');
      expect(tracking).toBeNull();
    });

    it('shows Preparing your order initially', async () => {
      const co = await service.createCustomerOrder(singleMerchantInput());
      const tracking = await service.getCustomerTracking(co.id);
      expect(tracking!.summary).toBe('Preparing your order');
    });
  });
});

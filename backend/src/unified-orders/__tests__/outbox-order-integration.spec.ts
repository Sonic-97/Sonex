import { UnifiedOrdersService } from '../unified-orders.service';
import { TransactionalOutboxService } from '../../outbox/application/transactional-outbox.service';

describe('Unified Orders & Transactional Outbox Integration', () => {
  let service: UnifiedOrdersService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => {
        return cb(mockPrisma);
      }),
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch_100' }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'prod_1',
            name: 'Latte',
            price: 50,
            isRefrigerated: false,
          },
        ]),
      },
      unifiedOrder: {
        create: jest.fn().mockResolvedValue({
          id: 'ord_100',
          code: 'ORD-100',
          cafeId: 'cafe_100',
          branchId: 'branch_100',
          grandTotal: 50,
          channel: 'IN_CAFE',
          source: 'POS_TERMINAL',
        }),
        update: jest.fn().mockResolvedValue({ id: 'ord_100', cafeId: 'cafe_100' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'ord_100',
          code: 'ORD-100',
          cafeId: 'cafe_100',
          branchId: 'branch_100',
          grandTotal: 50,
          items: [],
        }),
      },
      unifiedOrderItem: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      unifiedOrderStatusHistory: {
        create: jest.fn().mockResolvedValue({ id: 'hist_1' }),
      },
      outboxRecord: {
        create: jest.fn().mockResolvedValue({ id: 'outbox_100' }),
      },
      orderCodeCounter: {
        upsert: jest.fn().mockResolvedValue({ counter: 1 }),
      },
    };

    const mockIdempotency = {
      isProcessed: jest.fn().mockResolvedValue({ duplicated: false }),
      record: jest.fn().mockResolvedValue(true),
    };
    const mockInventoryPipeline = {
      reserve: jest.fn().mockResolvedValue({ inventoryReserved: [], refrigeratorDeducted: [] }),
    };
    const mockOrderItems = {
      resolveAndSnapshot: jest.fn().mockResolvedValue({
        snapshots: [{ productId: 'prod_1', quantity: 1, unitPrice: 50, totalPrice: 50 }],
        total: 50,
        subtotal: 50,
        discountTotal: 0,
        productMap: new Map([['prod_1', { name: 'Latte', isRefrigerated: false }]]),
      }),
      createItems: jest.fn().mockResolvedValue(true),
    };

    const mockEventsService = {
      broadcast: jest.fn(),
      emit: jest.fn(),
    };

    const mockDomainEventBus = {
      publish: jest.fn().mockResolvedValue(true),
    };

    service = new UnifiedOrdersService(
      mockPrisma as any,
      mockEventsService as any,
      mockDomainEventBus as any,
      { log: jest.fn() } as any,
      mockIdempotency as any,
      {} as any,
      mockInventoryPipeline as any,
      { createFinancialTransaction: jest.fn() } as any,
      { learn: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      mockOrderItems as any,
      {} as any,
      new TransactionalOutboxService(mockPrisma),
    );
  });

  it('should create unified order and persist OrderCreated outbox event atomically inside the transaction', async () => {
    const dto = {
      items: [{ productId: 'prod_1', quantity: 1 }],
      channel: 'IN_CAFE' as any,
      source: 'POS_TERMINAL' as any,
    };

    const res = await service.create(dto, 'cafe_100', 'branch_100');

    expect(res).toBeDefined();
    expect(mockPrisma.outboxRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'cafe_100',
        branchId: 'branch_100',
        aggregateType: 'UNIFIED_ORDER',
        aggregateId: 'ord_100',
        eventType: 'OrderCreated',
        status: 'PENDING',
      }),
    });
  });
});

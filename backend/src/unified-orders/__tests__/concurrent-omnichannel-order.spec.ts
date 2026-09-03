import { UnifiedOrdersService } from '../unified-orders.service';
import { RunningAccountService } from '../../running-account/application/running-account.service';
import { InventoryPipelineService } from '../../inventory-pipeline/inventory-pipeline.service';
import { RunningAccount } from '../../running-account/domain/running-account.aggregate';
import { UnifiedChannel, UnifiedOrderType, UnifiedPaymentStatus } from '../dto/create-unified-order.dto';
import { Result } from '../../common/result';
import { TransactionalOutboxService } from '../../outbox/application/transactional-outbox.service';

describe('Concurrent Omnichannel Order Ingestion & Credit Validation Test', () => {
  let ordersService: UnifiedOrdersService;
  let runningAccountService: RunningAccountService;
  let inventoryPipeline: InventoryPipelineService;
  let mockPrisma: any;
  let mockEventBus: any;

  const sampleRunningAccount = new RunningAccount({
    id: 'acc_01',
    customerId: 'cust_01',
    branchId: 'branch_01',
    creditLimit: 1000,
    currentBalance: 200,
    maxPaymentDays: 30,
    isBlocked: false,
  });

  beforeEach(() => {
    mockPrisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch_01' }),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cust_01' }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...data })),
      },
      product: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve({
            id: where.id,
            name: 'Generic Product',
            price: 50,
            active: true,
          });
        }),
      },
      unifiedOrder: {
        create: jest.fn().mockImplementation(({ data }) => {
          return Promise.resolve({
            id: `ord_${Date.now()}_${Math.random()}`,
            code: 'ORD-999',
            ...data,
          });
        }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...data })),
        findUnique: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve({
            id: where.id || 'ord_999',
            code: 'ORD-999',
            cafeId: 'cafe_01',
            branchId: 'branch_01',
            items: [],
            statusHistory: [],
          }),
        ),
      },
      unifiedOrderStatusHistory: {
        create: jest.fn().mockResolvedValue({}),
      },
      outboxRecord: {
        create: jest.fn().mockResolvedValue({ id: 'outbox_1' }),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(mockPrisma)),
    };

    mockEventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const mockRunningAccountRepo = {
      findByCustomerId: jest.fn().mockResolvedValue(sampleRunningAccount),
      save: jest.fn().mockImplementation((acc) => Promise.resolve(acc)),
    };

    runningAccountService = new RunningAccountService(mockRunningAccountRepo as any);

    inventoryPipeline = {
      reserve: jest.fn().mockResolvedValue({
        inventoryReserved: [{ id: 'inv_1', quantity: 1 }],
        refrigeratorDeducted: [],
      }),
      reserveStock: jest.fn().mockResolvedValue(Result.ok({ reservationId: 'res_100' })),
      releaseStock: jest.fn().mockResolvedValue(Result.ok(true)),
    } as any;

    const mockOrderItemsService = {
      resolveAndSnapshot: jest.fn().mockResolvedValue({
        snapshots: [],
        total: 100,
        subtotal: 100,
        discountTotal: 0,
        productMap: new Map(),
      }),
      createItems: jest.fn().mockResolvedValue([]),
    };

    ordersService = new UnifiedOrdersService(
      mockPrisma as any,
      { emit: jest.fn(), broadcast: jest.fn() } as any,
      mockEventBus as any,
      { log: jest.fn() } as any,
      { isProcessed: jest.fn().mockResolvedValue({ duplicated: false }), markProcessed: jest.fn() } as any,
      { checkAvailability: jest.fn().mockResolvedValue(true) } as any,
      inventoryPipeline as any,
      { recordJournalEntry: jest.fn(), createFinancialTransaction: jest.fn().mockResolvedValue({}) } as any,
      { recordInteraction: jest.fn(), learn: jest.fn().mockResolvedValue({}) } as any,
      { transitionStatus: jest.fn().mockReturnValue({ isAllowed: true, nextStatus: 'NEW' }) } as any,
      mockOrderItemsService as any,
      { recordPayment: jest.fn() } as any,
      new TransactionalOutboxService(mockPrisma),
    );
  });

  it('should process concurrent orders from WhatsApp AI and Dine-In POS simultaneously', async () => {
    const whatsappOrderDto = {
      items: [{ productId: 'prod_1', quantity: 2 }],
      customerId: 'cust_01',
      customerPhone: '+201000000000',
      channel: UnifiedChannel.WHATSAPP,
      orderType: UnifiedOrderType.DELIVERY,
      paymentStatus: UnifiedPaymentStatus.UNPAID,
    };

    const dineInOrderDto = {
      items: [{ productId: 'prod_2', quantity: 1 }],
      customerId: 'cust_02',
      channel: UnifiedChannel.IN_CAFE,
      orderType: UnifiedOrderType.DINE_IN,
      paymentStatus: UnifiedPaymentStatus.PAID,
    };

    const [resWhatsapp, resDineIn] = await Promise.all([
      ordersService.create(whatsappOrderDto, 'cafe_01', 'branch_01'),
      ordersService.create(dineInOrderDto, 'cafe_01', 'branch_01'),
    ]);

    expect(resWhatsapp).toBeDefined();
    expect(resDineIn).toBeDefined();
    expect(mockPrisma.unifiedOrder.create).toHaveBeenCalledTimes(2);
  });

  it('should validate credit limit for running account orders and reject if credit exceeded', async () => {
    const creditRes = await runningAccountService.validateOrderCredit('cust_01', 'branch_01', 900); // 200 + 900 = 1100 > 1000
    expect(creditRes.isSuccess).toBe(false);
    expect(creditRes.error).toContain('credit limit');
  });

  it('should maintain strict Tier 1 generic core agnosticism with zero vertical terms', () => {
    const dtoFields = Object.keys(UnifiedOrderType);
    expect(dtoFields).not.toContain('BARISTA');
    expect(dtoFields).not.toContain('ESPRESSO');
  });
});

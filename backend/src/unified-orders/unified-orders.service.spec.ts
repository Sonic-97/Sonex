import { Test, TestingModule } from '@nestjs/testing';
import { UnifiedOrdersService } from './unified-orders.service';
import { OrderStatusMachine } from './order-status-machine.service';
import { OrderItemsService } from './order-items.service';
import { OrderPaymentService } from './order-payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../common/idempotency.service';
import { InventoryService } from '../inventory/inventory.service';
import { CustomerLearningService } from '../customer-learning/customer-learning.service';
import { UnifiedFulfillmentStatus } from './dto/update-order-status.dto';
import { Prisma } from '@prisma/client';
import { InventoryPipelineService } from '../inventory-pipeline/inventory-pipeline.service';
import { FinancialEngineService } from '../financial-engine/financial-engine.service';
import { DomainEventBusService } from '../domain-events';

// ── Pure unit tests for OrderStatusMachine ──
describe('OrderStatusMachine', () => {
  let machine: OrderStatusMachine;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrderStatusMachine],
    }).compile();
    machine = module.get<OrderStatusMachine>(OrderStatusMachine);
  });

  it('should allow NEW→CONFIRMED for BARISTA', () => {
    expect(() => machine.validateFulfillmentTransition('NEW', 'CONFIRMED', 'BARISTA', 'IN_CAFE')).not.toThrow();
  });

  it('should allow NEW→CONFIRMED for OWNER', () => {
    expect(() => machine.validateFulfillmentTransition('NEW', 'CONFIRMED', 'OWNER', 'IN_CAFE')).not.toThrow();
  });

  it('should reject NEW→CONFIRMED for DRIVER', () => {
    expect(() => machine.validateFulfillmentTransition('NEW', 'CONFIRMED', 'DRIVER', 'IN_CAFE')).toThrow();
  });

  it('should reject NEW→DELIVERED (skipping states)', () => {
    expect(() => machine.validateFulfillmentTransition('NEW', 'DELIVERED', 'BARISTA', 'IN_CAFE')).toThrow();
  });

  it('should reject transition to same status', () => {
    expect(() => machine.validateFulfillmentTransition('NEW', 'NEW', 'BARISTA')).toThrow();
  });

  it('should allow cancel from NEW', () => {
    expect(() => machine.validateCancelTransition('NEW', 'CANCELLED')).not.toThrow();
  });

  it('should reject cancel from DELIVERED', () => {
    expect(() => machine.validateCancelTransition('DELIVERED', 'CANCELLED')).toThrow();
  });

  it('should allow payment UNPAID→PAID', () => {
    expect(() => machine.validatePaymentTransition('UNPAID', 'PAID')).not.toThrow();
  });

  it('should allow payment PAID→REFUNDED', () => {
    expect(() => machine.validatePaymentTransition('PAID', 'REFUNDED')).not.toThrow();
  });

  it('should reject payment UNPAID→REFUNDED', () => {
    expect(() => machine.validatePaymentTransition('UNPAID', 'REFUNDED')).toThrow();
  });

  it('should return allowed next statuses filtered by role', () => {
    const baristaNext = machine.getAllowedNextStatuses('READY', 'BARISTA', 'IN_CAFE');
    expect(baristaNext).toContain('DELIVERED');
    expect(baristaNext).toContain('PAID');
    expect(baristaNext).not.toContain('PICKED_UP');

    const driverNext = machine.getAllowedNextStatuses('READY', 'DRIVER', 'DELIVERY');
    expect(driverNext).toContain('PICKED_UP');
    expect(driverNext).not.toContain('PAID');
  });

  it('should get timestamp field for status', () => {
    expect(machine.getFulfillmentTimestampField('CONFIRMED')).toBe('confirmedAt');
    expect(machine.getFulfillmentTimestampField('PAID')).toBe('paidAt');
    expect(machine.getFulfillmentTimestampField('UNKNOWN')).toBeNull();
  });
});

// ── OrderItemsService with mock Prisma ──
describe('OrderItemsService', () => {
  let service: OrderItemsService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'prod-1', name: 'Coffee', price: new Prisma.Decimal(10), cafePrice: null, categoryId: 'cat-1', cafeId: 'cafe-1', active: true },
          { id: 'prod-2', name: 'Tea', price: new Prisma.Decimal(8), cafePrice: new Prisma.Decimal(7), categoryId: 'cat-1', cafeId: 'cafe-1', active: true },
        ]),
      },
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        OrderItemsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = mod.get<OrderItemsService>(OrderItemsService);
  });

  it('should resolve and snapshot items', async () => {
    const result = await service.resolveAndSnapshot(
      [
        { productId: 'prod-1', quantity: 2 },
        { productId: 'prod-2', quantity: 1 },
      ],
      'cafe-1',
      'branch-1',
    );

    expect(result.snapshots).toHaveLength(2);
    expect(result.total.toNumber()).toBe(27);
    expect(result.subtotal.toNumber()).toBe(27);
    expect(result.discountTotal.toNumber()).toBe(0);
  });

  it('should use custom unitPrice when provided', async () => {
    const result = await service.resolveAndSnapshot(
      [{ productId: 'prod-1', quantity: 1, unitPrice: 15 }],
      'cafe-1',
      'branch-1',
    );
    expect(result.snapshots[0].unitPrice.toNumber()).toBe(15);
  });

  it('should reject empty items', async () => {
    await expect(service.resolveAndSnapshot([], 'cafe-1', 'branch-1')).rejects.toThrow();
  });

  it('should reject missing products', async () => {
    jest.spyOn(mockPrisma.product, 'findMany').mockResolvedValueOnce([]);
    await expect(
      service.resolveAndSnapshot([{ productId: 'prod-x', quantity: 1 }], 'cafe-1', 'branch-1'),
    ).rejects.toThrow();
  });
});

// ── UnifiedOrdersService with all mocks ──
describe('UnifiedOrdersService', () => {
  let service: UnifiedOrdersService;
  let machine: OrderStatusMachine;
  let mockPrisma: any;
  let mockEvents: any;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    mockPrisma = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }) },
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cust-1', name: 'Test' }),
        upsert: jest.fn().mockResolvedValue({ id: 'cust-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'p1', name: 'Coffee', price: new Prisma.Decimal(10), cafePrice: null, categoryId: 'cat-1', cafeId: 'cafe-1', active: true, isRefrigerated: false },
          { id: 'p2', name: 'Tea', price: new Prisma.Decimal(8), cafePrice: null, categoryId: 'cat-1', cafeId: 'cafe-1', active: true, isRefrigerated: false },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      unifiedOrder: {
        create: jest.fn().mockImplementation((data: any) => ({
          ...data.data,
          id: 'order-1',
          status: 'NEW',
          createdAt: new Date(),
        })),
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          cafeId: 'cafe-1',
          branchId: 'branch-1',
          code: 'UNI-20260715-TEST',
          channel: 'IN_CAFE',
          status: 'NEW',
          version: 1,
          grandTotal: 28,
          amountPaid: 0,
          paymentStatus: 'UNPAID',
          items: [
            { id: 'item-1', productId: 'p1', quantity: 2, unitPrice: new Prisma.Decimal(10), product: { id: 'p1', name: 'Coffee', isRefrigerated: false } },
            { id: 'item-2', productId: 'p2', quantity: 1, unitPrice: new Prisma.Decimal(8), product: { id: 'p2', name: 'Tea', isRefrigerated: false } },
          ],
          statusHistory: [],
          customer: { id: 'cust-1', name: 'Test' },
          branch: { id: 'branch-1', name: 'Main' },
          staff: null,
          driver: null,
          refunds: [],
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation((data: any) => data.data),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      unifiedOrderItem: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      unifiedOrderStatusHistory: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      unifiedRefund: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) },
      staff: { update: jest.fn().mockResolvedValue({}) },
      financialTransaction: { create: jest.fn().mockResolvedValue({}) },
      inventory: { update: jest.fn().mockResolvedValue({}) },
      debt: { update: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue({ customerId: 'cust-1' }) },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(mockPrisma)),
    };

    mockEvents = { emit: jest.fn(), broadcast: jest.fn() };

    moduleRef = await Test.createTestingModule({
      providers: [
        UnifiedOrdersService,
        OrderStatusMachine,
        OrderItemsService,
        OrderPaymentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsService, useValue: mockEvents },
        { provide: AuditService, useValue: { logTransactional: jest.fn() } },
        { provide: IdempotencyService, useValue: { isProcessed: jest.fn().mockResolvedValue({ duplicated: false }), record: jest.fn() } },
        { provide: InventoryService, useValue: { reserveStock: jest.fn().mockResolvedValue(undefined), confirmReservation: jest.fn().mockResolvedValue([]), releaseReservation: jest.fn().mockResolvedValue(undefined) } },
        { provide: InventoryPipelineService, useValue: { reserve: jest.fn().mockResolvedValue({ inventoryReserved: [], refrigeratorDeducted: [] }), confirm: jest.fn().mockResolvedValue({ inventoryConfirmed: [] }), release: jest.fn().mockResolvedValue({ inventoryReleased: [] }) } },
        { provide: FinancialEngineService, useValue: { createFinancialTransaction: jest.fn().mockResolvedValue(undefined), confirmRevenueInTx: jest.fn().mockResolvedValue(undefined) } },
        { provide: CustomerLearningService, useValue: { learn: jest.fn().mockResolvedValue(undefined) } },
        { provide: DomainEventBusService, useValue: { publish: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = moduleRef.get<UnifiedOrdersService>(UnifiedOrdersService);
    machine = moduleRef.get<OrderStatusMachine>(OrderStatusMachine);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(machine).toBeDefined();
  });

  it('should reject create with empty items', async () => {
    await expect(
      service.create({ items: [] } as any, 'cafe-1'),
    ).rejects.toThrow('Order must contain at least one item');
  });

  it('should reject create with no branch', async () => {
    mockPrisma.branch.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.create({ items: [{ productId: 'p1', quantity: 1 }] } as any, 'cafe-1'),
    ).rejects.toThrow('No active branch found');
  });

  it('should create an order successfully', async () => {
    const result = await service.create(
      { items: [{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 1 }] } as any,
      'cafe-1',
    );
    expect(result).toBeDefined();
    expect(mockEvents.emit).toHaveBeenCalled();
  });

  it('should handle idempotent create', async () => {
    const idempotencyService = moduleRef.get<IdempotencyService>(IdempotencyService);
    jest.spyOn(idempotencyService, 'isProcessed').mockResolvedValueOnce({
      duplicated: true,
      entityId: 'existing-order-1',
    });
    mockPrisma.unifiedOrder.findUnique.mockResolvedValueOnce({
      id: 'existing-order-1',
      status: 'NEW',
      items: [],
      statusHistory: [],
    });

    const result = await service.create(
      { items: [{ productId: 'p1', quantity: 1 }], idempotencyKey: 'key-1' } as any,
      'cafe-1',
    );
    expect((result as any).replayed).toBe(true);
  });

  it('should find one order', async () => {
    const result = await service.findOne('order-1', 'cafe-1');
    expect(result).toBeDefined();
    expect(result.id).toBe('order-1');
  });

  it('should reject findOne with wrong cafe', async () => {
    await expect(service.findOne('order-1', 'wrong-cafe')).rejects.toThrow('Unauthorized cafe access');
  });

  it('should update status through valid transitions', async () => {
    const result = await service.updateStatus('order-1', {
      status: UnifiedFulfillmentStatus.CONFIRMED,
      changedById: 'staff-1',
      changedByRole: 'BARISTA',
    }, 'cafe-1');
    expect(result).toBeDefined();
  });

  it('should reject invalid status transition', async () => {
    await expect(service.updateStatus('order-1', {
      status: UnifiedFulfillmentStatus.DELIVERED,
      changedById: 'staff-1',
      changedByRole: 'BARISTA',
    }, 'cafe-1')).rejects.toThrow();
  });

  it('should cancel an order', async () => {
    const result = await service.cancel('order-1', 'cafe-1', 'Test cancel', 'CANCELLED', 'staff-1');
    expect(result).toBeDefined();
  });

  it('should find all orders with filters', async () => {
    const result = await service.findAll({ cafeId: 'cafe-1', channel: 'IN_CAFE' });
    expect(Array.isArray(result)).toBe(true);
  });

  it('should get barista queue', async () => {
    const result = await service.getBaristaQueue('cafe-1');
    expect(Array.isArray(result)).toBe(true);
  });

  it('should get driver queue', async () => {
    const result = await service.getDriverQueue('cafe-1');
    expect(Array.isArray(result)).toBe(true);
  });
});

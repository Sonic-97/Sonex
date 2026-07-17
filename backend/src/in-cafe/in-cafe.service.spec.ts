import { Test, TestingModule } from '@nestjs/testing';
import { InCafeService } from './in-cafe.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryPipelineService } from '../inventory-pipeline/inventory-pipeline.service';
import { FinancialEngineService } from '../financial-engine/financial-engine.service';
import { IdempotencyService } from '../common/idempotency.service';
import { AuditService } from '../audit/audit.service';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';

describe('InCafeService', () => {
  let service: InCafeService;
  let prisma: any;
  let audit: any;
  let pipeline: any;
  let events: any;

  const mockIdempotency = {
    isProcessed: jest.fn().mockResolvedValue({ duplicated: false }),
    record: jest.fn().mockResolvedValue(undefined),
  };

  const mockFinancial = {
    createFinancialTransaction: jest.fn().mockResolvedValue(undefined),
  };

  const mockInventory = {
    release: jest.fn().mockResolvedValue(undefined),
  };

  const mockTx = (overrides: any = {}) => {
    const tx = {
      inCafeOrder: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      inCafeOrderItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      product: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      staff: {
        update: jest.fn().mockResolvedValue({}),
      },
      financialTransaction: {
        create: jest.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      ...overrides,
    };
    return tx;
  };

  const mockOrder = (overrides: any = {}) => ({
    id: 'order-1',
    code: 'CF-20260711-0001',
    cafeId: 'cafe-1',
    branchId: 'branch-1',
    customerName: 'Test Customer',
    customerPhone: null,
    customerId: null,
    notes: null,
    createdById: 'staff-1',
    status: 'NEW',
    isPaid: false,
    paymentStatus: 'NOT_PAID',
    paymentMethod: null,
    total: 50,
    paidAmount: 0,
    remainingBalance: 50,
    paymentTimestamp: null,
    voidReason: null,
    orderType: 'DINE_IN',
    tableNumber: null,
    employeeId: null,
    sourceType: 'INSIDE_CAFE',
    stockDeducted: false,
    isRevenueConfirmed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        quantity: 2,
        unitPrice: 25,
        notes: null,
        selectedOptions: [],
        product: { id: 'prod-1', name: 'Coffee', price: 25, cafePrice: null, isRefrigerated: false, refrigeratorInventoryId: null },
      },
    ],
    createdBy: { id: 'staff-1', name: 'Barista', role: 'BARISTA' },
    priceOverrides: [],
    ...overrides,
  });

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InCafeService,
        { provide: PrismaService, useValue: { $transaction: jest.fn() } },
        { provide: EventsService, useValue: { emit: jest.fn(), emitToOwner: jest.fn(), emitToBarista: jest.fn() } },
        { provide: InventoryService, useValue: mockInventory },
        { provide: InventoryPipelineService, useValue: { reserve: jest.fn(), release: jest.fn() } },
        { provide: FinancialEngineService, useValue: mockFinancial },
        { provide: IdempotencyService, useValue: mockIdempotency },
        { provide: AuditService, useValue: { logTransactional: jest.fn(), logAction: jest.fn(), search: jest.fn() } },
      ],
    }).compile();

    service = module.get<InCafeService>(InCafeService);
    prisma = module.get(PrismaService);
    audit = module.get(AuditService);
    pipeline = module.get(InventoryPipelineService);
    events = module.get(EventsService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── CANCEL ORDER ──

  describe('cancelOrder', () => {
    it('should cancel a NEW order', async () => {
      const order = mockOrder({ status: 'NEW', stockDeducted: true });
      prisma.inCafeOrder = {
        findUnique: jest.fn().mockResolvedValue(order),
      };
      prisma.$transaction = jest.fn((cb: any) => {
        const tx = mockTx();
        tx.inCafeOrder.update = jest.fn().mockResolvedValue({ ...order, status: 'VOID', voidReason: 'Customer changed mind' });
        return cb(tx);
      });

      const result = await service.cancelOrder('order-1', { reason: 'Customer changed mind' }, 'staff-1', 'cafe-1');
      expect(result.status).toBe('VOID');
      expect(pipeline.release).toHaveBeenCalled();
      expect(audit.logTransactional).toHaveBeenCalled();
    });

    it('should reject cancel for non-NEW order', async () => {
      const order = mockOrder({ status: 'PREPARING' });
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      await expect(service.cancelOrder('order-1', { reason: 'test' }, 'staff-1', 'cafe-1'))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject cancel for voided order', async () => {
      const order = mockOrder({ status: 'VOID' });
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      await expect(service.cancelOrder('order-1', { reason: 'test' }, 'staff-1', 'cafe-1'))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject cancel when cafe does not match', async () => {
      const order = mockOrder({ cafeId: 'cafe-2' });
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      await expect(service.cancelOrder('order-1', { reason: 'test' }, 'staff-1', 'cafe-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  // ── HOLD ORDER ──

  describe('holdOrder', () => {
    it('should hold a NEW order', async () => {
      const order = mockOrder({ status: 'NEW' });
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      prisma.$transaction = jest.fn((cb: any) => {
        const tx = mockTx();
        tx.inCafeOrder.update = jest.fn().mockResolvedValue({ ...order, status: 'ON_HOLD' });
        return cb(tx);
      });

      const result = await service.holdOrder('order-1', {}, 'cafe-1');
      expect(result.status).toBe('ON_HOLD');
      expect(audit.logTransactional).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'ORDER_HELD' }));
    });

    it('should hold a PREPARING order', async () => {
      const order = mockOrder({ status: 'PREPARING' });
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      prisma.$transaction = jest.fn((cb: any) => {
        const tx = mockTx();
        tx.inCafeOrder.update = jest.fn().mockResolvedValue({ ...order, status: 'ON_HOLD' });
        return cb(tx);
      });

      const result = await service.holdOrder('order-1', { reason: 'Waiting for ingredient' }, 'cafe-1');
      expect(result.status).toBe('ON_HOLD');
    });

    it('should reject hold for already held order', async () => {
      const order = mockOrder({ status: 'ON_HOLD' });
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      await expect(service.holdOrder('order-1', {}, 'cafe-1'))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject hold for COMPLETED order', async () => {
      const order = mockOrder({ status: 'COMPLETED' });
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      await expect(service.holdOrder('order-1', {}, 'cafe-1'))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ── RESUME HELD ORDER ──

  describe('resumeHeldOrder', () => {
    it('should resume a held order to PREPARING', async () => {
      const order = mockOrder({ status: 'ON_HOLD' });
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      prisma.$transaction = jest.fn((cb: any) => {
        const tx = mockTx();
        tx.inCafeOrder.update = jest.fn().mockResolvedValue({ ...order, status: 'PREPARING' });
        return cb(tx);
      });

      const result = await service.resumeHeldOrder('order-1', 'cafe-1');
      expect(result.status).toBe('PREPARING');
      expect(audit.logTransactional).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'ORDER_RESUMED' }));
    });

    it('should reject resume for non-held order', async () => {
      const order = mockOrder({ status: 'NEW' });
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      await expect(service.resumeHeldOrder('order-1', 'cafe-1'))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ── EDIT ORDER ──

  describe('editOrder', () => {
    it('should edit items of a NEW order', async () => {
      const order = mockOrder({ status: 'NEW' });
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      prisma.product = { findMany: jest.fn().mockResolvedValue([{ id: 'prod-1', name: 'Coffee', price: 30, cafePrice: null, isRefrigerated: false }]) };
      prisma.productOption = { findMany: jest.fn().mockResolvedValue([]) };
      prisma.$transaction = jest.fn((cb: any) => {
        const tx = mockTx();
        tx.inCafeOrder.update = jest.fn().mockResolvedValue({ ...order, total: 60, remainingBalance: 60 });
        tx.inCafeOrderItem.createMany = jest.fn().mockResolvedValue({ count: 1 });
        pipeline.reserve = jest.fn().mockResolvedValue({ inventoryReserved: [{ inventoryId: 'inv-1' }], refrigeratorDeducted: [] });
        return cb(tx);
      });

      const result = await service.editOrder('order-1', {
        items: [{ productId: 'prod-1', quantity: 2, unitPrice: 30 }],
        reason: 'Customer wanted extra',
      }, 'staff-1', 'cafe-1');

      expect(result.total).toBe(60);
      expect(audit.logTransactional).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'ORDER_EDITED' }));
    });

    it('should reject edit of paid order', async () => {
      const order = mockOrder({ status: 'NEW', paymentStatus: 'PAID', isPaid: true });
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      await expect(service.editOrder('order-1', { items: [{ productId: 'prod-1', quantity: 1 }] }, 'staff-1', 'cafe-1'))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject edit of voided order', async () => {
      const order = mockOrder({ status: 'VOID' });
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      await expect(service.editOrder('order-1', { items: [{ productId: 'prod-1', quantity: 1 }] }, 'staff-1', 'cafe-1'))
        .rejects.toThrow(BadRequestException);
    });

    it('should release old inventory and reserve new on edit', async () => {
      const order = mockOrder({ status: 'NEW', stockDeducted: true });
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      prisma.product = { findMany: jest.fn().mockResolvedValue([{ id: 'prod-1', name: 'Coffee', price: 25, cafePrice: null, isRefrigerated: false }]) };
      prisma.productOption = { findMany: jest.fn().mockResolvedValue([]) };
      prisma.$transaction = jest.fn((cb: any) => {
        const tx = mockTx();
        tx.inCafeOrder.update = jest.fn().mockResolvedValue({ ...order, total: 25, remainingBalance: 25 });
        pipeline.reserve = jest.fn().mockResolvedValue({ inventoryReserved: [], refrigeratorDeducted: [] });
        return cb(tx);
      });

      await service.editOrder('order-1', { items: [{ productId: 'prod-1', quantity: 1 }] }, 'staff-1', 'cafe-1');
      expect(pipeline.release).toHaveBeenCalledWith('order-1', expect.anything());
      expect(pipeline.reserve).toHaveBeenCalled();
    });
  });

  // ── UPDATE ORDER NOTE ──

  describe('updateOrderNote', () => {
    it('should update notes', async () => {
      const order = { id: 'order-1', cafeId: 'cafe-1', notes: null };
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      prisma.$transaction = jest.fn((cb: any) => {
        const tx = mockTx();
        tx.inCafeOrder.update = jest.fn().mockResolvedValue({ id: 'order-1', notes: 'New note' });
        return cb(tx);
      });

      const result = await service.updateOrderNote('order-1', { notes: 'New note' }, 'cafe-1');
      expect(result.notes).toBe('New note');
      expect(audit.logTransactional).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'NOTE_UPDATED' }));
    });
  });

  // ── ASSIGN CUSTOMER ──

  describe('assignCustomer', () => {
    it('should assign customer to order', async () => {
      const order = { id: 'order-1', cafeId: 'cafe-1', customerId: null, customerName: 'Walk-in', customerPhone: null };
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      prisma.$transaction = jest.fn((cb: any) => {
        const tx = mockTx();
        tx.inCafeOrder.update = jest.fn().mockResolvedValue({ ...order, customerName: 'Ahmed', customerPhone: '0100000000' });
        return cb(tx);
      });

      const result = await service.assignCustomer('order-1', { customerName: 'Ahmed', customerPhone: '0100000000' }, 'cafe-1');
      expect(result.customerName).toBe('Ahmed');
      expect(audit.logTransactional).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'CUSTOMER_ASSIGNED' }));
    });
  });

  // ── REPRINT RECEIPT ──

  describe('reprintReceipt', () => {
    it('should return receipt data for a found order', async () => {
      const order = mockOrder({ isPaid: true, paymentMethod: 'CASH', paidAmount: 50 });
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };

      const receipt = await service.reprintReceipt('order-1', 'cafe-1');
      expect(receipt.receiptNumber).toBe('CF-20260711-0001');
      expect(receipt.items).toHaveLength(1);
      expect(receipt.subtotal).toBe(50);
      expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'RECEIPT_REPRINTED' }));
    });

    it('should throw if order not found', async () => {
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(null) };
      await expect(service.reprintReceipt('nonexistent', 'cafe-1'))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ── ORDER HISTORY ──

  describe('getOrderHistory', () => {
    it('should return audit entries for the order', async () => {
      const order = { id: 'order-1', cafeId: 'cafe-1', code: 'CF-001' };
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      audit.search = jest.fn().mockResolvedValue({
        total: 2,
        data: [
          { id: 'log-1', action: 'ORDER_CREATED', createdAt: new Date() },
          { id: 'log-2', action: 'ORDER_STATUS_UPDATED', createdAt: new Date() },
        ],
      });

      const result = await service.getOrderHistory('order-1', 'cafe-1');
      expect(result.orderCode).toBe('CF-001');
      expect(result.totalEntries).toBe(2);
      expect(result.entries).toHaveLength(2);
    });
  });

  // ── ORDER STATUS TRANSITIONS (including ON_HOLD) ──

  describe('updateOrderStatus with ON_HOLD support', () => {
    it('should transition NEW -> ON_HOLD', async () => {
      const order = mockOrder({ status: 'NEW' });
      prisma.inCafeOrder = {
        findUnique: jest.fn().mockResolvedValue(order),
      };
      prisma.$transaction = jest.fn((cb: any) => {
        const tx = mockTx();
        tx.inCafeOrder.update = jest.fn().mockResolvedValue({ ...order, status: 'ON_HOLD' });
        return cb(tx);
      });

      const result = await service.updateOrderStatus('order-1', { status: 'ON_HOLD' }, 'cafe-1');
      expect(result.status).toBe('ON_HOLD');
      expect(audit.logTransactional).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'ORDER_STATUS_UPDATED' }));
    });

    it('should transition ON_HOLD -> PREPARING', async () => {
      const order = mockOrder({ status: 'ON_HOLD' });
      prisma.inCafeOrder = {
        findUnique: jest.fn().mockResolvedValue(order),
      };
      prisma.$transaction = jest.fn((cb: any) => {
        const tx = mockTx();
        tx.inCafeOrder.update = jest.fn().mockResolvedValue({ ...order, status: 'PREPARING' });
        return cb(tx);
      });

      const result = await service.updateOrderStatus('order-1', { status: 'PREPARING' }, 'cafe-1');
      expect(result.status).toBe('PREPARING');
    });

    it('should reject invalid transition NEW -> DELIVERED', async () => {
      const order = mockOrder({ status: 'NEW' });
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      await expect(service.updateOrderStatus('order-1', { status: 'DELIVERED' }, 'cafe-1'))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ── KITCHEN ORDERS ──

  describe('getKitchenOrders', () => {
    it('should return active kitchen orders (NEW, PREPARING, ON_HOLD)', async () => {
      const kitchenOrders = [
        mockOrder({ status: 'NEW' }),
        mockOrder({ status: 'PREPARING', id: 'order-2' }),
        mockOrder({ status: 'ON_HOLD', id: 'order-3' }),
      ];
      prisma.inCafeOrder = { findMany: jest.fn().mockResolvedValue(kitchenOrders) };

      const result = await service.getKitchenOrders('cafe-1');
      expect(result).toHaveLength(3);
      expect(prisma.inCafeOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: ['NEW', 'PREPARING', 'ON_HOLD'] } }),
        })
      );
    });
  });

  // ── VOID ORDER (existing, verify audit added) ──

  describe('voidOrder (existing)', () => {
    it('should void and audit log', async () => {
      const order = mockOrder({ status: 'PREPARING', isPaid: true, paymentMethod: 'CASH', paidAmount: 50 });
      prisma.inCafeOrder = { findUnique: jest.fn().mockResolvedValue(order) };
      prisma.$transaction = jest.fn((cb: any) => {
        const tx = mockTx();
        tx.inCafeOrder.update = jest.fn().mockResolvedValue({ ...order, status: 'VOID', voidReason: 'test' });
        return cb(tx);
      });

      const result = await service.voidOrder('order-1', 'test', 'staff-1', 'cafe-1');
      expect(result.status).toBe('VOID');
      expect(audit.logTransactional).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'PAYMENT_VOID' }));
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { FinancialEngineService } from './financial-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditService } from '../audit/audit.service';
import { InventoryPipelineService } from '../inventory-pipeline/inventory-pipeline.service';
import { DomainEventBusService } from '../domain-events';
import { ProcessPaymentInput, ProcessRefundInput, SettleDebtInput } from './dto/financial-engine.dto';

describe('FinancialEngineService', () => {
  let service: FinancialEngineService;
  let mockPrisma: any;
  let mockTx: any;
  let mockEvents: any;
  let mockAudit: any;
  let mockInventoryPipeline: any;

  beforeEach(async () => {
    const baseTx = {
      paymentLog: { create: jest.fn().mockResolvedValue({}) },
      financialTransaction: { create: jest.fn().mockResolvedValue({}) },
      staff: { update: jest.fn().mockResolvedValue({}) },
      customer: { update: jest.fn().mockResolvedValue({}) },
      debt: { create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) },
      dailyRevenue: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) },
      unifiedRefund: { create: jest.fn().mockResolvedValue({ id: 'refund-1' }) },
      product: { findUnique: jest.fn().mockResolvedValue(null) },
      recipeIngredient: { findMany: jest.fn().mockResolvedValue([]) },
      order: { count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _sum: { total: 0 } }) },
      attendance: { findMany: jest.fn().mockResolvedValue([]) },
      orderItem: { count: jest.fn().mockResolvedValue(0) },
      expense: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
      unifiedOrderItem: { findMany: jest.fn().mockResolvedValue([]) },
    };

    mockTx = (overrides: Record<string, any> = {}) => {
      const merged: Record<string, any> = {};
      for (const key of new Set([...Object.keys(baseTx), ...Object.keys(overrides)])) {
        merged[key] = { ...baseTx[key], ...overrides[key] };
      }
      return merged;
    };

    mockPrisma = {
      $transaction: jest.fn((cb: (tx: any) => any) => cb(mockTx())),
      debt: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      unifiedOrder: { findUnique: jest.fn().mockResolvedValue(null) },
      product: { findUnique: jest.fn().mockResolvedValue(null) },
      recipeIngredient: { findMany: jest.fn().mockResolvedValue([]) },
      dailyRevenue: { findFirst: jest.fn().mockResolvedValue(null) },
      order: { aggregate: jest.fn().mockResolvedValue({ _sum: { total: 0 } }), count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      inCafeOrder: { aggregate: jest.fn().mockResolvedValue({ _sum: { total: 0 } }), count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      expense: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
      attendance: { findMany: jest.fn().mockResolvedValue([]) },
      orderItem: { count: jest.fn().mockResolvedValue(0) },
    };

    mockEvents = { emit: jest.fn() };
    mockAudit = { logTransactional: jest.fn() };
    mockInventoryPipeline = { release: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialEngineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsService, useValue: mockEvents },
        { provide: AuditService, useValue: mockAudit },
        { provide: InventoryPipelineService, useValue: mockInventoryPipeline },
        { provide: DomainEventBusService, useValue: { publish: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<FinancialEngineService>(FinancialEngineService);
  });

  // ── PROCESS PAYMENT ──

  describe('processPayment', () => {
    const baseInput: ProcessPaymentInput = {
      cafeId: 'cafe-1',
      branchId: 'branch-1',
      orderId: 'order-1',
      orderCode: 'ORD-001',
      orderType: 'delivery',
      total: 100,
      previousAmountPaid: 0,
      previousPaymentStatus: 'UNPAID',
      collectedAmount: 100,
      paymentStatus: 'PAID',
      paymentMethod: 'CASH',
      collectedById: 'staff-1',
      collectedRole: 'BARISTA',
      customerId: 'cust-1',
      notes: 'Full payment',
    };

    it('should process a full cash payment correctly', async () => {
      const paymentTx = mockTx();
      mockPrisma.$transaction.mockImplementationOnce((cb: any) => cb(paymentTx));

      const result = await service.processPayment(baseInput);

      expect(result.paymentStatus).toBe('PAID');
      expect(result.amountPaid).toBe(100);
      expect(result.remainingAmount).toBe(0);
      expect(paymentTx.paymentLog.create).toHaveBeenCalled();
      expect(paymentTx.financialTransaction.create).toHaveBeenCalled();
      expect(paymentTx.staff.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'staff-1' }, data: { currentCashWallet: { increment: expect.anything() } } }),
      );
    });

    it('should process a card payment without cash wallet update', async () => {
      const cardInput = { ...baseInput, paymentMethod: 'CARD' };
      const paymentTx = mockTx();
      mockPrisma.$transaction.mockImplementationOnce((cb: any) => cb(paymentTx));

      const result = await service.processPayment(cardInput);

      expect(result.paymentStatus).toBe('PAID');
      expect(paymentTx.staff.update).not.toHaveBeenCalled();
      expect(paymentTx.financialTransaction.create).toHaveBeenCalled();
    });

    it('should handle partial payment and create debt', async () => {
      const partialInput = { ...baseInput, collectedAmount: 60, paymentStatus: 'PARTIAL_PAYMENT' };
      const paymentTx = mockTx();
      mockPrisma.$transaction.mockImplementationOnce((cb: any) => cb(paymentTx));

      const result = await service.processPayment(partialInput);

      expect(result.paymentStatus).toBe('PARTIAL_PAYMENT');
      expect(result.amountPaid).toBe(60);
      expect(result.remainingAmount).toBe(40);
      expect(paymentTx.debt.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amount: expect.anything() }) }),
      );
    });

    it('should handle split payments with multiple transactions', async () => {
      const splitInput = {
        ...baseInput,
        paymentMethod: 'SPLIT',
        splitPayments: [
          { method: 'CASH' as any, amount: 50 },
          { method: 'CARD' as any, amount: 50 },
        ],
      };
      const paymentTx = mockTx();
      mockPrisma.$transaction.mockImplementationOnce((cb: any) => cb(paymentTx));

      const result = await service.processPayment(splitInput);

      expect(result.paymentStatus).toBe('PAID');
      expect(paymentTx.financialTransaction.create).toHaveBeenCalledTimes(3);
    });

    it('should return early when no new amount is paid', async () => {
      const noPayInput = { ...baseInput, collectedAmount: 0, previousAmountPaid: 0 };
      const result = await service.processPayment(noPayInput);

      expect(result.paymentStatus).toBe('PAID');
      expect(result.remainingAmount).toBe(100);
    });

    it('should emit payment events after processing', async () => {
      const paymentTx = mockTx();
      mockPrisma.$transaction.mockImplementationOnce((cb: any) => cb(paymentTx));

      await service.processPayment(baseInput);

      expect(mockEvents.emit).toHaveBeenCalledWith('payment.updated', expect.any(Object));
      expect(mockEvents.emit).toHaveBeenCalledWith('payment.collected', expect.any(Object));
    });

    it('should emit payment.pending for partial payments', async () => {
      const partialInput = { ...baseInput, collectedAmount: 30, paymentStatus: 'PARTIAL_PAYMENT' };
      const paymentTx = mockTx();
      mockPrisma.$transaction.mockImplementationOnce((cb: any) => cb(paymentTx));

      await service.processPayment(partialInput);

      expect(mockEvents.emit).toHaveBeenCalledWith('payment.pending', expect.any(Object));
    });
  });

  // ── PROCESS REFUND ──

  describe('processRefund', () => {
    it('should throw NotFoundException when order is not found', async () => {
      mockPrisma.unifiedOrder.findUnique.mockResolvedValue(null);

      await expect(service.processRefund({
        cafeId: 'cafe-1',
        branchId: 'branch-1',
        orderId: 'order-1',
        refundAmount: 50,
        reason: 'Customer request',
      })).rejects.toThrow('Order not found');
    });

    it('should throw BadRequestException when refund exceeds paid amount', async () => {
      mockPrisma.unifiedOrder.findUnique.mockResolvedValue({
        cafeId: 'cafe-1',
        paymentStatus: 'PAID',
        amountPaid: 30,
        grandTotal: 100,
        branchId: 'branch-1',
      });

      await expect(service.processRefund({
        cafeId: 'cafe-1',
        branchId: 'branch-1',
        orderId: 'order-1',
        refundAmount: 50,
        reason: 'Over refund',
      })).rejects.toThrow('Refund amount exceeds amount paid');
    });

    it('should process a full refund and restore inventory', async () => {
      mockPrisma.unifiedOrder.findUnique.mockResolvedValue({
        cafeId: 'cafe-1',
        paymentStatus: 'PAID',
        amountPaid: 100,
        grandTotal: 100,
        branchId: 'branch-1',
      });

      const refundTx = mockTx({
        unifiedRefund: { create: jest.fn().mockResolvedValue({ id: 'refund-1' }) },
      });
      mockPrisma.$transaction.mockImplementationOnce((cb: any) => cb(refundTx));

      const result = await service.processRefund({
        cafeId: 'cafe-1',
        branchId: 'branch-1',
        orderId: 'order-1',
        refundAmount: 100,
        reason: 'Full refund',
        restoreInventory: true,
      });

      expect(result.refundId).toBe('refund-1');
      expect(result.newAmountPaid).toBe(0);
      expect(result.newPaymentStatus).toBe('REFUNDED');
      expect(result.inventoryRestored).toBe(true);
      expect(refundTx.financialTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'refund', amount: expect.anything() }) }),
      );
      expect(mockInventoryPipeline.release).toHaveBeenCalledWith('order-1', refundTx);
    });

    it('should process a partial refund', async () => {
      mockPrisma.unifiedOrder.findUnique.mockResolvedValue({
        cafeId: 'cafe-1',
        paymentStatus: 'PAID',
        amountPaid: 100,
        grandTotal: 100,
        branchId: 'branch-1',
      });

      const refundTx = mockTx();
      mockPrisma.$transaction.mockImplementationOnce((cb: any) => cb(refundTx));

      const result = await service.processRefund({
        cafeId: 'cafe-1',
        branchId: 'branch-1',
        orderId: 'order-1',
        refundAmount: 30,
        reason: 'Partial refund',
      });

      expect(result.newAmountPaid).toBe(70);
      expect(result.newPaymentStatus).toBe('PARTIALLY_REFUNDED');
    });
  });

  // ── SETTLE DEBT ──

  describe('settleDebt', () => {
    it('should throw NotFoundException when debt is not found', async () => {
      mockPrisma.debt.findUnique.mockResolvedValue(null);

      await expect(service.settleDebt({
        debtId: 'debt-1',
        cafeId: 'cafe-1',
        settledById: 'staff-1',
      })).rejects.toThrow('Debt not found');
    });

    it('should settle a debt and update customer balance', async () => {
      mockPrisma.debt.findUnique.mockResolvedValue({
        id: 'debt-1',
        cafeId: 'cafe-1',
        customerId: 'cust-1',
        amount: 50,
      });

      const settleTx = mockTx();
      mockPrisma.$transaction.mockImplementationOnce((cb: any) => cb(settleTx));

      const result = await service.settleDebt({
        debtId: 'debt-1',
        cafeId: 'cafe-1',
        settledById: 'staff-1',
      });

      expect(settleTx.debt.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'debt-1' }, data: expect.objectContaining({ settled: true }) }),
      );
      expect(settleTx.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cust-1' } }),
      );
      expect(mockAudit.logTransactional).toHaveBeenCalled();
      expect(mockEvents.emit).toHaveBeenCalledWith('debt.settled', expect.any(Object));
    });

    it('should settle with custom amount', async () => {
      mockPrisma.debt.findUnique.mockResolvedValue({
        id: 'debt-1',
        cafeId: 'cafe-1',
        customerId: 'cust-1',
        amount: 100,
      });

      const settleTx = mockTx();
      mockPrisma.$transaction.mockImplementationOnce((cb: any) => cb(settleTx));

      await service.settleDebt({
        debtId: 'debt-1',
        cafeId: 'cafe-1',
        settledById: 'staff-1',
        settleAmount: 80,
      });

      expect(settleTx.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { unpaidBalance: { decrement: 80 } } }),
      );
    });
  });

  // ── UNIFIED DEBT OVERVIEW ──

  describe('getUnifiedDebtOverview', () => {
    it('should return empty overview when no debts exist', async () => {
      mockPrisma.debt.findMany.mockResolvedValue([]);
      mockPrisma.inCafeOrder.findMany.mockResolvedValue([]);
      mockPrisma.order.findMany.mockResolvedValue([]);
      const result = await service.getUnifiedDebtOverview('cafe-1');

      expect(result.customers).toEqual([]);
      expect(result.totalOutstanding).toBe(0);
      expect(result.customerCount).toBe(0);
    });

    it('should aggregate debts, in-cafe, and delivery orders', async () => {
      mockPrisma.debt.findMany.mockResolvedValue([
        { id: 'debt-1', customerId: 'cust-1', customer: { name: 'Ahmed', phone: '0100' }, amount: 50, settled: false, createdAt: new Date() },
      ]);
      mockPrisma.inCafeOrder.findMany.mockResolvedValue([]);
      mockPrisma.order.findMany.mockResolvedValue([
        { id: 'order-1', customerId: 'cust-1', customer: { name: 'Ahmed', phone: '0100' }, total: 100, amountPaid: 30 },
      ]);

      const result = await service.getUnifiedDebtOverview('cafe-1');

      expect(result.customerCount).toBe(1);
      expect(result.totalOutstanding).toBe(120);
    });
  });

  // ── PRODUCT PROFITABILITY ──

  describe('calculateProductProfitability', () => {
    it('should throw NotFoundException when product not found or cafe mismatch', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await expect(service.calculateProductProfitability('prod-1', 'cafe-1'))
        .rejects.toThrow('Product not found');
    });

    it('should calculate profitability for a product with recipe', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-1', cafeId: 'cafe-1', name: 'Espresso', price: 30, cost: 10,
      });
      mockPrisma.recipeIngredient.findMany.mockResolvedValue([
        {
          productId: 'prod-1', quantity: 10, unit: 'g',
          inventory: { costPerUnit: 0.5, unit: 'g', itemName: 'Coffee Beans' },
        },
      ]);

      const result = await service.calculateProductProfitability('prod-1', 'cafe-1');

      expect(result.productId).toBe('prod-1');
      expect(result.productName).toBe('Espresso');
      expect(result.sellingPrice).toBe(30);
      expect(result.ingredientCost).toBe(5);
    });

    it('should return zero costs when no data exists', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-1', cafeId: 'cafe-1', name: 'Test', price: 20, cost: 0,
      });

      const result = await service.calculateProductProfitability('prod-1', 'cafe-1');

      expect(result.ingredientCost).toBe(0);
      expect(result.laborCost).toBe(0);
      expect(result.estimatedCost).toBe(0);
      expect(result.estimatedProfit).toBe(20);
      expect(result.profitMargin).toBe(100);
    });
  });

  // ── REVENUE ──

  describe('confirmRevenue', () => {
    it('should create daily revenue record if none exists', async () => {
      const revenueTx = mockTx();
      mockPrisma.$transaction.mockImplementationOnce((cb: any) => cb(revenueTx));

      await service.confirmRevenue('order-1', 'cafe-1', 100, 20);

      expect(revenueTx.dailyRevenue.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cafeId: 'cafe-1', totalRevenue: expect.anything(), totalProfit: expect.anything(), totalOrders: 1 }) }),
      );
    });

    it('should update existing daily revenue', async () => {
      const revenueTx = mockTx({
        dailyRevenue: {
          findFirst: jest.fn().mockResolvedValue({ id: 'daily-1', totalRevenue: 500, totalProfit: 100, totalOrders: 5 }),
        },
      });
      mockPrisma.$transaction.mockImplementationOnce((cb: any) => cb(revenueTx));

      await service.confirmRevenue('order-1', 'cafe-1', 100, 20);

      expect(revenueTx.dailyRevenue.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'daily-1' } }),
      );
    });
  });

  describe('rollbackRevenue', () => {
    it('should decrement daily revenue', async () => {
      const rbTx = mockTx({
        dailyRevenue: {
          findFirst: jest.fn().mockResolvedValue({ id: 'daily-1', totalRevenue: 500, totalOrders: 5 }),
        },
      });
      mockPrisma.$transaction.mockImplementationOnce((cb: any) => cb(rbTx));

      await service.rollbackRevenue('order-1', 'cafe-1', 100);

      expect(rbTx.dailyRevenue.update).toHaveBeenCalled();
    });

    it('should not update if no daily record exists', async () => {
      const rbTx = mockTx();
      mockPrisma.$transaction.mockImplementationOnce((cb: any) => cb(rbTx));

      await service.rollbackRevenue('order-1', 'cafe-1', 100);

      expect(rbTx.dailyRevenue.update).not.toHaveBeenCalled();
    });
  });

  // ── SALES SUMMARY ──

  describe('getSalesSummary', () => {
    it('should return zero values when no orders exist', async () => {
      const result = await service.getSalesSummary('cafe-1');
      expect(result.totalRevenue).toBe(0);
      expect(result.totalOrders).toBe(0);
      expect(result.avgOrderValue).toBe(0);
    });

    it('should aggregate order and in-cafe revenue', async () => {
      mockPrisma.order.aggregate.mockResolvedValue({ _sum: { total: 1000 } });
      mockPrisma.inCafeOrder.aggregate.mockResolvedValue({ _sum: { total: 500 } });
      mockPrisma.order.count.mockResolvedValue(5);
      mockPrisma.inCafeOrder.count.mockResolvedValue(3);

      const result = await service.getSalesSummary('cafe-1');

      expect(result.totalRevenue).toBe(1500);
      expect(result.totalOrders).toBe(8);
      expect(result.avgOrderValue).toBe(187.5);
    });
  });

  // ── PROFIT SUMMARY ──

  describe('getProfitSummary', () => {
    it('should calculate profit correctly', async () => {
      mockPrisma.order.aggregate.mockResolvedValue({ _sum: { total: 1000, profit: 200 } });
      mockPrisma.inCafeOrder.aggregate.mockResolvedValue({ _sum: { total: 500, totalCost: 300 } });
      mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 100 } });

      const result = await service.getProfitSummary('cafe-1');

      expect(result.totalRevenue).toBe(1500);
      expect(result.grossProfit).toBe(400);
      expect(result.totalExpenses).toBe(100);
      expect(result.netProfit).toBe(300);
      expect(result.profitMargin).toBeCloseTo(26.67, 1);
    });
  });
});

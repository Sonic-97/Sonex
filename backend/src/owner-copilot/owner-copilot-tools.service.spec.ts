import { OwnerCopilotToolsService } from './owner-copilot-tools.service';
import { OwnerCopilotScope, OwnerResolvedDateRange } from './owner-copilot.types';

const paidOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-1', branchId: 'branch-1', status: 'DELIVERED', paymentStatus: 'PAID',
  grandTotal: 120, amountPaid: 120, isRevenueConfirmed: true,
  createdAt: new Date('2026-07-13T08:00:00Z'), customerId: 'customer-1',
  employeeId: 'staff-1', driverId: 'driver-1', deliveredAt: new Date('2026-07-13T08:30:00Z'),
  source: 'DELIVERY',
  items: [{ productId: 'p1', quantity: 2, unitPrice: 60, product: { name: 'لاتيه', category: 'coffee', cost: 25, price: 60 } }],
  ...overrides,
});

const makePrisma = () => ({
  order: { findMany: jest.fn(), findFirst: jest.fn() },
  unifiedOrder: { findMany: jest.fn().mockResolvedValue([paidOrder()]), findFirst: jest.fn().mockResolvedValue(null) },
  inCafeOrder: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
  expense: { findMany: jest.fn().mockResolvedValue([{ category: 'rent', amount: 10, branchId: 'branch-1', expenseDate: new Date() }]) },
  customer: { findMany: jest.fn().mockResolvedValue([]) },
  inventory: { findMany: jest.fn().mockResolvedValue([]) },
  inventoryConsumption: { findMany: jest.fn().mockResolvedValue([]) },
  recipeIngredient: { findMany: jest.fn().mockResolvedValue([]) },
  branch: { findMany: jest.fn().mockResolvedValue([{ id: 'branch-1', name: 'الرئيسي' }]) },
  staffPerformance: { findMany: jest.fn().mockResolvedValue([]) },
  attendance: { findMany: jest.fn().mockResolvedValue([]) },
  driver: { findMany: jest.fn().mockResolvedValue([{ id: 'driver-1', name: 'أحمد', branch: { name: 'الرئيسي' } }]) },
  debt: { findMany: jest.fn().mockResolvedValue([]) },
  payment: { findMany: jest.fn().mockResolvedValue([]) },
  driverCashSettlement: { findMany: jest.fn().mockResolvedValue([]) },
  product: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
});

describe('OwnerCopilotToolsService read-only tools', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: OwnerCopilotToolsService;
  const scope: OwnerCopilotScope = {
    userId: 'owner-1', role: 'OWNER', cafeId: 'cafe-1', allowedBranchIds: ['branch-1'],
    selectedBranchIds: ['branch-1'], selectedBranchNames: ['الرئيسي'],
    permissions: ['SALES_READ', 'FINANCE_READ', 'PRODUCT_READ', 'CUSTOMER_AGGREGATE_READ', 'INVENTORY_READ', 'STAFF_READ', 'OPERATIONS_READ'],
    timezone: 'Africa/Cairo', currency: 'EGP',
  };
  const range: OwnerResolvedDateRange = {
    type: 'TODAY', from: new Date('2026-07-12T21:00:00Z'), to: new Date('2026-07-13T20:59:59Z'),
    label: '13 يوليو 2026', isIncomplete: true,
  };

  beforeEach(() => {
    prisma = makePrisma();
    service = new OwnerCopilotToolsService(prisma as any);
  });

  it('calculates sales, COGS, profit, and AOV from real order rows', async () => {
    const sales = await service.getSalesSummary(scope, range);
    const profit = await service.getProfitSummary(scope, range);
    expect((sales.data as any).metrics).toMatchObject({ netSales: 120, averageOrderValue: 120 });
    expect(profit.data).toMatchObject({ costOfGoodsSold: 50, grossProfit: 70, expenses: 10, netProfit: 60 });
  });

  it('injects trusted cafe and branch scope into order queries', async () => {
    await service.getSalesSummary(scope, range);
    expect(prisma.unifiedOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ cafeId: 'cafe-1', branchId: { in: ['branch-1'] } }),
    }));
  });

  it('never includes a foreign-cafe order supplied outside the scoped query contract', async () => {
    await service.getSalesSummary({ ...scope, cafeId: 'cafe-1' }, range);
    const where = prisma.unifiedOrder.findMany.mock.calls[0][0].where;
    expect(where.cafeId).toBe('cafe-1');
    expect(where).not.toEqual(expect.objectContaining({ cafeId: 'cafe-2' }));
  });

  it('excludes cancelled and unpaid orders from revenue', async () => {
    prisma.unifiedOrder.findMany.mockResolvedValue([
      paidOrder(),
      paidOrder({ id: 'cancelled', status: 'CANCELLED', grandTotal: 500 }),
      paidOrder({ id: 'unpaid', paymentStatus: 'UNPAID', isRevenueConfirmed: false, grandTotal: 700 }),
    ] as any);
    const result = await service.getSalesSummary(scope, range);
    expect((result.data as any).metrics.netSales).toBe(120);
    expect((result.data as any).metrics.cancelledOrders).toBe(1);
  });

  it('ranks products by the requested quantity basis', async () => {
    prisma.unifiedOrder.findMany.mockResolvedValue([
      paidOrder({ items: [
        { productId: 'p1', quantity: 2, unitPrice: 60, product: { name: 'لاتيه', category: 'coffee', cost: 25, price: 60 } },
        { productId: 'p2', quantity: 5, unitPrice: 20, product: { name: 'كوكيز', category: 'dessert', cost: 8, price: 20 } },
      ] }),
    ] as any);
    const result = await service.getProductPerformance(scope, range);
    expect((result.data as any).rankingBasis).toBe('الكمية المباعة');
    expect((result.data as any).topByQuantity[0].productName).toBe('كوكيز');
  });

  it('ranks profitability independently from quantity', async () => {
    const result = await service.getProductProfitability(scope, range);
    expect((result.data as any).rankingBasis).toBe('مساهمة الربح الإجمالي');
    expect((result.data as any).highestProfit[0]).toMatchObject({ productName: 'لاتيه', profit: 70, currentPrice: 60 });
  });

  it('calculates inventory availability after reservations', async () => {
    prisma.inventory.findMany.mockResolvedValue([{
      id: 'i1', itemName: 'لبن', unit: 'لتر', currentQty: 5, reservedQty: 2, minThreshold: 4,
      branch: { id: 'branch-1', name: 'الرئيسي' }, recipeUses: [{ product: { name: 'لاتيه' } }],
    }] as any);
    const result = await service.getInventoryHealth(scope, range);
    expect((result.data as any).criticalItems[0]).toMatchObject({ availableQuantity: 3, minimumLevel: 4, severity: 'HIGH' });
  });

  it('returns aggregate customer metrics without names or phone numbers', async () => {
    prisma.customer.findMany.mockResolvedValue([
      { createdAt: new Date('2026-07-13'), totalOrders: 2, totalSpent: 200, lastOrderDate: new Date('2026-07-13') },
    ] as any);
    const result = await service.getCustomerMetrics(scope, range);
    expect(result.data).toMatchObject({ totalCustomers: 1, repeatCustomers: 1 });
    expect(JSON.stringify(result.data)).not.toMatch(/phone|name/i);
  });

  it('calculates debt totals and states the missing due-date limitation', async () => {
    prisma.debt.findMany
      .mockResolvedValueOnce([{ amount: 75, branch: { name: 'الرئيسي' } }] as any)
      .mockResolvedValueOnce([{ amount: 25 }] as any);
    const result = await service.getDebtSummary(scope, range);
    expect(result.data).toMatchObject({ outstandingAmount: 75, recentCollections: 25 });
    expect(result.warnings.join(' ')).toContain('تاريخ استحقاق');
  });

  it('creates a stock alert from read-only inventory evidence', async () => {
    prisma.inventory.findMany.mockResolvedValue([{
      id: 'i1', itemName: 'بن', unit: 'كجم', currentQty: 0, reservedQty: 0, minThreshold: 2,
      branch: { id: 'branch-1', name: 'الرئيسي' }, recipeUses: [{ product: { name: 'قهوة' } }],
    }] as any);
    const result = await service.getBusinessAlerts(scope, range);
    const alerts = (result.data as any).alerts;
    expect(alerts.some((alert: any) => alert.title.includes('بن') && alert.severity === 'CRITICAL')).toBe(true);
  });

  it('does not query expenses for alerts without finance permission', async () => {
    const managerScope = { ...scope, role: 'MANAGER' as const, permissions: scope.permissions.filter((permission) => permission !== 'FINANCE_READ') };
    await service.getBusinessAlerts(managerScope, range);
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it('does not call raw SQL or any write method', async () => {
    await service.execute('getSalesSummary', scope, range);
    await service.execute('getInventoryHealth', scope, range);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(prisma.product.delete).not.toHaveBeenCalled();
  });

  it('uses the cafe timezone when finding peak hours', async () => {
    const result = await service.getPeakHours(scope, range);
    expect((result.data as any).peakHours[0].hour).toBe(11);
  });
});

import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ForecastingModelService } from './forecasting-model.service';
import { ForecastingService } from './forecasting.service';
import { FORECAST_MODEL_VERSION, SIMULATION_NOTICE } from './forecasting.types';

const scope = {
  userId: 'owner-1', role: 'OWNER' as const, cafeId: 'cafe-1',
  allowedBranchIds: ['branch-1'], selectedBranchIds: ['branch-1'], timezone: 'Africa/Cairo', currency: 'EGP',
};

function orderRows(days = 90) {
  return Array.from({ length: days }, (_, index) => ({
    id: `order-${index}`, externalId: `external-${index}`, code: `ORD-${index}`, branchId: 'branch-1',
    createdAt: new Date(Date.now() - (days - index) * 86_400_000), total: 100 + index,
    status: 'COMPLETED', paid: true, isRevenueConfirmed: true, paymentStatus: 'PAID', source: 'IN_CAFE', sourceType: 'INSIDE_CAFE',
    items: [{ productId: 'product-1', quantity: 2, unitPrice: 50, product: { name: 'Latte', category: 'coffee', active: true } }],
  }));
}

function product(id = 'product-1', overrides: Record<string, unknown> = {}) {
  return {
    id, cafeId: 'cafe-1', name: id === 'product-2' ? 'Croissant' : 'Latte', category: id === 'product-2' ? 'bakery' : 'coffee',
    price: id === 'product-2' ? 40 : 60, cost: id === 'product-2' ? 20 : 25, active: true,
    priceChanges: [],
    recipe: [{ quantity: 0.2, unit: 'l', wastePercent: 5, inventory: { id: 'milk', itemName: 'Milk', unit: 'ml', currentQty: 10000, reservedQty: 0 } }],
    packaging: [{ quantity: 1, unit: 'piece', inventory: { id: 'cup', itemName: 'Cup', unit: 'piece', currentQty: 1000, reservedQty: 0 } }],
    ...overrides,
  };
}

describe('ForecastingService eligibility, tenant isolation, and read-only safety', () => {
  let prisma: any;
  let service: ForecastingService;

  beforeEach(() => {
    prisma = {
      branch: { findMany: jest.fn().mockResolvedValue([{ id: 'branch-1', name: 'Main' }]) },
      product: { findMany: jest.fn().mockResolvedValue([product()]), findFirst: jest.fn().mockResolvedValue({ id: 'product-1', name: 'Latte' }), update: jest.fn(), create: jest.fn() },
      inventory: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue({ id: 'milk', itemName: 'Milk', unit: 'ml', currentQty: 10000, reservedQty: 0 }), update: jest.fn(), create: jest.fn() },
      order: { findMany: jest.fn().mockResolvedValue(orderRows()), update: jest.fn(), create: jest.fn() },
      inCafeOrder: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), create: jest.fn() },
      branchProduct: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), create: jest.fn() },
      inventoryConsumption: { findMany: jest.fn().mockResolvedValue(Array.from({ length: 45 }, (_, index) => ({ quantity: 100, createdAt: new Date(Date.now() - (45 - index) * 86_400_000) }))), create: jest.fn() },
      staffPerformance: { findMany: jest.fn().mockResolvedValue(Array.from({ length: 40 }, () => ({ ordersHandled: 25 }))), update: jest.fn() },
      customer: { findMany: jest.fn().mockResolvedValue(Array.from({ length: 60 }, () => ({ totalOrders: 2, lastOrderDate: new Date(Date.now() - 5 * 86_400_000) }))) },
      priceOverride: { create: jest.fn() }, suggestion: { create: jest.fn() }, attendance: { update: jest.fn() },
      $queryRaw: jest.fn(), $executeRaw: jest.fn(),
    };
    service = new ForecastingService(prisma, new ForecastingModelService());
  });

  it('rejects unauthenticated users', async () => expect(service.resolveScope(null)).rejects.toBeInstanceOf(UnauthorizedException));
  it('rejects unauthorized roles', async () => expect(service.resolveScope({ id: 'x', role: 'BARISTA', cafeId: 'cafe-1' })).rejects.toBeInstanceOf(ForbiddenException));
  it('queries branches with authenticated cafe only', async () => { await service.resolveScope({ id: 'x', role: 'OWNER', cafeId: 'cafe-1' }); expect(prisma.branch.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { cafeId: 'cafe-1', active: true } })); });
  it('limits managers to their assigned branch', async () => { const result = await service.resolveScope({ id: 'm', role: 'MANAGER', cafeId: 'cafe-1', branchId: 'branch-1' }); expect(result.allowedBranchIds).toEqual(['branch-1']); });
  it('rejects an unauthorized branch', async () => expect(service.resolveScope({ id: 'x', role: 'OWNER', cafeId: 'cafe-1' }, 'foreign')).rejects.toBeInstanceOf(ForbiddenException));
  it('lists only tenant-scoped entities', async () => { await service.listEntities(scope); expect(prisma.product.findMany.mock.calls[0][0].where.cafeId).toBe('cafe-1'); expect(prisma.inventory.findMany.mock.calls[0][0].where.cafeId).toBe('cafe-1'); });

  it('allows a daily forecast with sufficient data', async () => expect((await service.forecast(scope, { type: 'DAILY_SALES_FORECAST' })).eligibility.eligible).toBe(true));
  it('refuses a daily forecast with insufficient data', async () => { prisma.order.findMany.mockResolvedValue(orderRows(10)); expect((await service.forecast(scope, { type: 'DAILY_SALES_FORECAST' })).confidence).toBe('INSUFFICIENT_DATA'); });
  it('records model version and historical period', async () => { const result = await service.forecast(scope, { type: 'DAILY_ORDER_COUNT_FORECAST' }); expect(result.modelVersion).toBe(FORECAST_MODEL_VERSION); expect(result.historicalPeriod.from).toBeTruthy(); });
  it('returns uncertainty bounds', async () => { const result = await service.forecast(scope, { type: 'DAILY_SALES_FORECAST' }); expect(result.lower).toBeLessThanOrEqual(result.expected!); expect(result.upper).toBeGreaterThanOrEqual(result.expected!); });
  it('states that a forecast is not a guarantee', async () => expect((await service.forecast(scope, { type: 'DAILY_SALES_FORECAST' })).warnings.join(' ')).toContain('ليس ضمانًا'));
  it('excludes partial current day', async () => { prisma.order.findMany.mockResolvedValue([...orderRows(), { ...orderRows(1)[0], id: 'today', externalId: 'today', createdAt: new Date(), total: 999999 }]); const result = await service.forecast(scope, { type: 'DAILY_SALES_FORECAST' }); expect(result.historical.some((row) => row.value >= 999999)).toBe(false); });
  it.each(['CANCELLED', 'VOID', 'REJECTED'])('excludes %s orders', async (status) => { prisma.order.findMany.mockResolvedValue([...orderRows(), { ...orderRows(1)[0], id: status, externalId: status, status, createdAt: new Date(Date.now() - 2 * 86_400_000), total: 999999 }]); const result = await service.forecast(scope, { type: 'DAILY_SALES_FORECAST' }); expect(result.historical.some((row) => row.value >= 999999)).toBe(false); });
  it('excludes test orders', async () => { prisma.order.findMany.mockResolvedValue([...orderRows(), { ...orderRows(1)[0], id: 'test', externalId: 'test', code: 'TEST-1', createdAt: new Date(Date.now() - 2 * 86_400_000), total: 999999 }]); const result = await service.forecast(scope, { type: 'DAILY_SALES_FORECAST' }); expect(result.historical.some((row) => row.value >= 999999)).toBe(false); });
  it('excludes duplicate external ids', async () => { const duplicate = { ...orderRows()[0], id: 'duplicate', total: 999999 }; prisma.order.findMany.mockResolvedValue([...orderRows(), duplicate]); const result = await service.forecast(scope, { type: 'DAILY_SALES_FORECAST' }); expect(result.historical.some((row) => row.value >= 999999)).toBe(false); });
  it('does not insert missing calendar days as zero demand', async () => { const rows = orderRows().filter((_, index) => index % 5 !== 0); prisma.order.findMany.mockResolvedValue(rows); const result = await service.forecast(scope, { type: 'DAILY_ORDER_COUNT_FORECAST' }); expect(result.historical.every((row) => row.value > 0)).toBe(true); });
  it('rejects foreign products', async () => { prisma.product.findFirst.mockResolvedValue(null); await expect(service.forecast(scope, { type: 'PRODUCT_DEMAND_FORECAST', entityId: 'foreign' })).rejects.toBeInstanceOf(ForbiddenException); });
  it('requires an inventory entity for stockout risk', async () => expect(service.forecast(scope, { type: 'STOCKOUT_RISK' })).rejects.toBeInstanceOf(BadRequestException));
  it('uses current stock for depletion estimate', async () => { const result = await service.forecast(scope, { type: 'STOCKOUT_RISK', entityId: 'milk' }); expect(result.expected).toBe(100); });
  it('warns when waste lacks expiry dates', async () => expect((await service.forecast(scope, { type: 'WASTE_RISK_ESTIMATE', entityId: 'milk' })).warnings.join(' ')).toContain('تواريخ صلاحية'));
  it('keeps ingredient forecasts separated in inventory units', async () => { prisma.product.findFirst.mockResolvedValue(product()); const result = await service.forecast(scope, { type: 'INGREDIENT_CONSUMPTION_FORECAST', entityId: 'product-1' }); expect(result.unit).toBe('وحدة منتج'); expect(result.components?.[0]).toMatchObject({ name: 'Milk', unit: 'ml' }); expect(result.components?.[0].expected).toBeGreaterThan(0); });
  it('labels hourly opening hours as inferred', async () => expect((await service.forecast(scope, { type: 'HOURLY_ORDER_FORECAST' })).warnings.join(' ')).toContain('مستنتجة'));
  it('does not cross tenant forecast cache entries', async () => { await service.forecast(scope, { type: 'DAILY_SALES_FORECAST' }); const other = { ...scope, cafeId: 'cafe-2' }; prisma.order.findMany.mockResolvedValue(orderRows().map((row) => ({ ...row, total: 10 }))); await service.forecast(other, { type: 'DAILY_SALES_FORECAST' }); expect((service.getTenantHistory('cafe-1')[0] as any).expected).not.toBe((service.getTenantHistory('cafe-2')[0] as any).expected); });
  it('keeps stored forecast history tenant scoped', async () => { await service.forecast(scope, { type: 'DAILY_SALES_FORECAST' }); expect(service.getTenantHistory('cafe-2')).toEqual([]); });

  it('calculates a ten percent discount correctly', async () => { prisma.product.findMany.mockResolvedValue([product()]); const result = await service.simulate(scope, { type: 'DISCOUNT_IMPACT_SIMULATION', productIds: ['product-1'], discountValue: 10 }); expect(result.proposedPrice).toBe(54); });
  it('uses the current product cost', async () => { prisma.product.findMany.mockResolvedValue([product()]); expect((await service.simulate(scope, { type: 'DISCOUNT_IMPACT_SIMULATION', productIds: ['product-1'], discountValue: 10 })).productCost).toBe(25); });
  it('calculates discounted unit margin', async () => { prisma.product.findMany.mockResolvedValue([product()]); expect((await service.simulate(scope, { type: 'DISCOUNT_IMPACT_SIMULATION', productIds: ['product-1'], discountValue: 10 })).proposedUnitMargin).toBe(29); });
  it('calculates break-even units', async () => { prisma.product.findMany.mockResolvedValue([product()]); expect((await service.simulate(scope, { type: 'DISCOUNT_IMPACT_SIMULATION', productIds: ['product-1'], discountValue: 10 })).breakEvenUnits).toBeGreaterThan(0); });
  it.each([0, 100, -1])('rejects invalid discount %s', async (discountValue) => expect(service.simulate(scope, { type: 'DISCOUNT_IMPACT_SIMULATION', productIds: ['product-1'], discountValue })).rejects.toBeInstanceOf(BadRequestException));
  it('warns on negative margin', async () => { prisma.product.findMany.mockResolvedValue([product()]); const result = await service.simulate(scope, { type: 'PRICE_CHANGE_SIMULATION', productIds: ['product-1'], proposedPrice: 20 }); expect(result.warnings.join(' ')).toContain('هامشًا سلبيًا'); });
  it('requires two combo products', async () => expect(service.simulate(scope, { type: 'COMBO_IMPACT_SIMULATION', productIds: ['product-1'], proposedPrice: 80 })).rejects.toBeInstanceOf(BadRequestException));
  it('calculates separate combo price and saving', async () => { prisma.product.findMany.mockResolvedValue([product(), product('product-2')]); const result = await service.simulate(scope, { type: 'COMBO_IMPACT_SIMULATION', productIds: ['product-1', 'product-2'], proposedPrice: 90 }); expect(result.currentPrice).toBe(100); expect(result.customerSaving).toBe(10); });
  it('calculates combo cost and margin', async () => { prisma.product.findMany.mockResolvedValue([product(), product('product-2')]); const result = await service.simulate(scope, { type: 'COMBO_IMPACT_SIMULATION', productIds: ['product-1', 'product-2'], proposedPrice: 90 }); expect(result.productCost).toBe(45); expect(result.proposedUnitMargin).toBe(45); });
  it('includes cannibalization warning', async () => { prisma.product.findMany.mockResolvedValue([product()]); expect((await service.simulate(scope, { type: 'DISCOUNT_IMPACT_SIMULATION', productIds: ['product-1'], discountValue: 10 })).cannibalizationRisk).toBe('UNCERTAIN'); });
  it('uses scenarios when price elasticity is insufficient', async () => { prisma.product.findMany.mockResolvedValue([product()]); const result = await service.simulate(scope, { type: 'PRICE_CHANGE_SIMULATION', productIds: ['product-1'], proposedPrice: 65 }); expect(result.scenarios.map((row) => row.name)).toEqual(['CONSERVATIVE', 'EXPECTED', 'OPTIMISTIC']); expect(result.confidence).toBe('LOW'); });
  it('calculates inventory and packaging requirements', async () => { prisma.product.findMany.mockResolvedValue([product()]); const result = await service.simulate(scope, { type: 'DISCOUNT_IMPACT_SIMULATION', productIds: ['product-1'], discountValue: 10 }); expect(result.inventoryRequirement.map((row) => row.name)).toEqual(expect.arrayContaining(['Milk', 'Cup'])); });
  it('rejects unavailable branch products', async () => { prisma.product.findMany.mockResolvedValue([product()]); prisma.branchProduct.findMany.mockResolvedValue([{ productId: 'product-1' }]); await expect(service.simulate(scope, { type: 'DISCOUNT_IMPACT_SIMULATION', productIds: ['product-1'], discountValue: 10 })).rejects.toBeInstanceOf(BadRequestException); });
  it('rejects foreign products in simulations', async () => { prisma.product.findMany.mockResolvedValue([]); await expect(service.simulate(scope, { type: 'DISCOUNT_IMPACT_SIMULATION', productIds: ['foreign'], discountValue: 10 })).rejects.toBeInstanceOf(ForbiddenException); });
  it('always states no changes were applied', async () => { prisma.product.findMany.mockResolvedValue([product()]); const result = await service.simulate(scope, { type: 'DISCOUNT_IMPACT_SIMULATION', productIds: ['product-1'], discountValue: 10 }); expect(result.notice).toBe(SIMULATION_NOTICE); expect(result.noChangesApplied).toBe(true); });
  it('compares multiple scenarios without execution', async () => { prisma.product.findMany.mockResolvedValue([product()]); const result = await service.compareScenarios(scope, [{ type: 'DISCOUNT_IMPACT_SIMULATION', productIds: ['product-1'], discountValue: 10 }, { type: 'PRICE_CHANGE_SIMULATION', productIds: ['product-1'], proposedPrice: 65 }]); expect(result.scenarios).toHaveLength(2); expect(result.noChangesApplied).toBe(true); });
  it('records feedback in memory without changing the model', async () => { prisma.product.findMany.mockResolvedValue([product()]); const result = await service.simulate(scope, { type: 'DISCOUNT_IMPACT_SIMULATION', productIds: ['product-1'], discountValue: 10 }); expect(service.recordFeedback(scope, { resultId: result.id, feedback: 'USEFUL_SIMULATION' })).toMatchObject({ persisted: false, modelChanged: false }); });
  it('never writes prices, offers, inventory, orders, or schedules', async () => { prisma.product.findMany.mockResolvedValue([product()]); await service.simulate(scope, { type: 'DISCOUNT_IMPACT_SIMULATION', productIds: ['product-1'], discountValue: 10 }); [prisma.product.update, prisma.priceOverride.create, prisma.suggestion.create, prisma.inventory.update, prisma.order.update, prisma.attendance.update, prisma.$executeRaw].forEach((spy: jest.Mock) => expect(spy).not.toHaveBeenCalled()); });
  it('tracks forecasting and simulation metrics', async () => { prisma.product.findMany.mockResolvedValue([product()]); await service.forecast(scope, { type: 'DAILY_SALES_FORECAST' }); await service.simulate(scope, { type: 'DISCOUNT_IMPACT_SIMULATION', productIds: ['product-1'], discountValue: 10 }); expect(service.getMetrics()).toMatchObject({ forecastsGenerated: 1, simulationsRun: 1 }); });
});

import {
  calculateCanonicalMetrics,
  CanonicalOrderFact,
  isCancelledOrder,
  isValidSale,
  OWNER_METRIC_DEFINITIONS,
  percentageChange,
} from './owner-business-metrics';

const fact = (overrides: Partial<CanonicalOrderFact> = {}): CanonicalOrderFact => ({
  id: 'order-1', source: 'DELIVERY', branchId: 'branch-1', status: 'DELIVERED', paymentStatus: 'PAID',
  total: 100, paid: true, revenueConfirmed: true, createdAt: new Date('2026-07-13T08:00:00Z'),
  customerId: 'customer-1', staffId: 'staff-1', driverId: 'driver-1', paymentMethod: 'CASH',
  preparedAt: null, deliveredAt: null,
  items: [{ productId: 'p1', productName: 'لاتيه', category: 'coffee', quantity: 2, unitPrice: 50, unitCost: 20, catalogPrice: 50 }],
  ...overrides,
});

describe('owner canonical business metrics', () => {
  it('uses paid non-cancelled orders as valid sales', () => {
    expect(isValidSale(fact())).toBe(true);
    expect(isValidSale(fact({ paymentStatus: 'UNPAID', paid: false, revenueConfirmed: false }))).toBe(false);
  });

  it('excludes cancelled delivery orders', () => {
    expect(isValidSale(fact({ status: 'CANCELLED' }))).toBe(false);
    expect(isCancelledOrder(fact({ status: 'CANCELLED' }))).toBe(true);
  });

  it('excludes void in-cafe orders', () => {
    expect(isValidSale(fact({ source: 'IN_CAFE', status: 'VOID' }))).toBe(false);
    expect(isCancelledOrder(fact({ source: 'IN_CAFE', status: 'VOID' }))).toBe(true);
  });

  it('calculates gross profit deterministically', () => {
    const metrics = calculateCanonicalMetrics([fact()], 0);
    expect(metrics.revenue).toBe(100);
    expect(metrics.costOfGoodsSold).toBe(40);
    expect(metrics.grossProfit).toBe(60);
  });

  it('calculates net profit from recorded expenses', () => {
    expect(calculateCanonicalMetrics([fact()], 15).netProfit).toBe(45);
  });

  it('calculates average order value', () => {
    expect(calculateCanonicalMetrics([fact(), fact({ id: 'order-2', total: 50 })], 0).averageOrderValue).toBe(75);
  });

  it('calculates cancellation rate over all relevant orders', () => {
    const metrics = calculateCanonicalMetrics([fact(), fact({ id: 'cancelled', status: 'CANCELLED' })], 0);
    expect(metrics.cancellationRate).toBe(50);
  });

  it('does not mislabel revenue as profit', () => {
    const metrics = calculateCanonicalMetrics([fact()], 0);
    expect(metrics.revenue).not.toBe(metrics.grossProfit);
    expect(OWNER_METRIC_DEFINITIONS.revenue).not.toBe(OWNER_METRIC_DEFINITIONS.netProfit);
  });

  it('returns null change when previous baseline is zero', () => {
    expect(percentageChange(100, 0)).toBeNull();
    expect(percentageChange(0, 0)).toBe(0);
  });
});

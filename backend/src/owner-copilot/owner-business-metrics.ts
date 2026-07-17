import { CanonicalSalesMetrics } from './owner-copilot.types';

export const OWNER_METRIC_DEFINITIONS = Object.freeze({
  grossSales: 'Captured item value before any separately recorded adjustment. Sonex has no normalized discount/refund ledger, so this currently equals net sales.',
  netSales: 'Captured total of paid, non-cancelled delivery and in-cafe orders in the authorized scope.',
  revenue: 'Same as net sales under the current Sonex accounting data model.',
  costOfGoodsSold: 'Sold quantity multiplied by the product cost recorded in the current product catalog.',
  grossProfit: 'Net sales minus cost of goods sold.',
  netProfit: 'Gross profit minus expenses recorded in the Expense table for the same authorized scope and period.',
  averageOrderValue: 'Net sales divided by the number of valid paid orders.',
  cancellationRate: 'Cancelled delivery orders plus void in-cafe orders divided by all relevant orders created in the period.',
  repeatCustomerRate: 'Customers with more than one lifetime order divided by customers in the authorized scope.',
});

export interface CanonicalOrderFact {
  id: string;
  source: 'DELIVERY' | 'IN_CAFE';
  branchId: string;
  status: string;
  paymentStatus: string;
  total: number;
  paid: boolean;
  revenueConfirmed: boolean;
  createdAt: Date;
  customerId: string | null;
  staffId: string | null;
  driverId: string | null;
  paymentMethod: string | null;
  preparedAt: Date | null;
  deliveredAt: Date | null;
  items: CanonicalOrderItemFact[];
}

export interface CanonicalOrderItemFact {
  productId: string;
  productName: string;
  category: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  catalogPrice: number;
}

export function isValidSale(fact: CanonicalOrderFact): boolean {
  if (fact.source === 'DELIVERY') {
    return fact.status !== 'CANCELLED'
      && (fact.paymentStatus === 'PAID' || fact.paid || fact.revenueConfirmed);
  }
  return fact.status !== 'VOID'
    && (fact.paymentStatus === 'PAID' || fact.paid || fact.revenueConfirmed);
}

export function isCancelledOrder(fact: CanonicalOrderFact): boolean {
  return fact.source === 'DELIVERY' ? fact.status === 'CANCELLED' : fact.status === 'VOID';
}

export function calculateCanonicalMetrics(
  facts: CanonicalOrderFact[],
  expenses: number,
): CanonicalSalesMetrics {
  const validFacts = facts.filter(isValidSale);
  const revenue = roundMoney(validFacts.reduce((sum, fact) => sum + fact.total, 0));
  const costOfGoodsSold = roundMoney(validFacts.reduce(
    (sum, fact) => sum + fact.items.reduce(
      (itemSum, item) => itemSum + item.quantity * item.unitCost,
      0,
    ),
    0,
  ));
  const grossProfit = roundMoney(revenue - costOfGoodsSold);
  const safeExpenses = roundMoney(expenses);
  const cancelledOrders = facts.filter(isCancelledOrder).length;
  const totalRelevantOrders = facts.length;

  return {
    grossSales: revenue,
    netSales: revenue,
    revenue,
    costOfGoodsSold,
    grossProfit,
    expenses: safeExpenses,
    netProfit: roundMoney(grossProfit - safeExpenses),
    validOrders: validFacts.length,
    cancelledOrders,
    totalRelevantOrders,
    averageOrderValue: validFacts.length ? roundMoney(revenue / validFacts.length) : 0,
    cancellationRate: totalRelevantOrders ? roundRate(cancelledOrders / totalRelevantOrders * 100) : 0,
  };
}

export function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return roundRate((current - previous) / Math.abs(previous) * 100);
}

export function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function roundRate(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

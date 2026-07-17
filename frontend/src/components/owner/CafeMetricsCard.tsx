'use client';

import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/store';
import { Store, TrendingUp, TrendingDown } from 'lucide-react';

export function CafeMetricsCard() {
  const inCafeOrders = useAppStore((s) => s.inCafeOrders);
  const staffPurchases = useAppStore((s) => s.staffPurchases);

  const completedOrders = inCafeOrders.filter((o) => o.status !== 'VOID');
  const paidOrders = completedOrders.filter((o) => o.isPaid);
  const totalCafeRevenue = paidOrders.reduce((sum, o) => sum + Number(o.paidAmount), 0);
  const totalStaffCosts = staffPurchases.reduce((sum, p) => sum + Number(p.finalCost), 0);

  const cashTotal = paidOrders.filter((o) => o.paymentMethod === 'CASH').reduce((s, o) => s + Number(o.paidAmount), 0);
  const cardTotal = paidOrders.filter((o) => o.paymentMethod === 'CARD').reduce((s, o) => s + Number(o.paidAmount), 0);
  const mixedTotal = paidOrders.filter((o) => o.paymentMethod === 'MIXED').reduce((s, o) => s + Number(o.paidAmount), 0);

  const voidOrders = inCafeOrders.filter((o) => o.status === 'VOID');
  const unpaidCount = inCafeOrders.filter((o) => o.paymentStatus !== 'PAID' && o.status !== 'VOID').length;

  const productCounts = new Map<string, { name: string; qty: number; rev: number }>();
  completedOrders.forEach((o) =>
    o.items.forEach((i) => {
      const entry = productCounts.get(i.productId) || { name: i.product.name, qty: 0, rev: 0 };
      entry.qty += i.quantity;
      entry.rev += Number(i.unitPrice) * i.quantity;
      productCounts.set(i.productId, entry);
    }),
  );
  const topProducts = [...productCounts.entries()]
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 5);

  const deliveryOrders = useAppStore((s) => s.todayOrders);
  const deliveryRatio = totalCafeRevenue + deliveryOrders > 0
    ? (totalCafeRevenue / (totalCafeRevenue + deliveryOrders)) * 100
    : 0;

  return (
    <Card
      title="Café Financials"
      icon={<Store className="h-5 w-5" />}
      subtitle={`${completedOrders.length} completed orders`}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Revenue</p>
            <p className="text-lg font-bold text-emerald-700">${totalCafeRevenue.toFixed(2)}</p>
          </div>
          <div className="rounded-lg bg-red-50 px-3 py-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600">Staff Costs</p>
            <p className="text-lg font-bold text-red-700">${totalStaffCosts.toFixed(2)}</p>
          </div>
          <div className="rounded-lg bg-blue-50 px-3 py-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">Net</p>
            <p className="text-lg font-bold text-blue-700">${(totalCafeRevenue - totalStaffCosts).toFixed(2)}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg bg-gray-50 px-2 py-1.5">
            <p className="text-gray-500">Cash</p>
            <p className="font-bold text-gray-700">${cashTotal.toFixed(2)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-2 py-1.5">
            <p className="text-gray-500">Card</p>
            <p className="font-bold text-gray-700">${cardTotal.toFixed(2)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-2 py-1.5">
            <p className="text-gray-500">Mixed</p>
            <p className="font-bold text-gray-700">${mixedTotal.toFixed(2)}</p>
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Walk-in vs Delivery</span>
            <span className="font-medium text-gray-700">{deliveryRatio.toFixed(0)}% / {(100 - deliveryRatio).toFixed(0)}%</span>
          </div>
        </div>

        {topProducts.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Top Café Products</p>
            <div className="space-y-1">
              {topProducts.map(([id, p]) => (
                <div key={id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">{p.name}</span>
                  <span className="font-medium text-gray-700">{p.qty} sold</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t pt-2 text-xs">
          <span className="text-gray-400">{voidOrders.length} voided</span>
          <span className="font-medium text-amber-600">{unpaidCount} unpaid</span>
        </div>
      </div>
    </Card>
  );
}

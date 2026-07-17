'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/store';
import { formatCurrency } from '@/lib/format';
import { Wallet, Ban, ArrowLeft } from 'lucide-react';

export function PaymentBreakdown() {
  const orders = useAppStore((s) => s.orders);
  const orderIds = useAppStore((s) => s.orderIds);
  const inCafeOrders = useAppStore((s) => s.inCafeOrders);
  const totalCustomerDebt = useAppStore((s) => s.totalCustomerDebt);

  const breakdown = useMemo(() => {
    const deliveryOrders = orderIds.map((id) => orders[id]).filter(Boolean);

    let paidAmount = 0;
    let unpaidAmount = 0;
    let paidCount = 0;
    let unpaidCount = 0;

    for (const o of deliveryOrders) {
      if (o.paid || o.paymentStatus === 'PAID') {
        paidAmount += Number(o.total);
        paidCount++;
      } else {
        unpaidAmount += Number(o.remainingAmount || o.total);
        unpaidCount++;
      }
    }

    for (const o of inCafeOrders) {
      if (o.paymentStatus === 'PAID') {
        paidAmount += Number(o.total);
        paidCount++;
      } else {
        unpaidAmount += Number(o.remainingBalance || o.total);
        unpaidCount++;
      }
    }

    const total = paidAmount + unpaidAmount;
    const paidPct = total > 0 ? (paidAmount / total) * 100 : 0;
    const unpaidPct = total > 0 ? (unpaidAmount / total) * 100 : 0;

    return { paidAmount, unpaidAmount, paidCount, unpaidCount, paidPct, unpaidPct, total };
  }, [orders, orderIds, inCafeOrders]);

  // Donut-style ring
  const circumference = 2 * Math.PI * 40;
  const paidOffset = circumference - (breakdown.paidPct / 100) * circumference;

  if (breakdown.total === 0) {
    return (
      <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
        <Wallet className="mx-auto mb-2 h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500">لا توجد معاملات بعد</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-violet-500" />
          المدفوع مقابل غير المدفوع
        </h3>
      </div>

      <div className="px-5 py-5 flex flex-col sm:flex-row items-center gap-6">
        {/* Donut Chart */}
        <div className="relative shrink-0">
          <svg width="100" height="100" className="-rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="10" />
            <circle
              cx="50" cy="50" r="40"
              fill="none"
              stroke="#10b981"
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={paidOffset}
              strokeLinecap="round"
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-black text-gray-800">{breakdown.paidPct.toFixed(0)}%</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 w-full space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500"></span>
              <span className="text-sm text-gray-600">مدفوع</span>
            </div>
            <div className="text-left">
              <p className="text-sm font-black text-gray-900 font-mono">{formatCurrency(breakdown.paidAmount)}</p>
              <p className="text-[10px] text-gray-400">{breakdown.paidCount} طلب</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-400"></span>
              <span className="text-sm text-gray-600">غير مدفوع</span>
            </div>
            <div className="text-left">
              <p className="text-sm font-black text-red-500 font-mono">{formatCurrency(breakdown.unpaidAmount)}</p>
              <p className="text-[10px] text-gray-400">{breakdown.unpaidCount} طلب</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${breakdown.paidPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>{breakdown.paidPct.toFixed(0)}% مدفوع</span>
            <span>{breakdown.unpaidPct.toFixed(0)}% غير مدفوع</span>
          </div>
        </div>
      </div>

      {totalCustomerDebt > 0 && (
        <div className="mx-5 mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 flex items-center justify-between">
          <span className="text-xs font-bold text-red-700">إجمالي الديون المستحقة</span>
          <span className="text-sm font-black text-red-700 font-mono">{formatCurrency(totalCustomerDebt)}</span>
        </div>
      )}
    </div>
  );
}

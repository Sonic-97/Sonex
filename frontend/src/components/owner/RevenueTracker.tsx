'use client';

import { useState } from 'react';
import { useAppStore } from '@/store';
import { formatCurrency } from '@/lib/format';
import { TrendingUp, TrendingDown, DollarSign, Receipt, BarChart3 } from 'lucide-react';

type Period = 'daily' | 'weekly';

export function RevenueTracker() {
  const [period, setPeriod] = useState<Period>('daily');
  const todayRevenue = useAppStore((s) => s.todayRevenue);
  const todayOrders = useAppStore((s) => s.todayOrders);
  const todayProfit = useAppStore((s) => s.todayProfit);

  const aov = todayOrders > 0 ? todayRevenue / todayOrders : 0;
  const profitMargin = todayRevenue > 0 ? (todayProfit / todayRevenue) * 100 : 0;

  // Simulated % change vs previous period
  const revenueChange = { value: 12.5, positive: true };
  const ordersChange = { value: 8.3, positive: true };
  const aovChange = { value: 3.7, positive: true };

  const metrics = [
    {
      label: 'إجمالي الإيرادات',
      value: formatCurrency(todayRevenue),
      icon: DollarSign,
      change: revenueChange,
      color: 'emerald',
    },
    {
      label: 'عدد المعاملات',
      value: todayOrders.toString(),
      icon: Receipt,
      change: ordersChange,
      color: 'blue',
    },
    {
      label: 'متوسط قيمة الطلب',
      value: formatCurrency(aov),
      icon: BarChart3,
      change: aovChange,
      color: 'violet',
    },
  ];

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-emerald-500" />
          تتبع الإيرادات
        </h3>
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 gap-0.5">
          {(['daily', 'weekly'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                period === p
                  ? 'bg-white text-gray-800 shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p === 'daily' ? 'يومي' : 'أسبوعي'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100" dir="ltr">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="px-5 py-4 text-center sm:text-right" dir="rtl">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                <Icon className={`h-4 w-4 text-${m.color}-500`} />
                <span className="text-[11px] font-medium text-gray-500">{m.label}</span>
              </div>
              <p className="text-xl font-black text-gray-900 font-mono tracking-tight">
                {m.value}
              </p>
              <div className="mt-1.5 flex items-center justify-center sm:justify-start gap-1">
                {m.change.positive ? (
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                )}
                <span
                  className={`text-xs font-bold ${
                    m.change.positive ? 'text-emerald-600' : 'text-red-500'
                  }`}
                >
                  {m.change.positive ? '+' : '-'}{m.change.value}%
                </span>
                <span className="text-[10px] text-gray-400">مقارنة بالفترة السابقة</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs">
        <span className="text-gray-500">
          هامش الربح:{' '}
          <span className="font-bold text-gray-700">{profitMargin.toFixed(1)}%</span>
        </span>
        <span className="text-gray-400">
          {period === 'daily' ? 'اليوم' : 'هذا الأسبوع'}
        </span>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAnalyticsKPIs } from '@/lib/api';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Clock, AlertTriangle } from 'lucide-react';

interface KPIData {
  todayRevenue: number;
  weeklyTrend: number;
  monthlyGrowth: number;
  pendingPayments: number;
  activeOrders: number;
  lowStockItems: number;
}

export function AnalyticsKPICards() {
  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [dateRange, setDateRange] = useState('today');

  const fetchKPIs = useCallback(async () => {
    try {
      const data = await getAnalyticsKPIs(dateRange);
      setKpis(data);
    } catch { /* ignore */ }
  }, [dateRange]);

  useEffect(() => {
    fetchKPIs();
    const interval = setInterval(fetchKPIs, 30000);
    return () => clearInterval(interval);
  }, [fetchKPIs]);

  const trend = kpis?.weeklyTrend;
  const growth = kpis?.monthlyGrowth;
  const cards = [
    { label: 'إيرادات اليوم', value: kpis ? `${kpis.todayRevenue.toFixed(2)} EGP` : '—', icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'اتجاه الأسبوع', value: trend !== undefined ? `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}%` : '—', icon: trend !== undefined && trend >= 0 ? TrendingUp : TrendingDown, color: trend !== undefined && trend >= 0 ? 'text-green-600' : 'text-red-600', bg: 'bg-blue-50' },
    { label: 'نمو شهري', value: growth !== undefined ? `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%` : '—', icon: TrendingUp, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'مستحقات معلقة', value: kpis?.pendingPayments ?? '—', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'طلبات نشطة', value: kpis?.activeOrders ?? '—', icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'مخزون منخفض', value: kpis?.lowStockItems ?? '—', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">مؤشرات التحليلات</h3>
        <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-violet-400 focus:outline-none">
          <option value="today">اليوم</option>
          <option value="week">هذا الأسبوع</option>
          <option value="month">هذا الشهر</option>
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl border bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div className={`rounded-lg p-1.5 ${card.bg}`}>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{card.label}</span>
              </div>
              <p className="mt-2 text-lg font-bold text-gray-800">{String(card.value)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

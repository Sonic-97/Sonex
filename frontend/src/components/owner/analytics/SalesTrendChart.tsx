'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSalesTrend } from '@/lib/api';

export function SalesTrendChart() {
  const [data, setData] = useState<{ period: string; revenue: number; orders: number }[]>([]);
  const [groupBy, setGroupBy] = useState('DAILY');
  const [dateRange, setDateRange] = useState('week');

  const fetchData = useCallback(async () => {
    try {
      const rows = await getSalesTrend(groupBy, dateRange);
      setData(Array.isArray(rows) ? rows.map((r: any) => ({ period: new Date(r.period).toLocaleDateString(), revenue: Number(r.revenue), orders: Number(r.orders) })) : []);
    } catch { setData([]); }
  }, [groupBy, dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const maxRev = Math.max(...data.map((d) => d.revenue), 1);

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">المبيعات بمرور الوقت</h3>
        <div className="flex gap-2">
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="rounded border border-gray-200 px-2 py-1 text-xs">
            <option value="DAILY">يومي</option>
            <option value="WEEKLY">أسبوعي</option>
            <option value="MONTHLY">شهري</option>
          </select>
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="rounded border border-gray-200 px-2 py-1 text-xs">
            <option value="today">اليوم</option>
            <option value="week">الأسبوع</option>
            <option value="month">الشهر</option>
          </select>
        </div>
      </div>
      <div className="relative h-48">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">لا توجد بيانات</div>
        ) : (
          <svg viewBox={`0 0 ${data.length * 60} 200`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
            <polyline fill="none" stroke="#7c3aed" strokeWidth="2" points={data.map((d, i) => `${i * 60 + 30},${180 - (d.revenue / maxRev) * 160}`).join(' ')} />
            {data.map((d, i) => (
              <g key={i}>
                <circle cx={i * 60 + 30} cy={180 - (d.revenue / maxRev) * 160} r="3" fill="#7c3aed" />
                <text x={i * 60 + 30} y="195" textAnchor="middle" className="text-[8px] fill-gray-400">{d.period.slice(0, 5)}</text>
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

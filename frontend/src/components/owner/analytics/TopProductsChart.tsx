'use client';

import { useState, useEffect } from 'react';
import { getTopProducts } from '@/lib/api';

const BAR_COLORS = ['#7c3aed', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#eab308'];

export function TopProductsChart() {
  const [data, setData] = useState<{ name: string; units_sold: number; revenue: number }[]>([]);

  useEffect(() => {
    getTopProducts(10).then((rows) => setData(Array.isArray(rows) ? rows.map((r: any) => ({ name: r.name, units_sold: Number(r.units_sold), revenue: Number(r.revenue) })) : [])).catch(() => setData([]));
  }, []);

  const maxRev = Math.max(...data.map((d) => d.revenue), 1);

  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">المنتجات الأكثر مبيعاً</h3>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="w-28 truncate text-gray-600">{d.name}</span>
            <span className="w-12 text-right text-gray-400">{d.units_sold} مباع</span>
            <div className="flex-1 h-4 rounded bg-gray-100 overflow-hidden">
              <div className="h-full rounded transition-all" style={{ width: `${(d.revenue / maxRev) * 100}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
            </div>
            <span className="w-16 text-right font-medium text-gray-800">${d.revenue.toFixed(0)}</span>
          </div>
        ))}
        {data.length === 0 && <div className="py-4 text-center text-sm text-gray-400">لا توجد بيانات</div>}
      </div>
    </div>
  );
}

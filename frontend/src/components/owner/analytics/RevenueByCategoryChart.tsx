'use client';

import { useState, useEffect } from 'react';
import { getRevenueByCategory } from '@/lib/api';

const BAR_COLORS = ['#7c3aed', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#eab308'];

export function RevenueByCategoryChart() {
  const [data, setData] = useState<{ category: string; revenue: number }[]>([]);

  useEffect(() => {
    getRevenueByCategory(10).then((rows) => setData(Array.isArray(rows) ? rows.map((r: any) => ({ category: r.category || 'غير مصنف', revenue: Number(r.revenue) })) : [])).catch(() => setData([]));
  }, []);

  const maxRev = Math.max(...data.map((d) => d.revenue), 1);

  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">الإيرادات حسب الفئة</h3>
      <div className="space-y-1.5">
        {data.slice(0, 8).map((d, i) => (
          <div key={d.category} className="flex items-center gap-2 text-xs">
            <span className="w-24 truncate text-gray-600">{d.category}</span>
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

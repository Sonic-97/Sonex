'use client';

import { useState, useEffect } from 'react';
import { getOrderDistribution } from '@/lib/api';

const COLORS: Record<string, string> = { NEW: '#6366f1', CONFIRMED: '#8b5cf6', READY: '#a855f7', PICKED_UP: '#ec4899', DELIVERED: '#10b981', CLOSED: '#6b7280', CANCELLED: '#ef4444' };

const statusLabels: Record<string, string> = {
  NEW: 'جديد', CONFIRMED: 'مؤكد', READY: 'جاهز',
  PICKED_UP: 'تم الاستلام', DELIVERED: 'تم التوصيل',
  PAID: 'مدفوع', CLOSED: 'مغلق', CANCELLED: 'ملغي',
};

export function OrderDistributionChart() {
  const [data, setData] = useState<{ status: string; count: number }[]>([]);

  useEffect(() => {
    getOrderDistribution().then(setData).catch(() => setData([]));
  }, []);

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">توزيع حالات الطلبات</h3>
      <div className="flex flex-wrap gap-3">
        {data.map((d) => {
          const pct = total > 0 ? (d.count / total) * 100 : 0;
          return (
            <div key={d.status} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[d.status] || '#9ca3af' }} />
              <span className="text-gray-600">{statusLabels[d.status] || d.status}</span>
              <span className="font-medium text-gray-800">{d.count}</span>
              <span className="text-gray-400">({pct.toFixed(1)}%)</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
        {data.map((d) => (
          <div key={d.status} style={{ width: `${(d.count / total) * 100}%`, backgroundColor: COLORS[d.status] || '#9ca3af' }} title={`${statusLabels[d.status] || d.status}: ${d.count}`} />
        ))}
      </div>
    </div>
  );
}

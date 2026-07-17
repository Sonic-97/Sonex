'use client';

import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/store';
import { TrendingUp } from 'lucide-react';

export function TopProductsCard() {
  const topProducts = useAppStore((s) => s.topProducts);

  return (
    <Card title="Top Products" icon={<TrendingUp className="h-5 w-5" />}>
      {topProducts.length === 0 ? (
        <p className="text-sm text-gray-400">No sales data yet</p>
      ) : (
        <div className="space-y-2">
          {topProducts.slice(0, 5).map((p) => (
            <div
              key={p.productId}
              className="flex items-center justify-between text-sm"
            >
              <span className="font-medium text-gray-700 truncate max-w-[140px]">
                {p.name}
              </span>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-400 tabular-nums">x{p.quantity}</span>
                <span className="text-emerald-600 font-medium tabular-nums">
                  ${p.revenue.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

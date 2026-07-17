'use client';

import { useState, useEffect } from 'react';
import { InventoryItem } from '@/types';
import { Card } from '@/components/ui/Card';
import { Package, AlertTriangle } from 'lucide-react';

export function InventoryConsumptionCard() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    import('@/lib/api').then(async ({ fetchInventory }) => {
      try {
        const data = await fetchInventory();
        setItems(data);
      } catch {}
      setLoading(false);
    });
  }, []);

  const lowStock = items.filter(i => Number(i.currentQty) <= Number(i.minThreshold));
  const totalValue = items.reduce((s, i) => s + Number(i.currentQty) * Number(i.costPerUnit), 0);

  return (
    <Card title="Inventory Overview" icon={<Package className="h-5 w-5" />}
      value={`${items.length} items`} subtitle={`$${totalValue.toFixed(2)} total value`}>
      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {items.slice(0, 10).map((item) => {
            const isLow = Number(item.currentQty) <= Number(item.minThreshold);
            return (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {isLow && <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />}
                  <span className="truncate text-gray-700">{item.itemName}</span>
                </div>
                <span className={`tabular-nums font-medium ${isLow ? 'text-red-600' : 'text-gray-600'}`}>
                  {Number(item.currentQty).toFixed(1)} {item.unit}
                </span>
              </div>
            );
          })}
          {items.length > 10 && (
            <p className="text-center text-xs text-gray-400">+{items.length - 10} more items</p>
          )}
          {lowStock.length > 0 && (
            <div className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700">
              {lowStock.length} item{lowStock.length > 1 ? 's' : ''} below minimum threshold
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
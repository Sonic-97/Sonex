'use client';

import { useState, useEffect } from 'react';
import { InventoryItem } from '@/types';
import { useAppStore } from '@/store';
import { AlertTriangle, Package, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

type SortKey = 'urgency' | 'name';

export function StockAlerts() {
  const lowStockAlerts = useAppStore((s) => s.lowStockAlerts);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('urgency');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    import('@/lib/api').then(async ({ fetchInventory }) => {
      try {
        const data = await fetchInventory();
        setItems(data);
      } catch {}
      setLoading(false);
    });
  }, []);

  const lowStock = items
    .filter((i) => Number(i.currentQty) <= Number(i.minThreshold))
    .map((i) => ({
      ...i,
      severity: Number(i.currentQty) === 0 ? 'critical' as const : Number(i.currentQty) <= Number(i.minThreshold) * 0.5 ? 'high' as const : 'warning' as const,
    }));

  const sorted = [...lowStock].sort((a, b) => {
    if (sortBy === 'urgency') {
      const order = { critical: 0, high: 1, warning: 2 };
      return order[a.severity] - order[b.severity];
    }
    return a.itemName.localeCompare(b.itemName);
  });

  const displayItems = expanded ? sorted : sorted.slice(0, 5);
  const hasAlerts = sorted.length > 0 || lowStockAlerts.length > 0;

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-8 w-full bg-gray-100 rounded" />
          <div className="h-8 w-full bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  const severityStyles = {
    critical: { dot: 'bg-red-500', bg: 'bg-red-50 border-red-200', text: 'text-red-700', label: 'نفذ بالكامل' },
    high: { dot: 'bg-orange-500', bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', label: 'منخفض جداً' },
    warning: { dot: 'bg-amber-500', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'أقل من الحد' },
  };

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Package className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-bold text-gray-800">تنبيهات المخزون</h3>
          {hasAlerts && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600 border border-red-200">
              {sorted.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSortBy(sortBy === 'urgency' ? 'name' : 'urgency')}
            className="text-[10px] text-gray-400 hover:text-gray-600 px-2 py-1 rounded-md hover:bg-gray-50 transition-colors"
          >
            {sortBy === 'urgency' ? 'ترتيب: urgency' : 'ترتيب: name'}
          </button>
          <RefreshCw className="h-3.5 w-3.5 text-gray-400" />
        </div>
      </div>

      {!hasAlerts ? (
        <div className="px-5 py-8 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center">
            <Package className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="text-sm font-medium text-gray-500">جميع أصناف المخزون متوفرة</p>
          <p className="mt-1 text-xs text-gray-400">لا توجد مواد تحت الحد الأدنى</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {displayItems.map((item) => {
            const sev = severityStyles[item.severity];
            return (
              <div
                key={item.id}
                className={`px-5 py-3 transition-colors ${sev.bg}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${sev.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-800 truncate">{item.itemName}</p>
                      <p className="text-[10px] text-gray-500">{item.unit}</p>
                    </div>
                  </div>
                  <div className="text-left shrink-0 mr-3">
                    <p className={`text-sm font-black font-mono ${sev.text}`}>
                      {Number(item.currentQty).toFixed(1)}
                    </p>
                    <p className="text-[10px] text-gray-400 font-medium">
                      الحد: {Number(item.minThreshold).toFixed(1)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        item.severity === 'critical' ? 'bg-red-500' : item.severity === 'high' ? 'bg-orange-500' : 'bg-amber-400'
                      }`}
                      style={{
                        width: `${Math.min(100, (Number(item.currentQty) / Number(item.minThreshold)) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className={`text-[10px] font-bold ${sev.text}`}>{sev.label}</span>
                </div>
              </div>
            );
          })}

          {/* WS alerts section */}
          {lowStockAlerts.length > 0 && (
            <div className="px-5 py-3 bg-red-50/50 border-t border-red-100">
              <p className="text-[10px] font-bold text-red-600 mb-1.5">تنبيهات لحظية</p>
              {lowStockAlerts.slice(0, 3).map((alert, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] text-red-700">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span>{alert.ingredientName}: {Number(alert.currentStock).toFixed(1)} متبقي</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {sorted.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-5 py-2.5 border-t border-gray-100 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1 transition-colors"
        >
          {expanded ? <><ChevronUp className="h-3.5 w-3.5" /> عرض أقل</> : <><ChevronDown className="h-3.5 w-3.5" /> عرض الكل ({sorted.length})</>}
        </button>
      )}
    </div>
  );
}

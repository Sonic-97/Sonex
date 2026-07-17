'use client';

import { useState, useEffect } from 'react';
import { getDashboardProductProfitability } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { TrendingUp, TrendingDown, Loader2, AlertTriangle } from 'lucide-react';

interface ProductProfit {
  productId: string;
  productName: string;
  sellingPrice: number;
  ingredientCost: number;
  laborCost: number;
  overheadCost: number;
  estimatedCost: number;
  estimatedProfit: number;
  profitMargin: number;
  orderCount: number;
}

interface ProfitData {
  mostProfitable: ProductProfit[];
  leastProfitable: ProductProfit[];
  lowMarginCount: number;
}

export function ProductProfitabilityCard() {
  const [data, setData] = useState<ProfitData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardProductProfitability()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-5">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasLowMargin = data.lowMarginCount > 0;

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          تحليل ربحية المنتجات
        </h3>
        {hasLowMargin && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
            <AlertTriangle className="h-3 w-3" />
            {data.lowMarginCount} منتج هامش ربح منخفض
          </span>
        )}
      </div>

      {/* Most Profitable */}
      <div>
        <h4 className="text-xs font-semibold text-emerald-600 mb-2 flex items-center gap-1">
          <TrendingUp className="h-3.5 w-3.5" />
          الأعلى ربحية
        </h4>
        <div className="space-y-1.5">
          {data.mostProfitable.map((p) => (
            <div key={p.productId} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{p.productName}</p>
                <p className="text-[10px] text-gray-400">{p.estimatedProfit.toFixed(2)} EGP ربح</p>
              </div>
              <div className="text-left mr-3">
                <span className={`text-xs font-bold ${p.profitMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {p.profitMargin >= 0 ? '+' : ''}{p.profitMargin.toFixed(0)}%
                </span>
              </div>
              <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${p.profitMargin >= 30 ? 'bg-emerald-500' : p.profitMargin >= 15 ? 'bg-amber-400' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(Math.max(p.profitMargin, 0), 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Least Profitable / Loss-making */}
      {data.leastProfitable.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1">
            <TrendingDown className="h-3.5 w-3.5" />
            الأقل ربحية
          </h4>
          <div className="space-y-1.5">
            {data.leastProfitable.map((p) => (
              <div key={p.productId} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.productName}</p>
                  <p className="text-[10px] text-gray-400">{p.sellingPrice.toFixed(2)} EGP السعر</p>
                </div>
                <div className="text-left mr-3">
                  <span className="text-xs font-bold text-red-600">
                    {p.profitMargin.toFixed(1)}%
                  </span>
                </div>
                <div className="w-20 h-1.5 bg-red-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-400"
                    style={{ width: `${Math.min(Math.max((p.profitMargin + 50) / 50 * 100, 5), 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cost breakdown summary note */}
      <p className="text-[10px] text-gray-400 text-center pt-1 border-t border-gray-100">
        يشمل تكاليف المكونات والعمالة والتشغيل والمرافق والمصروفات المتنوعة
      </p>
    </div>
  );
}

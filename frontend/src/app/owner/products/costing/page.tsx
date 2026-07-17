'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { DollarSign, TrendingUp, TrendingDown, Percent, Calculator, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

export default function OwnerCostingPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfitability = async () => {
      try {
        const res = await api.get('/product-management/profitability');
        setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfitability();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-center p-8 text-gray-500">فشل في تحميل حسابات التكلفة.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calculator className="h-6 w-6 text-violet-600" />
            حساب التكاليف والأرباح التلقائي
          </h1>
          <p className="text-sm text-gray-500 mt-1">يتم حساب التكلفة بناءً على المكونات، العمالة التلقائية من سجلات الحضور، المصروفات التشغيلية والمرافق.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Profitable */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-bold text-emerald-700 flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5" />
            الأعلى ربحاً (بالهامش)
          </h3>
          <div className="space-y-3">
            {data.mostProfitableByMargin.slice(0, 5).map((p: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                <span className="font-medium text-gray-900">{p.productName}</span>
                <span className="font-bold text-emerald-600 font-mono">{(p.profitMargin * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Least Profitable */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-bold text-rose-700 flex items-center gap-2 mb-4">
            <TrendingDown className="h-5 w-5" />
            الأقل ربحاً (بالهامش)
          </h3>
          <div className="space-y-3">
            {data.leastProfitableByMargin.slice(0, 5).map((p: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-rose-50 border border-rose-100">
                <span className="font-medium text-gray-900">{p.productName}</span>
                <span className="font-bold text-rose-600 font-mono">{(p.profitMargin * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detailed Cost Breakdown Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-800">تفاصيل تكلفة المنتجات</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-5 py-3">المنتج</th>
                <th className="px-5 py-3">سعر البيع</th>
                <th className="px-5 py-3 text-rose-600">التكلفة الإجمالية</th>
                <th className="px-5 py-3 text-blue-600">المكونات</th>
                <th className="px-5 py-3 text-amber-600">العمالة</th>
                <th className="px-5 py-3 text-gray-600">مرافق/تشغيل</th>
                <th className="px-5 py-3 text-emerald-600">الربح المقدر</th>
                <th className="px-5 py-3 text-violet-600">الهامش %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.products.map((p: any) => (
                <tr key={p.productId} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-bold text-gray-900">{p.productName}</td>
                  <td className="px-5 py-3 font-mono text-gray-700">{formatCurrency(p.sellingPrice)}</td>
                  <td className="px-5 py-3 font-mono font-bold text-rose-600 bg-rose-50/30">{formatCurrency(p.totalEstimatedCost)}</td>
                  <td className="px-5 py-3 font-mono text-blue-600">{formatCurrency(p.ingredientCost)}</td>
                  <td className="px-5 py-3 font-mono text-amber-600">{formatCurrency(p.laborCost)}</td>
                  <td className="px-5 py-3 font-mono text-gray-500">{formatCurrency(p.operationalCost + p.utilityCost)}</td>
                  <td className="px-5 py-3 font-mono font-black text-emerald-600 bg-emerald-50/30">{formatCurrency(p.estimatedProfit)}</td>
                  <td className="px-5 py-3 font-mono font-bold text-violet-600 bg-violet-50/30">
                    {p.profitMargin < 0 ? (
                      <span className="text-rose-600">{(p.profitMargin * 100).toFixed(1)}%</span>
                    ) : (
                      <span>{(p.profitMargin * 100).toFixed(1)}%</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

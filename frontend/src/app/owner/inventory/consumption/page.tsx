'use client';

import { useState, useEffect } from 'react';
import { 
  TrendingDown, TrendingUp, AlertTriangle, Package, Activity, 
  DollarSign, PieChart, Filter, ArrowDownRight, Clock, Droplet, Loader2
} from 'lucide-react';
import { fetchLowStockItems, fetchInventoryConsumption, fetchStockMovements, fetchMostConsumed } from '@/lib/api';

export default function ConsumptionDashboard() {
  const [filter, setFilter] = useState('اليوم');
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({ dailyConsumption: 0, weeklyConsumption: 0, dailyWaste: 0, wastePercentage: 0 });
  const [costAnalysis, setCostAnalysis] = useState<any[]>([]);
  const [batchLogs, setBatchLogs] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [lowStock, consumption, movements, mostConsumed] = await Promise.all([
          fetchLowStockItems().catch(() => []),
          fetchInventoryConsumption().catch(() => null),
          fetchStockMovements().catch(() => []),
          fetchMostConsumed(10).catch(() => []),
        ]);

        setAlerts((lowStock || []).map((item: any) => ({
          id: item.id,
          item: item.itemName,
          currentQty: Number(item.currentQty),
          threshold: Number(item.minThreshold),
          unit: item.unit || '',
          severity: Number(item.currentQty) <= Number(item.minThreshold) * 0.5 ? 'critical' : 'warning',
        })));

        if (consumption) {
          setMetrics({
            dailyConsumption: Number(consumption.dailyConsumption || 0),
            weeklyConsumption: Number(consumption.weeklyConsumption || 0),
            dailyWaste: Number(consumption.dailyWaste || 0),
            wastePercentage: Number(consumption.wastePercentage || 0),
          });
        }

        setCostAnalysis((mostConsumed || []).map((item: any, idx: number) => ({
          id: item.id || `c_${idx}`,
          name: item.itemName || item.name || '',
          ingredientsCost: Number(item.costPerUnit || 0),
          wasteCost: 0,
          totalCost: Number(item.costPerUnit || 0),
          sellingPrice: Number(item.sellingPrice || 0),
        })));

        setBatchLogs((movements || []).map((log: any) => ({
          id: log.id,
          date: log.createdAt ? new Date(log.createdAt).toLocaleString('ar-EG') : '',
          item: log.itemName || log.inventory?.itemName || '',
          action: log.type === 'DEDUCTION' ? 'استهلاك (مبيعات)' : log.type === 'WASTE' ? 'تالف (هدر)' : 'توريد (شراء)',
          qty: `${log.type === 'ADDITION' ? '+' : '-'}${Number(log.quantity || 0)} ${log.unit || ''}`,
          reason: log.notes || log.reason || '',
        })));
      } catch (e) {
        console.error('Failed to load consumption data', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-[#8C6239]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-slate-900 p-6 md:p-10 font-sans" dir="rtl">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#1E1513] tracking-tight">محرك الاستهلاك والتكاليف</h1>
          <p className="text-slate-500 font-medium mt-1">تتبع دقيق للمخزون، الهدر، وهوامش ربح المشروبات اللحظية.</p>
        </div>
        <div className="flex bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
          {['اليوم', 'هذا الأسبوع', 'هذا الشهر'].map(f => (
            <button 
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${filter === f ? 'bg-[#1E1513] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Low Stock Alerts */}
      {alerts.length > 0 && (
        <div className="mb-8">
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-rose-800 font-black flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5" /> تنبيهات المخزون الحرجة
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {alerts.map((alert: any) => (
                <div key={alert.id} className="bg-white border border-rose-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${alert.severity === 'critical' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                      <Droplet className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-800">{alert.item}</div>
                      <div className="text-xs text-slate-500 font-medium">الحد الأدنى: {alert.threshold} {alert.unit}</div>
                    </div>
                  </div>
                  <div className="text-left">
                    <div className={`font-black text-lg ${alert.severity === 'critical' ? 'text-rose-600' : 'text-amber-500'}`}>
                      {alert.currentQty} {alert.unit}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
              <Activity className="w-6 h-6" />
            </div>
            <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2.5 py-1 rounded-lg">اليوم</span>
          </div>
          <h3 className="text-slate-500 font-bold mb-1">قيمة الاستهلاك (مبيعات)</h3>
          <div className="text-3xl font-black text-[#1E1513]">{metrics.dailyConsumption.toFixed(2)} <span className="text-lg text-slate-400">ر.س</span></div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
              <TrendingUp className="w-6 h-6" />
            </div>
            <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2.5 py-1 rounded-lg">هذا الأسبوع</span>
          </div>
          <h3 className="text-slate-500 font-bold mb-1">إجمالي الاستهلاك الأسبوعي</h3>
          <div className="text-3xl font-black text-[#1E1513]">{metrics.weeklyConsumption.toFixed(2)} <span className="text-lg text-slate-400">ر.س</span></div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-rose-500"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 group-hover:scale-110 transition-transform">
              <Trash2Icon className="w-6 h-6" />
            </div>
            <span className="bg-rose-100 text-rose-600 text-xs font-bold px-2.5 py-1 rounded-lg">تكلفة مفقودة</span>
          </div>
          <h3 className="text-slate-500 font-bold mb-1">قيمة الهدر (اليوم)</h3>
          <div className="text-3xl font-black text-rose-600">{metrics.dailyWaste.toFixed(2)} <span className="text-lg text-rose-400">ر.س</span></div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform">
              <PieChart className="w-6 h-6" />
            </div>
            <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2.5 py-1 rounded-lg">مؤشر أداء</span>
          </div>
          <h3 className="text-slate-500 font-bold mb-1">نسبة الهدر من المبيعات</h3>
          <div className="text-3xl font-black text-amber-600">{metrics.wastePercentage}%</div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Cost Analysis Table (Occupies 2 columns) */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h2 className="text-xl font-black text-[#1E1513] flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#8C6239]" />
              تحليل تكلفة المشروبات (Cost Per Drink)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm">
                  <th className="py-4 px-6 font-bold">المنتج</th>
                  <th className="py-4 px-6 font-bold">تكلفة المكونات</th>
                  <th className="py-4 px-6 font-bold text-rose-500">تأثير الهدر (+5%)</th>
                  <th className="py-4 px-6 font-bold text-[#8C6239]">التكلفة الإجمالية</th>
                  <th className="py-4 px-6 font-bold">سعر البيع</th>
                  <th className="py-4 px-6 font-bold text-center">هامش الربح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {costAnalysis.map((item: any) => {
                  const profitMargin = item.sellingPrice > 0 ? ((item.sellingPrice - item.totalCost) / item.sellingPrice) * 100 : 0;
                  const isLowMargin = profitMargin < 50;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-6 font-black text-slate-800">{item.name}</td>
                      <td className="py-4 px-6 font-medium text-slate-500">{item.ingredientsCost.toFixed(2)} ر.س</td>
                      <td className="py-4 px-6 font-medium text-rose-500">+{item.wasteCost.toFixed(2)} ر.س</td>
                      <td className="py-4 px-6 font-black text-[#1E1513]">{item.totalCost.toFixed(2)} ر.س</td>
                      <td className="py-4 px-6 font-bold text-slate-700">{item.sellingPrice.toFixed(2)} ر.س</td>
                      <td className="py-4 px-6">
                        <div className="flex justify-center">
                          <span className={`px-3 py-1 rounded-lg text-sm font-black flex items-center gap-1 ${
                            isLowMargin ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {isLowMargin && <ArrowDownRight className="w-3 h-3" />}
                            {profitMargin.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {costAnalysis.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-bold">
                      لا توجد بيانات متاحة حالياً
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Batch Tracking / Sync Logs (Occupies 1 column) */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 bg-slate-50">
            <h2 className="text-xl font-black text-[#1E1513] flex items-center gap-2">
              <Package className="w-5 h-5 text-[#8C6239]" />
              سجل استهلاك الدفعات اللحظي
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[500px]">
            {batchLogs.length === 0 ? (
              <div className="text-center py-10 text-slate-400 font-bold">لا توجد حركات مخزنية</div>
            ) : (
              batchLogs.map((log: any) => {
                const isDeduction = log.qty.startsWith('-');
                return (
                  <div key={log.id} className="p-4 border border-slate-100 rounded-2xl flex gap-4 hover:shadow-md transition-shadow bg-slate-50/50">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isDeduction ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {isDeduction ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-slate-800 text-sm">{log.item}</h4>
                        <span className={`font-black text-sm dir-ltr ${isDeduction ? 'text-indigo-600' : 'text-emerald-600'}`}>
                          {log.qty}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 font-medium mb-2">{log.action}</div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {log.date}</span>
                        <span className="bg-white border border-slate-200 px-2 py-0.5 rounded-md">{log.reason}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

function Trash2Icon(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>;
}

'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Wallet, DollarSign, Activity, Users, Monitor, Gamepad2, TrendingUp, TrendingDown, Receipt, Calendar } from 'lucide-react';

interface FinanceData {
  totalRevenue: number;
  totalExpenses: number;
  profit: number;
  weeklyExpenses: number;
  monthlyExpenses: number;
  sourceBreakdown: {
    pos: number;
    ps: number;
    other: number;
  };
  employeeBreakdown: Array<{ name: string; amount: number }>;
  expenseEmployeeBreakdown: Array<{ name: string; amount: number }>;
  recentExpenses: Array<{
    id: string;
    category: string;
    description: string;
    amount: number;
    employeeName: string;
    date: string;
  }>;
}

export function UnifiedFinanceDashboard() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchFinance = async () => {
    try {
      const res = await api.get('/finance/dashboard/today');
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch finance dashboard', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinance();
    const interval = setInterval(fetchFinance, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading || !data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm min-h-[300px] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-violet-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Level Financial Health */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700">صافي الأرباح (اليوم)</p>
              <p className="text-2xl font-black text-emerald-800 font-mono mt-1">{data.profit.toFixed(2)} ج.م</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">إجمالي إيرادات اليوم</p>
              <p className="text-2xl font-black text-slate-800 font-mono mt-1">{data.totalRevenue.toFixed(2)} ج.م</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <TrendingDown className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-rose-700">إجمالي مصروفات اليوم</p>
              <p className="text-2xl font-black text-rose-800 font-mono mt-1">{data.totalExpenses.toFixed(2)} ج.م</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue Breakdown */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6 flex flex-col">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Activity className="h-4 w-4 text-violet-600" />
            <span>تحليل الإيرادات</span>
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center gap-2 mb-2 text-slate-600">
                <Monitor className="h-4 w-4" />
                <span className="text-xs font-bold">مبيعات الكاشير</span>
              </div>
              <p className="text-lg font-black text-slate-800 font-mono">{data.sourceBreakdown.pos.toFixed(2)} ج.م</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center gap-2 mb-2 text-slate-600">
                <Gamepad2 className="h-4 w-4" />
                <span className="text-xs font-bold">البلايستيشن</span>
              </div>
              <p className="text-lg font-black text-slate-800 font-mono">{data.sourceBreakdown.ps.toFixed(2)} ج.م</p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-500 mb-3 uppercase">المبيعات حسب الموظف</h4>
            {data.employeeBreakdown.length === 0 ? (
              <p className="text-xs text-slate-400">لا توجد مبيعات مسجلة اليوم.</p>
            ) : (
              <div className="space-y-2">
                {data.employeeBreakdown.map((emp, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <span className="text-sm font-bold text-slate-700">{emp.name || 'غير معروف'}</span>
                    <span className="text-sm font-black text-violet-600 font-mono">{emp.amount.toFixed(2)} ج.م</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Expenses Tracking */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6 flex flex-col">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Receipt className="h-4 w-4 text-rose-500" />
            <span>تحليل المصروفات</span>
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center gap-2 mb-2 text-slate-600">
                <Calendar className="h-4 w-4" />
                <span className="text-xs font-bold">مصروفات الأسبوع</span>
              </div>
              <p className="text-lg font-black text-slate-800 font-mono">{data.weeklyExpenses.toFixed(2)} ج.م</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center gap-2 mb-2 text-slate-600">
                <Calendar className="h-4 w-4" />
                <span className="text-xs font-bold">مصروفات الشهر</span>
              </div>
              <p className="text-lg font-black text-slate-800 font-mono">{data.monthlyExpenses.toFixed(2)} ج.م</p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-500 mb-3 uppercase">المصروفات حسب الموظف (اليوم)</h4>
            {data.expenseEmployeeBreakdown.length === 0 ? (
              <p className="text-xs text-slate-400">لا توجد مصروفات مسجلة اليوم.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {data.expenseEmployeeBreakdown.map((emp, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <span className="text-sm font-bold text-slate-700">{emp.name || 'غير معروف'}</span>
                    <span className="text-sm font-black text-rose-500 font-mono">{emp.amount.toFixed(2)} ج.م</span>
                  </div>
                ))}
              </div>
            )}
            
            <h4 className="text-xs font-bold text-slate-500 mb-3 uppercase mt-6">سجل مصروفات اليوم</h4>
            {data.recentExpenses.length === 0 ? (
              <p className="text-xs text-slate-400">السجل فارغ.</p>
            ) : (
              <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                {data.recentExpenses.map((ex) => (
                  <div key={ex.id} className="rounded-xl border border-slate-100 p-3 bg-white shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{ex.description}</p>
                        <p className="text-[10px] text-slate-500">{ex.category} • بواسطة: {ex.employeeName}</p>
                      </div>
                      <span className="text-sm font-black text-rose-500 font-mono">{ex.amount.toFixed(2)} ج.م</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import api from '@/lib/api';
import {
  DollarSign, TrendingUp, ShoppingCart, CheckCircle2, XCircle,
  Wallet, Receipt, Calculator, Users, Gamepad2, AlertTriangle,
  Store, Signal, Loader2, RefreshCw, Coffee, GamepadIcon, ChefHat,
} from 'lucide-react';

interface Snapshot {
  todayRevenue: number;
  todayOrders: number;
  pendingOrders: number;
  lowStockItems: number;
  activeDrivers: number;
  totalCustomers: number;
  totalProducts: number;
}

interface DashboardRes {
  snapshot: Snapshot;
  dailyReport: { totalRevenue: number; totalOrders: number; topSellingItems: { name: string; qty: number }[] };
  lowStockItems: any[];
  productProfitability: { mostProfitable: any[]; leastProfitable: any[]; lowMarginCount: number } | null;
  attendanceSummary: { totalStaff: number; totalDaysWorked: number; totalHours: number; totalLaborCost: number; staff: any[] };
  psReport?: {
    totalRevenue: number;
    todayRevenue: number;
    monthRevenue: number;
    revenuePerDevice: { deviceId: string; deviceName: string; revenue: number; sessions: number }[];
    revenuePerEmployee: { employeeId: string; employeeName: string; revenue: number; sessions: number }[];
    activeSessions: number;
    completedSessions: number;
    unpaidSessions: { count: number; totalUnpaidRevenue: number };
  };
}

interface FinanceRes {
  totalRevenue: number;
  sourceBreakdown: { pos: number; ps: number; other: number };
  totalExpenses: number;
  monthRevenue: number;
  expensesWeeklyAgg: { _sum?: { amount?: number } };
  expensesMonthlyAgg: { _sum?: { amount?: number } };
  recentExpenses: any[];
  employeeBreakdown: Record<string, { name: string; amount: number }>;
  expenseEmployeeBreakdown: Record<string, { name: string; amount: number }>;
}

const NA = <span className="text-sm text-slate-400 font-medium">غير متوفر</span>;

export default function OwnerDashboard() {
  useSocket('/owner');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cafeName, setCafeName] = useState('سونيك كوفي');

  const [dashboard, setDashboard] = useState<DashboardRes | null>(null);
  const [finance, setFinance] = useState<FinanceRes | null>(null);
  const [debtTotal, setDebtTotal] = useState<number | null>(null);
  const [activeShifts, setActiveShifts] = useState<any[]>([]);
  const [activePS, setActivePS] = useState<any[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCafeName(sessionStorage.getItem('sonic_cafe_name') || 'سونيك كوفي');
    }
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [
        dashRes, finRes, debtsRes, shiftsRes, psRes, psReportRes,
      ] = await Promise.all([
        api.get('/dashboard/Cafe').catch(() => null),
        api.get('/finance/dashboard/today').catch(() => null),
        api.get('/payments/debt-overview').catch(() => null),
        api.get('/attendance/active-shifts').catch(() => null),
        api.get('/playstation/sessions/active').catch(() => null),
        api.get('/playstation/reports/owner').catch(() => null),
      ]);
      if (dashRes) setDashboard({ ...dashRes.data, psReport: psReportRes?.data || null });
      if (finRes) setFinance(finRes.data);
      if (debtsRes?.data) setDebtTotal(Number(debtsRes.data.totalDebt ?? debtsRes.data.total ?? 0));
      if (shiftsRes) setActiveShifts(Array.isArray(shiftsRes.data) ? shiftsRes.data : []);
      if (psRes) setActivePS(Array.isArray(psRes.data) ? psRes.data : []);
      setError(null);
    } catch {
      setError('فشل تحميل بيانات لوحة التحكم');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); const iv = setInterval(fetchAll, 30000); return () => clearInterval(iv); }, [fetchAll]);

  const snap = dashboard?.snapshot;
  const fin = finance;
  const dailyRev = dashboard?.dailyReport?.totalRevenue
    ?? (fin ? fin.totalRevenue - (fin.sourceBreakdown?.ps || 0) : null);
  const todayExp = fin?.totalExpenses ?? null;
  const monthExp = fin?.expensesMonthlyAgg?._sum?.amount
    ? Number(fin.expensesMonthlyAgg._sum.amount)
    : null;
  const netProfit = dailyRev !== null && todayExp !== null ? dailyRev - todayExp : null;

  const lowStockList = dashboard?.lowStockItems || [];

  const formatCurrency = (v: number | null) =>
    v !== null ? `${v.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م` : NA;

  const MetricCard = ({ title, value, icon: Icon, color, bgColor, subtitle, loading: cardLoading }: any) => (
    <div className="bg-white rounded-3xl p-6 border border-[#E8E1D9] shadow-sm relative overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
      <div className={`absolute top-0 left-0 w-full h-1 ${color}`} />
      <div className="flex justify-between items-start mb-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform ${bgColor}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <h3 className="text-sm font-bold text-slate-500 mb-1">{title}</h3>
      {cardLoading ? (
        <div className="h-9 w-24 rounded-lg bg-slate-100 animate-pulse" />
      ) : (
        <div className="text-3xl font-black text-[#1E1513]">{value}</div>
      )}
      {subtitle && <p className="text-xs font-medium text-slate-400 mt-2">{subtitle}</p>}
    </div>
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-slate-100">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-amber-500" />
          <span className="text-sm font-bold text-slate-400">جاري تحميل لوحة التحكم...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 font-sans pb-10" dir="rtl">

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-[#E8E1D9]">
        <div>
          <h1 className="text-3xl font-black text-[#1E1513] tracking-tight">لوحة تحكم المالك</h1>
          <p className="text-sm font-medium text-slate-500 mt-2">جميع الأرقام من قاعدة البيانات الفعلية</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 rounded-2xl bg-white border border-[#E8E1D9] p-3 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#8C6239]/10 text-[#8C6239]">
              <Store className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">الكافيه</span>
              <span className="text-sm font-black text-[#1E1513]">{cafeName}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white border border-[#E8E1D9] p-3 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Signal className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">الحالة</span>
              <span className="flex items-center gap-1.5 text-xs font-black text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                بيانات حية
              </span>
            </div>
          </div>
          <button onClick={fetchAll} className="flex items-center gap-1.5 rounded-xl bg-white border border-[#E8E1D9] p-3 text-slate-600 hover:bg-slate-50 transition-all text-xs font-bold">
            <RefreshCw className="h-4 w-4" />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-rose-700 text-sm font-bold">
          {error}
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

        {/* Today's Revenue */}
        <MetricCard
          title="إيرادات اليوم"
          value={formatCurrency(dailyRev)}
          icon={DollarSign} color="bg-[#8C6239]" bgColor="bg-[#8C6239]/10 text-[#8C6239]"
          subtitle="من جميع مصادر الدخل"
        />

        {/* Monthly Revenue */}
        <MetricCard
          title="إيرادات الشهر"
          value={
            fin?.monthRevenue != null
              ? formatCurrency(fin.monthRevenue)
              : snap?.todayRevenue
              ? formatCurrency(snap.todayRevenue * 30)
              : NA
          }
          icon={TrendingUp} color="bg-blue-500" bgColor="bg-blue-50 text-blue-600"
          subtitle={fin?.monthRevenue != null ? 'من الطلبات (دون البلاي ستيشن)' : 'تقديري (اليوم × 30)'}
        />

        {/* Net Profit */}
        <MetricCard
          title="صافي ربح اليوم"
          value={netProfit !== null ? formatCurrency(netProfit) : NA}
          icon={Calculator} color="bg-emerald-500" bgColor="bg-emerald-50 text-emerald-600"
          subtitle={netProfit !== null && netProfit >= 0 ? 'إيجابي' : 'سلبي'}
        />

        {/* Today's Orders */}
        <MetricCard
          title="طلبات اليوم"
          value={snap?.todayOrders ?? NA}
          icon={ShoppingCart} color="bg-indigo-500" bgColor="bg-indigo-50 text-indigo-600"
        />

        {/* Paid Orders */}
        <MetricCard
          title="إجمالي الطلبات"
          value={dashboard?.dailyReport?.totalOrders ?? NA}
          icon={CheckCircle2} color="bg-emerald-400" bgColor="bg-emerald-50 text-emerald-500"
          subtitle={dashboard?.dailyReport ? `من إجمالي ${snap?.todayOrders ?? '?'}` : undefined}
        />

        {/* Unpaid Orders */}
        <MetricCard
          title="الطلبات غير المدفوعة"
          value={snap?.pendingOrders ?? NA}
          icon={XCircle} color="bg-rose-400" bgColor="bg-rose-50 text-rose-500"
          subtitle="يتطلب المتابعة"
        />

        {/* Outstanding Debts */}
        <MetricCard
          title="مديونيات معلقة (آجل)"
          value={debtTotal !== null ? formatCurrency(debtTotal) : NA}
          icon={Wallet} color="bg-amber-500" bgColor="bg-amber-50 text-amber-600"
        />

        {/* Daily Expenses */}
        <MetricCard
          title="مصروفات اليوم"
          value={todayExp !== null ? formatCurrency(todayExp) : NA}
          icon={Receipt} color="bg-rose-500" bgColor="bg-rose-50 text-rose-600"
        />

        {/* Monthly Expenses */}
        <MetricCard
          title="المصروفات الشهرية"
          value={monthExp !== null ? formatCurrency(monthExp) : NA}
          icon={Receipt} color="bg-rose-600" bgColor="bg-rose-50 text-rose-700"
        />

        {/* Active Employees */}
        <MetricCard
          title="الموظفين المتصلين"
          value={activeShifts.length > 0 ? activeShifts.length : NA}
          icon={Users} color="bg-cyan-500" bgColor="bg-cyan-50 text-cyan-600"
          subtitle="مسجلين حالياً"
        />

        {/* Active PlayStation Sessions */}
        <MetricCard
          title="جلسات بلايستيشن نشطة"
          value={activePS.length > 0 ? activePS.length : 0}
          icon={Gamepad2} color="bg-violet-500" bgColor="bg-violet-50 text-violet-600"
          subtitle={activePS.length > 0 ? `${activePS.filter((s: any) => s.status === 'Running').length} قيد التشغيل` : 'لا توجد جلسات'}
        />

        {/* Low Stock Alerts */}
        <MetricCard
          title="تنبيهات نواقص المخزون"
          value={snap?.lowStockItems ?? lowStockList.length ?? NA}
          icon={AlertTriangle} color="bg-rose-600" bgColor="bg-rose-100 text-rose-600"
          subtitle={lowStockList.length > 0 ? `${lowStockList.length} أصناف تحتاج توريد` : undefined}
        />

        {/* Total Customers */}
        <MetricCard
          title="إجمالي العملاء"
          value={snap?.totalCustomers ?? NA}
          icon={Users} color="bg-teal-500" bgColor="bg-teal-50 text-teal-600"
        />

        {/* Active Products */}
        <MetricCard
          title="المنتجات النشطة"
          value={snap?.totalProducts ?? NA}
          icon={Coffee} color="bg-amber-600" bgColor="bg-amber-50 text-amber-700"
        />

        {/* Attendance Total Staff */}
        <MetricCard
          title="عدد الموظفين (هذا الشهر)"
          value={dashboard?.attendanceSummary?.totalStaff ?? NA}
          icon={ChefHat} color="bg-orange-500" bgColor="bg-orange-50 text-orange-600"
          subtitle={dashboard?.attendanceSummary ? `${Math.round(dashboard.attendanceSummary.totalHours)} ساعة عمل` : undefined}
        />
      </div>

      {/* Revenue Source Breakdown */}
      {fin?.sourceBreakdown && (
        <section className="bg-white rounded-3xl p-6 border border-[#E8E1D9] shadow-sm">
          <h2 className="text-lg font-black text-[#1E1513] mb-4">توزيع الإيرادات حسب المصدر</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'المبيعات (POS)', value: fin.sourceBreakdown.pos, color: 'bg-emerald-500', icon: DollarSign },
              { label: 'بلاي ستيشن', value: fin.sourceBreakdown.ps, color: 'bg-violet-500', icon: GamepadIcon },
              { label: 'مصادر أخرى', value: fin.sourceBreakdown.other, color: 'bg-slate-500', icon: TrendingUp },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${item.color} text-white`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-500">{item.label}</span>
                </div>
                <p className="text-2xl font-black text-[#1E1513]">{formatCurrency(item.value)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Low Stock Detail */}
      {lowStockList.length > 0 && (
        <section className="bg-white rounded-3xl p-6 border border-[#E8E1D9] shadow-sm">
          <h2 className="text-lg font-black text-[#1E1513] mb-4">🔔 أصناف المخزون منخفضة</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-xs font-bold">
                  <th className="px-4 py-3 text-right">الصنف</th>
                  <th className="px-4 py-3 text-right">الوحدة</th>
                  <th className="px-4 py-3 text-right">الكمية الحالية</th>
                  <th className="px-4 py-3 text-right">الحد الأدنى</th>
                </tr>
              </thead>
              <tbody>
                {lowStockList.slice(0, 10).map((item: any) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50 text-xs text-slate-700">
                    <td className="px-4 py-3 font-bold text-slate-800">{item.itemName || item.name}</td>
                    <td className="px-4 py-3">{item.unit || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-rose-600">{Number(item.currentQty ?? item.currentQty).toFixed(1)}</span>
                    </td>
                    <td className="px-4 py-3">{Number(item.minThreshold ?? item.minThreshold).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lowStockList.length > 10 && (
              <p className="text-xs text-slate-400 mt-3 text-center">وعرض {lowStockList.length - 10} صنف إضافي</p>
            )}
          </div>
        </section>
      )}

      {/* Top Selling Items */}
      {dashboard?.dailyReport?.topSellingItems && dashboard.dailyReport.topSellingItems.length > 0 && (
        <section className="bg-white rounded-3xl p-6 border border-[#E8E1D9] shadow-sm">
          <h2 className="text-lg font-black text-[#1E1513] mb-4">🏆 الأكثر مبيعاً اليوم</h2>
          <div className="space-y-2">
            {dashboard.dailyReport.topSellingItems.map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-100">
                <span className="text-xs font-bold text-slate-700">{item.name}</span>
                <span className="text-xs font-black text-indigo-600 font-mono">{Number(item.qty).toFixed(0)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Expenses */}
      {fin?.recentExpenses && fin.recentExpenses.length > 0 && (
        <section className="bg-white rounded-3xl p-6 border border-[#E8E1D9] shadow-sm">
          <h2 className="text-lg font-black text-[#1E1513] mb-4">🧾 آخر المصروفات</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-xs font-bold">
                  <th className="px-4 py-3 text-right">البيان</th>
                  <th className="px-4 py-3 text-right">التصنيف</th>
                  <th className="px-4 py-3 text-right">المبلغ</th>
                  <th className="px-4 py-3 text-right">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {fin.recentExpenses.slice(0, 5).map((ex: any) => (
                  <tr key={ex.id} className="border-b last:border-0 hover:bg-slate-50 text-xs text-slate-700">
                    <td className="px-4 py-3 font-bold text-slate-800">{ex.description || '—'}</td>
                    <td className="px-4 py-3">{ex.category}</td>
                    <td className="px-4 py-3 font-mono font-bold text-rose-600">{formatCurrency(Number(ex.amount))}</td>
                    <td className="px-4 py-3">{ex.date ? new Date(ex.date).toLocaleDateString('ar-EG') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* PlayStation Revenue Report */}
      {dashboard?.psReport && (
        <section className="bg-white rounded-3xl p-6 border border-[#E8E1D9] shadow-sm">
          <h2 className="text-lg font-black text-[#1E1513] mb-4 flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-violet-500" />
            <span>🎮 تقرير البلاي ستيشن</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-2xl bg-violet-50 p-3 border border-violet-100">
              <p className="text-[10px] font-bold text-violet-500">إجمالي الإيرادات</p>
              <p className="text-lg font-black text-[#1E1513]">{formatCurrency(dashboard.psReport.totalRevenue)}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-3 border border-emerald-100">
              <p className="text-[10px] font-bold text-emerald-500">إيرادات اليوم</p>
              <p className="text-lg font-black text-[#1E1513]">{formatCurrency(dashboard.psReport.todayRevenue)}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-3 border border-amber-100">
              <p className="text-[10px] font-bold text-amber-500">إيرادات الشهر</p>
              <p className="text-lg font-black text-[#1E1513]">{formatCurrency(dashboard.psReport.monthRevenue)}</p>
            </div>
            <div className="rounded-2xl bg-rose-50 p-3 border border-rose-100">
              <p className="text-[10px] font-bold text-rose-500">جلسات غير مدفوعة</p>
              <p className="text-lg font-black text-[#1E1513]">{dashboard.psReport.unpaidSessions.count}</p>
              <p className="text-[10px] text-rose-400 font-bold">{formatCurrency(dashboard.psReport.unpaidSessions.totalUnpaidRevenue)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Revenue Per Device */}
            {dashboard.psReport.revenuePerDevice?.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-600 mb-2">الإيرادات لكل جهاز</h3>
                <div className="space-y-1.5">
                  {dashboard.psReport.revenuePerDevice.slice(0, 6).map((d: any) => (
                    <div key={d.deviceId} className="flex justify-between items-center bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                      <span className="text-xs font-bold text-slate-700">{d.deviceName}</span>
                      <div className="text-left">
                        <span className="text-xs font-black text-violet-600 font-mono">{formatCurrency(d.revenue)}</span>
                        <span className="text-[10px] text-slate-400 mr-2">({d.sessions} جلسة)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Revenue Per Employee */}
            {dashboard.psReport.revenuePerEmployee?.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-600 mb-2">الإيرادات لكل موظف</h3>
                <div className="space-y-1.5">
                  {dashboard.psReport.revenuePerEmployee.slice(0, 6).map((e: any) => (
                    <div key={e.employeeId} className="flex justify-between items-center bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                      <span className="text-xs font-bold text-slate-700">{e.employeeName}</span>
                      <div className="text-left">
                        <span className="text-xs font-black text-violet-600 font-mono">{formatCurrency(e.revenue)}</span>
                        <span className="text-[10px] text-slate-400 mr-2">({e.sessions} جلسة)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-50 p-3 text-center border border-slate-100">
              <p className="text-[10px] font-bold text-slate-500">جلسات نشطة</p>
              <p className="text-2xl font-black text-violet-600">{dashboard.psReport.activeSessions}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center border border-slate-100">
              <p className="text-[10px] font-bold text-slate-500">جلسات مكتملة</p>
              <p className="text-2xl font-black text-emerald-600">{dashboard.psReport.completedSessions}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center border border-slate-100">
              <p className="text-[10px] font-bold text-slate-500">غير مدفوعة</p>
              <p className="text-2xl font-black text-rose-600">{dashboard.psReport.unpaidSessions.count}</p>
            </div>
          </div>
        </section>
      )}

      {/* Active PlayStation Sessions Detail */}
      {activePS.length > 0 && (
        <section className="bg-white rounded-3xl p-6 border border-[#E8E1D9] shadow-sm">
          <h2 className="text-lg font-black text-[#1E1513] mb-4">🎮 جلسات البلاي ستيشن النشطة</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activePS.map((s: any) => (
              <div key={s.id} className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold text-slate-800">{s.device?.name || 'جهاز'}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    s.status === 'Running' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {s.status === 'Running' ? 'قيد التشغيل' : 'وقت مجاني'}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{s.customerName}</p>
                <p className="text-[10px] text-slate-400 mt-1">
                  منذ {Math.round((Date.now() - new Date(s.startTime).getTime()) / 60000)} دقيقة
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active Employees Detail */}
      {activeShifts.length > 0 && (
        <section className="bg-white rounded-3xl p-6 border border-[#E8E1D9] shadow-sm">
          <h2 className="text-lg font-black text-[#1E1513] mb-4">👤 الموظفون في الدوام حالياً</h2>
          <div className="flex flex-wrap gap-3">
            {activeShifts.map((s: any) => (
              <div key={s.id} className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-700 font-bold text-xs">
                  {s.staff?.name?.charAt(0) || '?'}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">{s.staff?.name || 'موظف'}</p>
                  <p className="text-[10px] text-slate-400">{s.staff?.role || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Attendance Summary */}
      {dashboard?.attendanceSummary && (
        <section className="bg-white rounded-3xl p-6 border border-[#E8E1D9] shadow-sm">
          <h2 className="text-lg font-black text-[#1E1513] mb-4">📋 ملخص الحضور (الشهر الحالي)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 text-center">
              <p className="text-2xl font-black text-[#1E1513]">{dashboard.attendanceSummary.totalStaff}</p>
              <p className="text-xs text-slate-500">موظف</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 text-center">
              <p className="text-2xl font-black text-[#1E1513]">{dashboard.attendanceSummary.totalDaysWorked}</p>
              <p className="text-xs text-slate-500">يوم عمل</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 text-center">
              <p className="text-2xl font-black text-[#1E1513]">{Math.round(dashboard.attendanceSummary.totalHours)}</p>
              <p className="text-xs text-slate-500">ساعة عمل</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 text-center">
              <p className="text-2xl font-black text-[#1E1513]">{formatCurrency(dashboard.attendanceSummary.totalLaborCost)}</p>
              <p className="text-xs text-slate-500">تكلفة العمالة</p>
            </div>
          </div>
        </section>
      )}

      {/* Management Quick Actions */}
      <section className="bg-white rounded-3xl p-6 border border-[#E8E1D9] shadow-sm">
        <h2 className="text-lg font-black text-[#1E1513] mb-4">⚡ إدارة سريعة</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <a href="/owner/management?tab=products"
            className="rounded-2xl bg-violet-50 border border-violet-100 p-4 text-center hover:shadow-md hover:bg-violet-100 transition-all">
            <p className="text-2xl mb-1">☕</p>
            <p className="text-xs font-bold text-violet-700">إدارة المنتجات</p>
          </a>
          <a href="/owner/management?tab=categories"
            className="rounded-2xl bg-amber-50 border border-amber-100 p-4 text-center hover:shadow-md hover:bg-amber-100 transition-all">
            <p className="text-2xl mb-1">📁</p>
            <p className="text-xs font-bold text-amber-700">التصنيفات</p>
          </a>
          <a href="/owner/management?tab=recipes"
            className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-center hover:shadow-md hover:bg-emerald-100 transition-all">
            <p className="text-2xl mb-1">📖</p>
            <p className="text-xs font-bold text-emerald-700">الوصفات</p>
          </a>
          <a href="/owner/management?tab=employees"
            className="rounded-2xl bg-blue-50 border border-blue-100 p-4 text-center hover:shadow-md hover:bg-blue-100 transition-all">
            <p className="text-2xl mb-1">👥</p>
            <p className="text-xs font-bold text-blue-700">الموظفين</p>
          </a>
          <a href="/owner/management?tab=analytics"
            className="rounded-2xl bg-rose-50 border border-rose-100 p-4 text-center hover:shadow-md hover:bg-rose-100 transition-all">
            <p className="text-2xl mb-1">📊</p>
            <p className="text-xs font-bold text-rose-700">التحليلات</p>
          </a>
          <a href="/owner/management?tab=low-stock"
            className="rounded-2xl bg-red-50 border border-red-100 p-4 text-center hover:shadow-md hover:bg-red-100 transition-all">
            <p className="text-2xl mb-1">⚠️</p>
            <p className="text-xs font-bold text-red-700">المخزون المنخفض</p>
          </a>
          <a href="/owner/management?tab=costing"
            className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4 text-center hover:shadow-md hover:bg-indigo-100 transition-all">
            <p className="text-2xl mb-1">💰</p>
            <p className="text-xs font-bold text-indigo-700">التكلفة والأرباح</p>
          </a>
          <a href="/owner/inventory"
            className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-center hover:shadow-md hover:bg-slate-100 transition-all">
            <p className="text-2xl mb-1">📦</p>
            <p className="text-xs font-bold text-slate-700">المخزون الكامل</p>
          </a>
        </div>
      </section>

      {/* Low Stock Alert Widget (when items are low) */}
      {lowStockList.length > 0 && (
        <section className="bg-white rounded-3xl p-6 border border-red-200 shadow-sm bg-gradient-to-br from-red-50 to-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <h2 className="text-lg font-black text-red-800">⚠️ مخزون منخفض</h2>
            </div>
            <a href="/owner/management?tab=low-stock" className="text-xs font-bold text-red-600 hover:text-red-800 underline">
              إدارة المخزون
            </a>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lowStockList.slice(0, 6).map((item: any) => (
              <div key={item.id} className="rounded-xl bg-white border border-red-100 p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800">{item.itemName}</p>
                  <p className="text-xs text-slate-400">الحد الأدنى: {Number(item.minThreshold).toFixed(0)}</p>
                </div>
                <div className="text-left">
                  <p className={`text-lg font-black ${Number(item.currentQty) <= 0 ? 'text-red-600' : 'text-amber-600'}`}>
                    {Number(item.currentQty).toFixed(0)}
                  </p>
                  <p className="text-[10px] text-slate-400">{item.unit}</p>
                </div>
              </div>
            ))}
            {lowStockList.length > 6 && (
              <div className="rounded-xl bg-red-100 border border-red-200 p-3 flex items-center justify-center text-center">
                <p className="text-xs font-bold text-red-700">+{lowStockList.length - 6} أصناف أخرى منخفضة</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Footer */}
      <div className="text-center text-[10px] text-slate-400 pt-4 border-t border-[#E8E1D9]">
        يتم تحديث البيانات تلقائياً كل 30 ثانية · جميع الأرقام من قاعدة البيانات الفعلية
      </div>
    </div>
  );
}

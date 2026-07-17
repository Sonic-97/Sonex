'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import {
  DollarSign, TrendingDown, TrendingUp, Clock, UserCheck,
  Wallet, CreditCard, Search, CheckCircle, Loader2,
} from 'lucide-react';

interface Debt {
  orderId: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  remainingAmount: number;
  paymentStatus: string;
  employeeName: string;
  employeeRole: string | null;
  createdAt: string;
}

interface PaidOrder {
  orderId: string;
  orderCode: string;
  customerName: string;
  amount: number;
  collectedAmount: number;
  method: string;
  collectedBy: string;
  collectedRole: string;
  employeeName: string;
  paidAt: string;
}

interface StaffEarning {
  id: string;
  name: string;
  role: string;
  salary: number;
  totalOrdersHandled: number;
  bonus: number;
  totalEarnings: number;
}

interface DriverEarning {
  id: string;
  name: string;
  deliveries: number;
  earnings: number;
}

interface PendingCash {
  id: string;
  driverId: string;
  driverName: string;
  amount: number;
  createdAt: string;
}

interface ClosingData {
  date: string;
  debts: Debt[];
  revenue: {
    totalRevenue: number;
    totalCollected: number;
    totalOrders: number;
    orders: PaidOrder[];
  };
  expenses: {
    salaries: number;
    inventoryPurchases: number;
    employeePayments: number;
    total: number;
  };
  profit: number;
  collections: {
    byStaff: Array<{ id: string; name: string; role: string; count: number; total: number }>;
    totalTransactions: number;
  };
  earnings: {
    staff: StaffEarning[];
    drivers: DriverEarning[];
  };
  pendingCash: PendingCash[];
}

type Tab = 'debts' | 'closing' | 'collections';

export default function OwnerClosingPage() {
  const [data, setData] = useState<ClosingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('debts');
  const [payingId, setPayingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const { data: d } = await api.get('/closing/end-of-day');
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const markPaid = async (orderId: string) => {
    setPayingId(orderId);
    try {
      await api.post(`/closing/orders/${orderId}/mark-paid`, {
        collectedById: 'owner',
        collectedRole: 'BARISTA',
      });
      fetchData();
    } finally {
      setPayingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-violet-600" />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'debts', label: 'ديون العملاء', icon: CreditCard },
    { key: 'closing', label: 'الإغلاق اليومي', icon: DollarSign },
    { key: 'collections', label: 'التحصيلات والأرباح', icon: UserCheck },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Date header */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Clock className="h-4 w-4" />
        نهاية اليوم — {data?.date || 'اليوم'}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === key ? 'bg-violet-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border'}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* Tab: Debts */}
      {tab === 'debts' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="ابحث في الديون..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
          </div>

          <div className="overflow-hidden rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                  <th className="px-4 py-3">الطلب</th>
                  <th className="px-4 py-3">العميل</th>
                  <th className="px-4 py-3">المبلغ</th>
                  <th className="px-4 py-3">الموظف</th>
                  <th className="px-4 py-3">التاريخ</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {(data?.debts || [])
                  .filter((d) => !search || d.orderCode.toLowerCase().includes(search.toLowerCase()) || d.customerName.toLowerCase().includes(search.toLowerCase()))
                  .map((d) => (
                    <tr key={d.orderId} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-gray-800">{d.orderCode}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-800">{d.customerName}</div>
                        {d.customerPhone && <div className="text-xs text-gray-400">{d.customerPhone}</div>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-red-600">{formatCurrency(d.amount)}</td>
                      <td className="px-4 py-3 text-gray-600">{d.employeeName}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{new Date(d.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => markPaid(d.orderId)} disabled={payingId === d.orderId}
                          className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50">
                          {payingId === d.orderId ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                          تم الدفع
                        </button>
                      </td>
                    </tr>
                  ))}
                {(!data?.debts || data.debts.length === 0) && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-green-600 font-medium">لا توجد ديون مستحقة</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Daily Closing */}
      {tab === 'closing' && data && (
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Revenue */}
          <div className="rounded-xl border bg-white p-5">
            <div className="flex items-center gap-2 text-green-600 text-sm font-medium mb-3">
              <TrendingUp className="h-4 w-4" /> الإيرادات
            </div>
            <p className="text-3xl font-bold text-green-700">{formatCurrency(data.revenue.totalRevenue)}</p>
            <p className="text-xs text-gray-500 mt-1">{data.revenue.totalOrders} طلب مدفوع</p>
            <div className="mt-3 max-h-32 overflow-y-auto space-y-1">
              {data.revenue.orders.slice(0, 10).map((o) => (
                <div key={o.orderId} className="flex justify-between text-xs text-gray-600">
                  <span className="font-mono">{o.orderCode}</span>
                  <span>{formatCurrency(o.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Expenses */}
          <div className="rounded-xl border bg-white p-5">
            <div className="flex items-center gap-2 text-red-600 text-sm font-medium mb-3">
              <TrendingDown className="h-4 w-4" /> المصروفات
            </div>
            <p className="text-3xl font-bold text-red-700">{formatCurrency(data.expenses.total)}</p>
            <div className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>الرواتب ({data.earnings.staff.length} موظف)</span>
                <span>{formatCurrency(data.expenses.salaries)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>مشتريات المخزون</span>
                <span>{formatCurrency(data.expenses.inventoryPurchases)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>مدفوعات الموظفين</span>
                <span>{formatCurrency(data.expenses.employeePayments)}</span>
              </div>
            </div>
          </div>

          {/* Profit */}
          <div className={`rounded-xl border p-5 ${data.profit >= 0 ? 'bg-white' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-2 text-violet-600 text-sm font-medium mb-3">
              <Wallet className="h-4 w-4" /> صافي الربح
            </div>
            <p className={`text-3xl font-bold ${data.profit >= 0 ? 'text-violet-700' : 'text-red-700'}`}>
              {data.profit >= 0 ? '' : '-'}{formatCurrency(Math.abs(data.profit))}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {data.profit >= 0 ? 'إغلاق إيجابي' : 'خسارة هذه الفترة'}
            </p>
            <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>الإيرادات</span>
                <span className="text-green-600">+{formatCurrency(data.revenue.totalRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span>المصروفات</span>
                <span className="text-red-600">-{formatCurrency(data.expenses.total)}</span>
              </div>
              <div className="flex justify-between font-semibold mt-1 pt-1 border-t border-gray-100">
                <span>صافي</span>
                <span className={data.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {data.profit >= 0 ? '+' : ''}{data.profit.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Collections & Earnings */}
      {tab === 'collections' && data && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Who collected money */}
          <div className="rounded-xl border bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-violet-600" /> تحصيلات اليوم
            </h3>
            {data.collections.byStaff.length === 0 ? (
              <p className="text-sm text-gray-400">لا توجد تحصيلات اليوم</p>
            ) : (
              <div className="space-y-2">
                {data.collections.byStaff.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.role} — {c.count} معاملة</p>
                    </div>
                    <p className="text-sm font-bold text-green-600">{formatCurrency(c.total)}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
              <span className="text-gray-500">إجمالي المعاملات</span>
              <span className="font-semibold">{data.collections.totalTransactions}</span>
            </div>
          </div>

          {/* Who earned money */}
          <div className="rounded-xl border bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-amber-600" /> أرباح الموظفين
            </h3>
            {data.earnings.staff.length === 0 ? (
              <p className="text-sm text-gray-400">لا توجد بيانات أرباح</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {data.earnings.staff.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{s.name}</p>
                      <p className="text-xs text-gray-500">{s.role} — {s.totalOrdersHandled} طلب</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-amber-600">{formatCurrency(s.totalEarnings)}</p>
                      {s.bonus > 0 && <p className="text-xs text-green-500">+{formatCurrency(s.bonus)} مكافأة</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Driver earnings */}
          <div className="rounded-xl border bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <TruckIcon className="h-4 w-4 text-emerald-600" /> أرباح السائقين
            </h3>
            {data.earnings.drivers.length === 0 ? (
              <p className="text-sm text-gray-400">لا توجد بيانات أرباح سائقين</p>
            ) : (
              <div className="space-y-2">
                {data.earnings.drivers.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{d.name}</p>
                      <p className="text-xs text-gray-500">{d.deliveries} توصيلة</p>
                    </div>
                    <p className="text-sm font-bold text-emerald-600">{formatCurrency(d.earnings)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending cash */}
          <div className="rounded-xl border bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-600" /> تسوية السائقين المعلقة
            </h3>
            {data.pendingCash.length === 0 ? (
              <p className="text-sm text-green-600 font-medium">لا توجد تسويات معلقة</p>
            ) : (
              <div className="space-y-2">
                {data.pendingCash.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-orange-50 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{p.driverName}</p>
                      <p className="text-xs text-gray-500">تم التقديم {new Date(p.createdAt).toLocaleDateString('ar-EG')}</p>
                    </div>
                    <p className="text-sm font-bold text-orange-600">{formatCurrency(p.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TruckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
    </svg>
  );
}

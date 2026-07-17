'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import {
  Plus, Search, Trash2, Loader2, DollarSign, CalendarDays,
  User, BadgeInfo, CreditCard, TrendingUp,
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface Staff {
  id: string;
  name: string;
  role: string;
}

interface EmployeePayment {
  id: string;
  staffId: string;
  amount: number;
  type: string;
  date: string;
  notes: string | null;
  staff: { id: string; name: string; role: string };
}

interface EarningsReport {
  staffId: string;
  name: string;
  role: string;
  salary: number;
  totalSalary: number;
  totalAdvance: number;
  totalBonus: number;
  totalPaid: number;
}

type Tab = 'payments' | 'report';

export default function OwnerEmployeePaymentsPage() {
  const [tab, setTab] = useState<Tab>('payments');
  const [staff, setStaff] = useState<Staff[]>([]);
  const [payments, setPayments] = useState<EmployeePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [report, setReport] = useState<EarningsReport[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);

  const [form, setForm] = useState({
    staffId: '',
    amount: 0,
    type: 'SALARY' as 'SALARY' | 'ADVANCE' | 'BONUS',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const [staffRes, paymentsRes] = await Promise.all([
        api.get('/staff'),
        api.get('/employee-payments'),
      ]);
      setStaff(Array.isArray(staffRes.data) ? staffRes.data : []);
      setPayments(Array.isArray(paymentsRes.data) ? paymentsRes.data : []);
    } catch {
      setStaff([]);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReport = useCallback(async () => {
    setLoadingReport(true);
    try {
      const { data } = await api.get('/employee-payments/report');
      setReport(Array.isArray(data) ? data : []);
    } catch {
      setReport([]);
    } finally {
      setLoadingReport(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (tab === 'report') fetchReport(); }, [tab, fetchReport]);

  const filtered = payments.filter((p) =>
    !search || p.staff?.name?.toLowerCase().includes(search.toLowerCase()) || p.type?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!form.staffId || form.amount <= 0) return;
    setSaving(true);
    try {
      await api.post('/employee-payments', form);
      setShowForm(false);
      setForm({ staffId: '', amount: 0, type: 'SALARY', date: new Date().toISOString().slice(0, 10), notes: '' });
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await api.delete(`/employee-payments/${id}`);
      fetchData();
    } finally {
      setDeleting(null);
    }
  };

  const typeColors: Record<string, string> = {
    SALARY: 'bg-blue-100 text-blue-700',
    ADVANCE: 'bg-amber-100 text-amber-700',
    BONUS: 'bg-green-100 text-green-700',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-violet-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('payments')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === 'payments' ? 'bg-violet-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border'}`}>
          <CreditCard className="h-4 w-4" /> المدفوعات
        </button>
        <button onClick={() => setTab('report')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === 'report' ? 'bg-violet-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border'}`}>
          <TrendingUp className="h-4 w-4" /> تقرير الأرباح
        </button>
      </div>

      {/* Tab: Payments */}
      {tab === 'payments' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="ابحث بالاسم أو النوع..." value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
            </div>
            <button onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
              <Plus className="h-4 w-4" /> تسجيل دفعة
            </button>
          </div>

          {/* Recording form */}
          {showForm && (
            <div className="rounded-xl border bg-white p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">تسجيل دفعة موظف</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <select value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
                  <option value="">اختر الموظف...</option>
                  {staff.filter((s) => s.role !== 'DRIVER').map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                  ))}
                </select>
                <input type="number" placeholder="المبلغ" value={form.amount || ''}
                  onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
                  <option value="SALARY">راتب</option>
                  <option value="ADVANCE">سلفة</option>
                  <option value="BONUS">مكافأة</option>
                </select>
                <input type="date" value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
              </div>
              <div>
                <input type="text" placeholder="ملاحظات (اختياري)" value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowForm(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">إلغاء</button>
                <button onClick={handleSubmit} disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors disabled:opacity-50">
                  {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                  حفظ الدفعة
                </button>
              </div>
            </div>
          )}

          {/* Payments table */}
          <div className="overflow-hidden rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                  <th className="px-4 py-3">الموظف</th>
                  <th className="px-4 py-3">المبلغ</th>
                  <th className="px-4 py-3">النوع</th>
                  <th className="px-4 py-3">التاريخ</th>
                  <th className="px-4 py-3">ملاحظات</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{p.staff?.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-400">{p.staff?.role || ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${typeColors[p.type] || 'bg-gray-100 text-gray-600'}`}>
                        {p.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{new Date(p.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">{p.notes || '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                        {deleting === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">لا توجد مدفوعات مسجلة</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Earnings Report */}
      {tab === 'report' && (
        <div className="space-y-4">
          {loadingReport ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-violet-600" />
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border bg-white p-5">
                  <p className="text-sm text-gray-500">إجمالي المدفوعات</p>
                  <p className="text-2xl font-bold text-violet-700">{formatCurrency(report.reduce((s, r) => s + r.totalPaid, 0))}</p>
                </div>
                <div className="rounded-xl border bg-white p-5">
                  <p className="text-sm text-gray-500">إجمالي الرواتب المدفوعة</p>
                  <p className="text-2xl font-bold text-blue-700">{formatCurrency(report.reduce((s, r) => s + r.totalSalary, 0))}</p>
                </div>
                <div className="rounded-xl border bg-white p-5">
                  <p className="text-sm text-gray-500">إجمالي المكافآت</p>
                  <p className="text-2xl font-bold text-green-700">{formatCurrency(report.reduce((s, r) => s + r.totalBonus, 0))}</p>
                </div>
              </div>

              {/* Per-employee table */}
              <div className="overflow-hidden rounded-xl border bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                      <th className="px-4 py-3">الموظف</th>
                      <th className="px-4 py-3">الراتب الشهري</th>
                      <th className="px-4 py-3">الراتب المدفوع</th>
                      <th className="px-4 py-3">السلف</th>
                      <th className="px-4 py-3">المكافآت</th>
                      <th className="px-4 py-3">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.map((r) => (
                      <tr key={r.staffId} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <div>
                              <p className="text-sm font-medium text-gray-800">{r.name}</p>
                              <p className="text-xs text-gray-400">{r.role}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800">{formatCurrency(r.salary)}</td>
                        <td className="px-4 py-3 text-blue-600 font-medium">{formatCurrency(r.totalSalary)}</td>
                        <td className="px-4 py-3 text-amber-600 font-medium">{formatCurrency(r.totalAdvance)}</td>
                        <td className="px-4 py-3 text-green-600 font-medium">{formatCurrency(r.totalBonus)}</td>
                        <td className="px-4 py-3 font-bold text-gray-800">{formatCurrency(r.totalPaid)}</td>
                      </tr>
                    ))}
                    {report.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">لا توجد بيانات مدفوعات</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

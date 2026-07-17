'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import api from '@/lib/api';
import {
  Plus, Search, Key, Pencil, Trash2, X, Ban, Check,
  BarChart3, DollarSign, ShoppingBag, TrendingUp, Loader2
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface Employee {
  id: string;
  name: string;
  phone: string;
  role: string;
  salary: number;
  salaryType: string;
  active: boolean;
  loginCode: string | null;
  cafeId: string;
  branchId: string;
}

interface EmployeeStats {
  ordersHandled: number;
  moneyCollected: number;
  performance: {
    overallScore: number;
  } | null;
}

type FormMode = 'add' | 'edit';

export default function OwnerEmployeesPage() {
  useSocket('/owner');
  const [staff, setStaff] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('add');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', role: 'BARISTA', salary: 0, salaryType: 'MONTHLY', hourlyWage: 0, active: true, loginCode: '', password: '' });
  const [generating, setGenerating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedStats, setExpandedStats] = useState<Record<string, EmployeeStats>>({});
  const [loadingStats, setLoadingStats] = useState<string | null>(null);

  const fetchStaff = async () => {
    try {
      const { data } = await api.get('/staff');
      setStaff(Array.isArray(data) ? data : []);
    } catch {
      setStaff([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStaff(); }, []);

  const filtered = staff.filter((s) =>
    !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.phone?.includes(search)
  );

  const openAdd = () => {
    setForm({ name: '', phone: '', role: 'BARISTA', salary: 0, salaryType: 'MONTHLY', hourlyWage: 0, active: true, loginCode: '', password: '' });
    setFormMode('add');
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = (emp: Employee) => {
    setForm({ name: emp.name, phone: emp.phone, role: emp.role, salary: Number(emp.salary), salaryType: emp.salaryType || 'MONTHLY', hourlyWage: Number((emp as any).hourlyWage ?? 0), active: emp.active, loginCode: emp.loginCode || '', password: '' });
    setFormMode('edit');
    setEditId(emp.id);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.phone) return;
    try {
      if (formMode === 'add') {
        const body: any = { name: form.name, phone: form.phone, role: form.role, salary: form.salary, salaryType: form.salaryType };
        if (form.salaryType === 'HOURLY') body.hourlyWage = form.hourlyWage;
        if (form.loginCode) body.loginCode = form.loginCode;
        if (form.password) body.password = form.password;
        await api.post('/staff', body);
      } else {
        const body: any = { name: form.name, phone: form.phone, role: form.role, salary: form.salary, salaryType: form.salaryType, active: form.active };
        if (form.salaryType === 'HOURLY') body.hourlyWage = form.hourlyWage;
        await api.patch(`/staff/${editId}`, body);
      }
      setShowModal(false);
      fetchStaff();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('حذف هذا الموظف نهائياً؟')) return;
    setDeleting(id);
    try {
      await api.delete(`/staff/${id}`);
      fetchStaff();
    } catch {
      alert('Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    await api.patch(`/staff/${id}`, { active: !active });
    setStaff((prev) => prev.map((s) => s.id === id ? { ...s, active: !active } : s));
  };

  const resetLoginCode = async (id: string) => {
    setGenerating(id);
    try {
      const { data } = await api.post(`/staff/${id}/reset-code`);
      setStaff((prev) => prev.map((s) => s.id === id ? { ...s, loginCode: data.loginCode } : s));
    } finally {
      setGenerating(null);
    }
  };

  const toggleStats = async (id: string) => {
    if (expandedStats[id]) {
      setExpandedStats((prev) => { const n = { ...prev }; delete n[id]; return n; });
      return;
    }
    setLoadingStats(id);
    try {
      const { data } = await api.get(`/staff/${id}/stats`);
      setExpandedStats((prev) => ({ ...prev, [id]: data }));
    } finally {
      setLoadingStats(null);
    }
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
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="ابحث بالاسم أو رقم الهاتف..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
          <Plus className="h-4 w-4" /> إضافة موظف
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-4 py-3">الاسم</th>
              <th className="px-4 py-3">الهاتف</th>
              <th className="px-4 py-3">الدور</th>
              <th className="px-4 py-3">الراتب</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">كود الدخول</th>
              <th className="px-4 py-3">إجراءات</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                <td className="px-4 py-3 text-gray-600">{s.phone}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    s.role === 'BARISTA' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>{s.role}</span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {formatCurrency(s.salary)}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {s.active ? 'نشط' : 'غير نشط'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <code className="rounded bg-gray-100 px-2 py-0.5 text-xs font-mono font-bold tracking-wider">{s.loginCode || '—'}</code>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(s)}
                      className="rounded p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors" title="تعديل">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => resetLoginCode(s.id)} disabled={generating === s.id}
                      className="rounded p-1.5 text-gray-500 hover:bg-violet-50 hover:text-violet-600 transition-colors disabled:opacity-50" title="تغيير الكود">
                      {generating === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                    </button>
                    <button onClick={() => toggleActive(s.id, s.active)}
                      className={`rounded p-1.5 transition-colors ${s.active ? 'text-gray-500 hover:bg-orange-50 hover:text-orange-600' : 'text-gray-500 hover:bg-green-50 hover:text-green-600'}`}
                      title={s.active ? 'تعطيل' : 'تفعيل'}>
                      {s.active ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id}
                      className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50" title="Delete">
                      {deleting === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleStats(s.id)}
                    className={`rounded p-1.5 transition-colors ${expandedStats[s.id] ? 'text-violet-600 bg-violet-50' : 'text-gray-400 hover:text-violet-600'}`}
                    title="View stats">
                    {loadingStats === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">لا يوجد موظفين</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Expanded stats */}
      {Object.entries(expandedStats).map(([id, stats]) => {
        const emp = staff.find((s) => s.id === id);
        if (!emp) return null;
              const dailySalary = Number(emp.salary) / 30;
              return (
                <div key={id} className="rounded-xl border bg-white p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-800">{emp.name} — الأداء</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-lg bg-blue-50 p-3">
                    <div className="flex items-center gap-2 text-blue-600 text-xs font-medium mb-1">
                      <ShoppingBag className="h-3.5 w-3.5" /> الطلبات المُنجزة
                    </div>
                <p className="text-2xl font-bold text-blue-700">{stats.ordersHandled}</p>
              </div>
              <div className="rounded-lg bg-green-50 p-3">
                    <div className="flex items-center gap-2 text-green-600 text-xs font-medium mb-1">
                      <DollarSign className="h-3.5 w-3.5" /> المبالغ المحصلة
                    </div>
                    <p className="text-2xl font-bold text-green-700">{formatCurrency(stats.moneyCollected)}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                    <div className="flex items-center gap-2 text-amber-600 text-xs font-medium mb-1">
                      <TrendingUp className="h-3.5 w-3.5" /> الراتب اليومي
                    </div>
                    <p className="text-2xl font-bold text-amber-700">{formatCurrency(dailySalary)}</p>
              </div>
              <div className="rounded-lg bg-violet-50 p-3">
                    <div className="flex items-center gap-2 text-violet-600 text-xs font-medium mb-1">
                      <BarChart3 className="h-3.5 w-3.5" /> الأداء
                    </div>
                <p className="text-2xl font-bold text-violet-700">
                  {stats.performance ? `${stats.performance.overallScore.toFixed(0)}/100` : '—'}
                </p>
              </div>
            </div>
          </div>
        );
      })}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                {formMode === 'add' ? 'إضافة موظف' : 'تعديل الموظف'}
              </h2>
              <button onClick={() => setShowModal(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">الاسم</label>
                <input type="text" placeholder="اسم الموظف" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
              </div>
              <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">رقم الهاتف</label>
                <input type="text" placeholder="رقم الهاتف" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
              </div>
              <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">الدور</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
                  <option value="BARISTA">باريستا</option>
                  <option value="DRIVER">سائق</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">نظام الأجر</label>
                <select value={form.salaryType} onChange={(e) => setForm({ ...form, salaryType: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
                  <option value="MONTHLY">راتب شهري</option>
                  <option value="DAILY">أجر يومي</option>
                  <option value="HOURLY">أجر بالساعة</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {form.salaryType === 'MONTHLY' ? 'الراتب الشهري (جنيه)' : form.salaryType === 'DAILY' ? 'الأجر اليومي (جنيه)' : 'الأجر بالساعة (جنيه)'}
                </label>
                <input type="number" min="0" placeholder="0" value={form.salary}
                  onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
              </div>
              {form.salaryType === 'HOURLY' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">أجر الساعة (جنيه)</label>
                  <input type="number" min="0" placeholder="0" value={form.hourlyWage}
                    onChange={(e) => setForm({ ...form, hourlyWage: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">اسم المستخدم (كود الدخول)</label>
                <input type="text" placeholder="مثال: ahmed-01" value={form.loginCode}
                  onChange={(e) => setForm({ ...form, loginCode: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">كلمة السر</label>
                <input type="password" placeholder="******" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
              </div>
              {formMode === 'edit' && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="active-toggle" checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
                  <label htmlFor="active-toggle" className="text-sm text-gray-700">نشط</label>
                </div>
              )}
              <button onClick={handleSubmit}
                className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
                {formMode === 'add' ? 'إنشاء الموظف' : 'حفظ التغييرات'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Plus, Pencil, Trash2, Store, Key, Phone, X, Loader2 } from 'lucide-react';

interface Cafe {
  id: string;
  name: string;
  ownerCode: string;
  phone: string;
  active: boolean;
}

export default function SuperAdminCafesPage() {
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', ownerCode: '', ownerPassword: '', phone: '' });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchCafes = async () => {
    try {
      const { data } = await api.get('/super-admin/cafes');
      setCafes(data);
    } catch {
      console.error('Failed to fetch cafes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCafes(); }, []);

  const handleSubmit = async () => {
    setActionLoading(true);
    try {
      if (formMode === 'add') {
        await api.post('/super-admin/cafes', form);
      } else {
        await api.patch(`/super-admin/cafes/${editId}`, form);
      }
      setShowModal(false);
      fetchCafes();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Operation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الكافيه نهائياً؟ سيتم حذف كل بياناته!')) return;
    try {
      await api.delete(`/super-admin/cafes/${id}`);
      fetchCafes();
    } catch {
      alert('Failed to delete');
    }
  };

  const openAdd = () => {
    setForm({ name: '', ownerCode: '', ownerPassword: '', phone: '' });
    setFormMode('add');
    setShowModal(true);
  };

  const openEdit = (cafe: Cafe) => {
    setForm({ name: cafe.name, ownerCode: cafe.ownerCode, ownerPassword: '', phone: cafe.phone });
    setFormMode('edit');
    setEditId(cafe.id);
    setShowModal(true);
  };

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-violet-600" /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة المقاهي (Super Admin)</h1>
          <p className="text-sm text-gray-500">يمكنك من هنا إضافة وتعديل وحذف المقاهي المشتركة في النظام</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
          <Plus className="h-4 w-4" /> إضافة كافيه جديد
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b bg-gray-50 text-xs font-semibold uppercase text-gray-500">
              <th className="px-4 py-3">اسم الكافيه</th>
              <th className="px-4 py-3">كود المالك</th>
              <th className="px-4 py-3">رقم الهاتف</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {cafes.map((cafe) => (
              <tr key={cafe.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">{cafe.name}</td>
                <td className="px-4 py-3 font-mono text-violet-600 font-bold">{cafe.ownerCode}</td>
                <td className="px-4 py-3 text-gray-600">{cafe.phone}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cafe.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {cafe.active ? 'نشط' : 'غير نشط'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(cafe)} className="rounded p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600" title="تعديل">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(cafe.id)} className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600" title="حذف">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {cafes.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">لا توجد مقاهي مسجلة حالياً</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">{formMode === 'add' ? 'إضافة كافيه جديد' : 'تعديل بيانات الكافيه'}</h2>
              <button onClick={() => setShowModal(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">اسم الكافيه</label>
                <div className="relative">
                  <Store className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="اسم الكافيه" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:border-violet-400 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">كود المالك (Access Code)</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="مثال: 19" value={form.ownerCode} onChange={(e) => setForm({ ...form, ownerCode: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm font-mono focus:border-violet-400 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">رقم الهاتف</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="01xxxxxxxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:border-violet-400 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">كلمة السر (إجبارية عند الإضافة، اختيارية عند التعديل)</label>
                <input type="password" placeholder="******" value={form.ownerPassword} onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 outline-none" />
              </div>
              <button onClick={handleSubmit} disabled={actionLoading}
                className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors flex items-center justify-center gap-2">
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (formMode === 'add' ? 'إنشاء الكافيه' : 'حفظ التغييرات')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

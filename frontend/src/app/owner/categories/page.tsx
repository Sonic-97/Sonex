'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { useAppStore } from '@/store';
import api, { deleteCategory } from '@/lib/api';
import { Plus, Search, Edit2, Trash2, X, Check, Save, Loader2, RefreshCw } from 'lucide-react';

const THEME_COLORS = [
  { label: 'بنفسجي', value: '#7c3aed' },
  { label: 'نيلي', value: '#4f46e5' },
  { label: 'أزرق', value: '#2563eb' },
  { label: 'أزرق سماوي', value: '#0891b2' },
  { label: 'أخضر', value: '#059669' },
  { label: 'أخضر زيتي', value: '#65a30d' },
  { label: 'أصفر', value: '#ca8a04' },
  { label: 'برتقالي', value: '#ea580c' },
  { label: 'أحمر', value: '#dc2626' },
  { label: 'وردي', value: '#db2777' },
  { label: 'تركواز', value: '#0d9488' },
  { label: 'كحلي', value: '#1e3a5f' },
];

const EMOJI_OPTIONS = ['☕', '🥤', '🍹', '🍰', '🍔', '🥐', '🥪', '🍧', '🍪', '🍕', '🥗', '🍿', '🍟', '🍩', '🍨', '📁', '🧃', '🧋', '🥮', '🌮', '🥙', '🧁', '🍝', '🥩'];

export default function OwnerCategoriesPage() {
  useSocket('/owner');
  const categoryUpdateVersion = useAppStore((s) => s.categoryUpdateVersion);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', icon: '☕', color: '#7c3aed', sortOrder: '1' });

  const [editingCategory, setEditingCategory] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: '', icon: '', color: '', sortOrder: '1' });

  const [categoryToDelete, setCategoryToDelete] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCategoriesList = useCallback(async () => {
    try {
      const { data } = await api.get('/product-management/categories?includeInactive=true');
      setCategories(Array.isArray(data) ? data : []);
    } catch {
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategoriesList();
  }, [fetchCategoriesList, categoryUpdateVersion]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.post('/product-management/categories', {
        name: createForm.name.trim(),
        icon: createForm.icon || undefined,
        color: createForm.color || undefined,
        sortOrder: createForm.sortOrder ? Number(createForm.sortOrder) : 0,
      });
      setCreateForm({ name: '', icon: '☕', color: '#7c3aed', sortOrder: '1' });
      setShowCreateForm(false);
      await fetchCategoriesList();
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ أثناء إضافة التصنيف');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editForm.name.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.patch(`/product-management/categories/${editingCategory.id}`, {
        name: editForm.name.trim(),
        icon: editForm.icon || undefined,
        color: editForm.color || undefined,
        sortOrder: editForm.sortOrder ? Number(editForm.sortOrder) : 0,
      });
      setEditingCategory(null);
      await fetchCategoriesList();
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ أثناء تعديل التصنيف');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!categoryToDelete) return;
    setActionLoading(true);
    setError(null);
    try {
      await deleteCategory(categoryToDelete.id);
      setCategoryToDelete(null);
      await fetchCategoriesList();
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ أثناء حذف التصنيف');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    try {
      await api.patch(`/product-management/categories/${id}`, { active: !active });
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? { ...c, active: !active } : c))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const startEdit = (category: any) => {
    setEditingCategory(category);
    setEditForm({
      name: category.name || '',
      icon: category.icon || '☕',
      color: category.color || '#7c3aed',
      sortOrder: String(category.sortOrder ?? 1),
    });
  };

  const filtered = categories.filter((c) =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
          <span className="text-sm font-medium text-gray-500">جاري تحميل التصنيفات...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6" dir="rtl">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">إدارة تصنيفات المنتجات</h1>
          <p className="text-sm text-gray-500 mt-1">أضف، عدل، أو احذف تصنيفات الأكلات والمشروبات الخاصة بكافيهك لتظهر مباشرة في لوحة الكابتن والـ POS</p>
        </div>
        <button
          onClick={() => { setShowCreateForm(true); setError(null); }}
          className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 active:scale-[0.98] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-600/10 transition-all"
        >
          <Plus className="h-5 w-5" />
          <span>إضافة تصنيف جديد</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm font-medium flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="البحث عن تصنيف بالاسم..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 pr-10 pl-4 py-3 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-all"
          />
        </div>
        <button
          onClick={fetchCategoriesList}
          className="p-3 border border-gray-200 hover:bg-gray-50 rounded-xl text-gray-500 transition-colors"
          title="تحديث البيانات"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {filtered.map((c) => (
          <div
            key={c.id}
            className={`rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group ${
              !c.active ? 'opacity-70 border-dashed bg-gray-50/50' : 'border-gray-200'
            }`}
          >
            {c.active && (
              <div
                className="absolute top-0 right-0 left-0 h-[3px]"
                style={{ background: c.color || 'linear-gradient(to right, #7c3aed, #4f46e5, #2563eb)' }}
              ></div>
            )}

            <div>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div
                  className="h-14 w-14 rounded-2xl flex items-center justify-center text-3xl shadow-inner group-hover:scale-105 transition-transform"
                  style={{ backgroundColor: c.color ? `${c.color}15` : '#f1f5f9' }}
                >
                  {c.icon || '📁'}
                </div>
                <div className="text-left">
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full font-bold">
                    ترتيب: {c.sortOrder ?? 0}
                  </span>
                  {c.color && (
                    <div className="mt-1 flex justify-end">
                      <span
                        className="inline-block h-4 w-4 rounded-full border border-gray-200"
                        style={{ backgroundColor: c.color }}
                        title={c.color}
                      ></span>
                    </div>
                  )}
                </div>
              </div>

              <h3 className="text-lg font-bold text-gray-900 mb-1">{c.name}</h3>
              <p className="text-xs text-gray-500 mb-4">يحتوي على <span className="font-bold text-violet-600">{c.products?.length ?? 0}</span> منتج نشط</p>
            </div>

            {/* POS Preview */}
            <div
              className="rounded-xl p-3 mb-3 text-center text-sm font-bold border"
              style={{
                backgroundColor: c.color ? `${c.color}15` : '#f8fafc',
                borderColor: c.color ? `${c.color}30` : '#e2e8f0',
                color: c.color || '#334155',
              }}
            >
              <span className="text-lg ml-1">{c.icon || '📁'}</span>
              {c.name} — معاينة POS
            </div>

            <div className="border-t border-gray-100 pt-4 mt-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => toggleActive(c.id, c.active)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                    c.active
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  {c.active ? 'نشط' : 'معطل'}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => startEdit(c)}
                  className="p-2 text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 rounded-lg transition-all"
                  title="تعديل التصنيف"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCategoryToDelete(c)}
                  className="p-2 text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-lg transition-all"
                  title="حذف التصنيف"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center bg-white shadow-sm">
            <span className="text-4xl block mb-3">📂</span>
            <h3 className="text-base font-bold text-gray-700">لا توجد تصنيفات حالياً</h3>
            <p className="text-xs text-gray-400 mt-1">اضغط على زر &quot;إضافة تصنيف جديد&quot; لتهيئة تصنيفات مقهاك.</p>
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="bg-white border border-gray-100 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">إضافة تصنيف جديد</h3>
              <button type="button" onClick={() => setShowCreateForm(false)} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">

              {/* POS Preview at top */}
              {createForm.name && (
                <div
                  className="rounded-xl p-4 text-center border-2 shadow-sm"
                  style={{
                    backgroundColor: createForm.color ? `${createForm.color}15` : '#f8fafc',
                    borderColor: createForm.color || '#e2e8f0',
                  }}
                >
                  <div className="text-4xl mb-2">{createForm.icon || '📁'}</div>
                  <div className="text-base font-bold" style={{ color: createForm.color || '#334155' }}>
                    {createForm.name}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">شكل التصنيف في شاشة البيع (POS)</div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">اسم التصنيف *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: مشروبات ساخنة، وجبات خفيفة"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:bg-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">ترتيب العرض</label>
                <input
                  type="number"
                  min="0"
                  placeholder="الترتيب في القائمة"
                  value={createForm.sortOrder}
                  onChange={(e) => setCreateForm({ ...createForm, sortOrder: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:bg-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">أيقونة التصنيف (Emoji)</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="إيموجي"
                    value={createForm.icon}
                    onChange={(e) => setCreateForm({ ...createForm, icon: e.target.value })}
                    className="w-16 text-center bg-gray-50 border border-gray-200 rounded-xl px-2 py-3 text-xl text-gray-800 focus:bg-white focus:border-violet-500 focus:outline-none"
                  />
                  <div className="flex-1 flex flex-wrap gap-1.5 p-2.5 bg-slate-50 border border-gray-200 rounded-xl max-h-[104px] overflow-y-auto">
                    {EMOJI_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setCreateForm({ ...createForm, icon: emoji })}
                        className={`h-8 w-8 text-lg rounded-lg flex items-center justify-center hover:bg-white active:scale-95 transition-all ${
                          createForm.icon === emoji ? 'bg-white ring-2 ring-violet-500 shadow-sm scale-110' : ''
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">لون التصنيف</label>
                <div className="flex gap-2 flex-wrap">
                  {THEME_COLORS.map((clr) => (
                    <button
                      key={clr.value}
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, color: clr.value })}
                      className={`h-9 w-9 rounded-xl flex items-center justify-center border-2 transition-all active:scale-95 ${
                        createForm.color === clr.value
                          ? 'border-gray-900 scale-110 shadow-md'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: clr.value }}
                      title={clr.label}
                    >
                      {createForm.color === clr.value && <Check className="h-4 w-4 text-white drop-shadow" />}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="#hex"
                    value={createForm.color}
                    onChange={(e) => setCreateForm({ ...createForm, color: e.target.value })}
                    className="w-24 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 text-center font-mono focus:bg-white focus:border-violet-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-gray-400">أو أدخل كود لون مخصص (Hex)</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 text-sm font-bold shadow-md shadow-violet-600/10 active:scale-95 transition-all flex items-center gap-2"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                <span>إضافة التصنيف</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingCategory && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleUpdate} className="bg-white border border-gray-100 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">تعديل التصنيف: {editingCategory.name}</h3>
              <button type="button" onClick={() => setEditingCategory(null)} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">

              {/* POS Preview */}
              {editForm.name && (
                <div
                  className="rounded-xl p-4 text-center border-2 shadow-sm"
                  style={{
                    backgroundColor: editForm.color ? `${editForm.color}15` : '#f8fafc',
                    borderColor: editForm.color || '#e2e8f0',
                  }}
                >
                  <div className="text-4xl mb-2">{editForm.icon || '📁'}</div>
                  <div className="text-base font-bold" style={{ color: editForm.color || '#334155' }}>
                    {editForm.name}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">شكل التصنيف في شاشة البيع (POS)</div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">اسم التصنيف *</label>
                <input
                  type="text"
                  required
                  placeholder="اسم التصنيف"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:bg-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">ترتيب العرض</label>
                <input
                  type="number"
                  min="0"
                  placeholder="الترتيب في القائمة"
                  value={editForm.sortOrder}
                  onChange={(e) => setEditForm({ ...editForm, sortOrder: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:bg-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">أيقونة التصنيف (Emoji)</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="إيموجي"
                    value={editForm.icon}
                    onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                    className="w-16 text-center bg-gray-50 border border-gray-200 rounded-xl px-2 py-3 text-xl text-gray-800 focus:bg-white focus:border-violet-500 focus:outline-none"
                  />
                  <div className="flex-1 flex flex-wrap gap-1.5 p-2.5 bg-slate-50 border border-gray-200 rounded-xl max-h-[104px] overflow-y-auto">
                    {EMOJI_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setEditForm({ ...editForm, icon: emoji })}
                        className={`h-8 w-8 text-lg rounded-lg flex items-center justify-center hover:bg-white active:scale-95 transition-all ${
                          editForm.icon === emoji ? 'bg-white ring-2 ring-violet-500 shadow-sm scale-110' : ''
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">لون التصنيف</label>
                <div className="flex gap-2 flex-wrap">
                  {THEME_COLORS.map((clr) => (
                    <button
                      key={clr.value}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, color: clr.value })}
                      className={`h-9 w-9 rounded-xl flex items-center justify-center border-2 transition-all active:scale-95 ${
                        editForm.color === clr.value
                          ? 'border-gray-900 scale-110 shadow-md'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: clr.value }}
                      title={clr.label}
                    >
                      {editForm.color === clr.value && <Check className="h-4 w-4 text-white drop-shadow" />}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="#hex"
                    value={editForm.color}
                    onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                    className="w-24 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 text-center font-mono focus:bg-white focus:border-violet-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-gray-400">أو أدخل كود لون مخصص (Hex)</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="px-4 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 text-sm font-bold shadow-md shadow-violet-600/10 active:scale-95 transition-all flex items-center gap-2"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span>حفظ التعديلات</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DELETE CONFIRMATION */}
      {categoryToDelete && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-100 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-950">تأكيد حذف التصنيف</h3>
              <button type="button" onClick={() => setCategoryToDelete(null)} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 text-right">
              <p className="text-sm text-gray-700 leading-relaxed">
                هل أنت متأكد من رغبتك في حذف تصنيف <span className="font-bold text-red-600">&quot;{categoryToDelete.name}&quot;</span>؟
              </p>
              <p className="text-xs text-gray-400 mt-2 bg-amber-50 border border-amber-200 p-3 rounded-xl leading-relaxed">
                ⚠️ تنبيه: لن يتم حذف المنتجات المدرجة ضمن هذا التصنيف، بل سيتم إزالة ربطها بالتصنيف فقط (ستصبح بدون تصنيف).
              </p>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCategoryToDelete(null)}
                className="px-4 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleDelete}
                className="rounded-xl bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 text-sm font-bold shadow-md shadow-red-600/10 active:scale-95 transition-all flex items-center gap-2"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span>حذف التصنيف</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
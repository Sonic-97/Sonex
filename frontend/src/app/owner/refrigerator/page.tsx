'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { 
  Plus, Search, Edit2, Check, X, AlertTriangle, Snowflake, 
  Settings, Save, RefreshCw, Layers, Sliders, ToggleLeft, ToggleRight
} from 'lucide-react';

interface Product {
  id: string;
  name: string;
  price: number;
  cost: number;
  active: boolean;
  isRefrigerated: boolean;
  emoji: string;
  refrigeratorStock: number;
  lowStockThreshold: number;
  categoryId?: string | null;
  category?: string;
  refrigeratorCategoryId?: string | null;
}

interface Category {
  id: string;
  name: string;
}

interface RefrigeratorCategory {
  id: string;
  name: string;
  emoji: string;
  active: boolean;
}

export default function OwnerRefrigeratorPage() {
  useSocket('/owner');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [refrigeratorCategories, setRefrigeratorCategories] = useState<RefrigeratorCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [showTagForm, setShowTagForm] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // New product form
  const [newForm, setNewForm] = useState({
    name: '',
    emoji: '🥤',
    price: '',
    cost: '',
    refrigeratorStock: '10',
    lowStockThreshold: '3',
    active: true,
    categoryId: '',
    refrigeratorCategoryId: ''
  });

  // Tag existing product form
  const [selectedProductId, setSelectedProductId] = useState('');
  const [tagForm, setTagForm] = useState({
    emoji: '🥤',
    refrigeratorStock: '10',
    lowStockThreshold: '3',
    refrigeratorCategoryId: ''
  });

  // Category management
  const [catForm, setCatForm] = useState({ name: '', emoji: '🥤', active: true });
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  // Inline editing states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    emoji: '',
    price: '',
    refrigeratorStock: '',
    lowStockThreshold: '',
    active: true
  });

  const loadData = async () => {
    try {
      const [prodsRes, catsRes, refCatsRes] = await Promise.all([
        api.get('/product-management/products?includeInactive=true'),
        api.get('/product-management/categories'),
        api.get('/product-management/refrigerator-categories?includeInactive=true')
      ]);
      setProducts(Array.isArray(prodsRes.data) ? prodsRes.data : []);
      setCategories(Array.isArray(catsRes.data) ? catsRes.data : []);
      setRefrigeratorCategories(Array.isArray(refCatsRes.data) ? refCatsRes.data : []);
    } catch {
      setMessage({ type: 'error', text: 'فشل في تحميل المنتجات' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter products to show ONLY refrigerated ones
  const refrigeratedProducts = products.filter(
    (p) => p.isRefrigerated && (!search || p.name?.toLowerCase().includes(search.toLowerCase()))
  );

  // Non-refrigerated products that can be converted
  const availableToTag = products.filter((p) => !p.isRefrigerated);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.name || !newForm.price) {
      setMessage({ type: 'error', text: 'يرجى ملء الحقول المطلوبة (الاسم والسعر)' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await api.post('/product-management/products', {
        name: newForm.name,
        emoji: newForm.emoji || '🥤',
        price: Number(newForm.price),
        cost: newForm.cost ? Number(newForm.cost) : 0,
        refrigeratorStock: Number(newForm.refrigeratorStock || 0),
        lowStockThreshold: Number(newForm.lowStockThreshold || 0),
        isRefrigerated: true,
        active: newForm.active,
        categoryId: newForm.categoryId || undefined,
        refrigeratorCategoryId: newForm.refrigeratorCategoryId || undefined,
        category: 'drinks'
      });
      setMessage({ type: 'success', text: 'تم إنشاء المنتج المبرد بنجاح' });
      setNewForm({
        name: '',
        emoji: '🥤',
        price: '',
        cost: '',
        refrigeratorStock: '10',
        lowStockThreshold: '3',
        active: true,
        categoryId: '',
        refrigeratorCategoryId: ''
      });
      setShowAddForm(false);
      loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'فشل في إنشاء المنتج' });
    } finally {
      setSaving(false);
    }
  };

  const handleTagProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      setMessage({ type: 'error', text: 'يرجى اختيار منتج' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await api.patch(`/product-management/products/${selectedProductId}`, {
        isRefrigerated: true,
        emoji: tagForm.emoji || '🥤',
        refrigeratorStock: Number(tagForm.refrigeratorStock || 0),
        lowStockThreshold: Number(tagForm.lowStockThreshold || 0),
        refrigeratorCategoryId: tagForm.refrigeratorCategoryId || undefined
      });
      setMessage({ type: 'success', text: 'تم تحويل المنتج إلى منتج مبرد بنجاح' });
      setSelectedProductId('');
      setShowTagForm(false);
      loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'فشل في تحديث المنتج' });
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (p: Product) => {
    setEditingId(p.id);
    setEditForm({
      name: p.name,
      emoji: p.emoji || '🥤',
      price: String(p.price),
      refrigeratorStock: String(p.refrigeratorStock),
      lowStockThreshold: String(p.lowStockThreshold),
      active: p.active,
      refrigeratorCategoryId: p.refrigeratorCategoryId || ''
    } as any);
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const handleUpdateProduct = async (id: string) => {
    setSaving(true);
    setMessage(null);
    try {
      await api.patch(`/product-management/products/${id}`, {
        name: editForm.name,
        emoji: editForm.emoji,
        price: Number(editForm.price),
        refrigeratorStock: Number(editForm.refrigeratorStock),
        lowStockThreshold: Number(editForm.lowStockThreshold),
        active: editForm.active,
        refrigeratorCategoryId: (editForm as any).refrigeratorCategoryId || undefined
      });
      setMessage({ type: 'success', text: 'تم تحديث منتج الثلاجة بنجاح' });
      setEditingId(null);
      loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'فشل في تحديث المنتج' });
    } finally {
      setSaving(false);
    }
  };

  const toggleProductActive = async (p: Product) => {
    try {
      await api.patch(`/product-management/products/${p.id}`, {
        active: !p.active
      });
      setProducts(prev => prev.map(item => item.id === p.id ? { ...item, active: !item.active } : item));
    } catch {
      setMessage({ type: 'error', text: 'فشل في تغيير حالة المنتج' });
    }
  };

  const untagProduct = async (id: string) => {
    if (!confirm('هل أنت متأكد من إلغاء تصنيف هذا المنتج كمنتج مبرد؟ سيؤدي هذا إلى إزالته من شاشة الثلاجة للباريستا.')) {
      return;
    }
    try {
      await api.patch(`/product-management/products/${id}`, {
        isRefrigerated: false
      });
      setMessage({ type: 'success', text: 'تمت إزالة المنتج من الثلاجة بنجاح' });
      loadData();
    } catch {
      setMessage({ type: 'error', text: 'فشل في إزالة المنتج من الثلاجة' });
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingCatId) {
        await api.patch(`/product-management/refrigerator-categories/${editingCatId}`, catForm);
        setMessage({ type: 'success', text: 'تم تحديث التصنيف بنجاح' });
      } else {
        await api.post('/product-management/refrigerator-categories', catForm);
        setMessage({ type: 'success', text: 'تم إنشاء التصنيف بنجاح' });
      }
      setCatForm({ name: '', emoji: '🥤', active: true });
      setEditingCatId(null);
      loadData();
    } catch {
      setMessage({ type: 'error', text: 'حدث خطأ أثناء حفظ التصنيف' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا التصنيف؟ لن يتم حذف المنتجات ولكن ستصبح بدون تصنيف فرعي.')) return;
    try {
      await api.delete(`/product-management/refrigerator-categories/${id}`);
      setMessage({ type: 'success', text: 'تم حذف التصنيف بنجاح' });
      loadData();
    } catch {
      setMessage({ type: 'error', text: 'فشل الحذف' });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-sky-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-slate-100" dir="rtl">
      
      {/* Header section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <Snowflake className="h-7 w-7 text-sky-400 animate-spin-slow" />
            <span>إدارة ثلاجة المشروبات والمنتجات المبردة</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">تحديد المنتجات المبردة ومراقبة مستويات مخزونها في الثلاجة في الوقت الفعلي.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => { setShowCatForm(!showCatForm); setShowAddForm(false); setShowTagForm(false); }}
            className="flex items-center gap-2 rounded-xl bg-slate-900 border border-slate-800 px-4 py-2.5 text-xs font-bold text-amber-400 hover:bg-slate-850 hover:border-amber-500/30 transition-all active:scale-[0.98]"
          >
            <Layers className="h-4 w-4" />
            <span>تصنيفات الثلاجة</span>
          </button>

          <button
            onClick={() => { setShowTagForm(true); setShowAddForm(false); setShowCatForm(false); }}
            className="flex items-center gap-2 rounded-xl bg-slate-900 border border-slate-800 px-4 py-2.5 text-xs font-bold text-sky-400 hover:bg-slate-850 hover:border-sky-500/30 transition-all active:scale-[0.98]"
          >
            <Settings className="h-4 w-4" />
            <span>تحويل منتج للثلاجة</span>
          </button>
          
          <button
            onClick={() => { setShowAddForm(true); setShowTagForm(false); setShowCatForm(false); }}
            className="flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-sky-400 transition-all shadow-lg shadow-sky-500/20 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            <span>إنشاء منتج مبرد جديد</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className={`flex items-center gap-3 rounded-xl border p-4 text-sm ${
          message.type === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
        }`}>
          {message.type === 'success' ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Add New Product Form */}
      {showAddForm && (
        <form onSubmit={handleCreateProduct} className="rounded-2xl border border-slate-850 bg-slate-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-850 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Plus className="h-4 w-4 text-sky-400" />
              <span>إنشاء منتج مبرد جديد بالكامل</span>
            </h3>
            <button type="button" onClick={() => setShowAddForm(false)} className="text-slate-500 hover:text-slate-300">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold">اسم المنتج *</label>
              <input
                type="text" placeholder="مثال: بيبسي كانز" required
                value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold">أيقونة الإيموجي</label>
              <input
                type="text" placeholder="مثال: 🥤"
                value={newForm.emoji} onChange={(e) => setNewForm({ ...newForm, emoji: e.target.value })}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold">سعر البيع للزبون (EGP) *</label>
              <input
                type="number" step="0.5" placeholder="0.00" required
                value={newForm.price} onChange={(e) => setNewForm({ ...newForm, price: e.target.value })}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold">سعر التكلفة (اختياري)</label>
              <input
                type="number" step="0.5" placeholder="0.00"
                value={newForm.cost} onChange={(e) => setNewForm({ ...newForm, cost: e.target.value })}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold">مخزون الثلاجة الحالي *</label>
              <input
                type="number" placeholder="10" required
                value={newForm.refrigeratorStock} onChange={(e) => setNewForm({ ...newForm, refrigeratorStock: e.target.value })}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold">حد الطلب / النقص (Alert Threshold)</label>
              <input
                type="number" placeholder="3"
                value={newForm.lowStockThreshold} onChange={(e) => setNewForm({ ...newForm, lowStockThreshold: e.target.value })}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold">التصنيف</label>
              <select
                value={newForm.categoryId} onChange={(e) => setNewForm({ ...newForm, categoryId: e.target.value })}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              >
                <option value="">اختر التصنيف</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold">التصنيف الفرعي في الثلاجة</label>
              <select
                value={newForm.refrigeratorCategoryId || ''} onChange={(e) => setNewForm({ ...newForm, refrigeratorCategoryId: e.target.value })}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              >
                <option value="">-- بدون تصنيف فرعي --</option>
                {refrigeratorCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.emoji} {cat.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end pb-1.5">
              <button
                type="submit" disabled={saving}
                className="w-full rounded-lg bg-sky-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-sky-400 transition-colors flex items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'جاري الحفظ...' : 'حفظ المنتج الجديد'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Convert Existing Product Form */}
      {showTagForm && (
        <form onSubmit={handleTagProduct} className="rounded-2xl border border-slate-850 bg-slate-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-850 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-sky-400" />
              <span>تحويل منتج حالي إلى مبيعات الثلاجة</span>
            </h3>
            <button type="button" onClick={() => setShowTagForm(false)} className="text-slate-500 hover:text-slate-300">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold">اختر المنتج الحالي *</label>
              <select
                required value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              >
                <option value="">-- اختر منتج --</option>
                {availableToTag.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({Number(p.price).toFixed(0)} EGP)</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold">أيقونة الإيموجي</label>
              <input
                type="text" placeholder="🥤"
                value={tagForm.emoji} onChange={(e) => setTagForm({ ...tagForm, emoji: e.target.value })}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold">المخزون الحالي بالثلاجة *</label>
              <input
                type="number" placeholder="10" required
                value={tagForm.refrigeratorStock} onChange={(e) => setTagForm({ ...tagForm, refrigeratorStock: e.target.value })}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold">حد النقص والتنبيه</label>
              <input
                type="number" placeholder="3"
                value={tagForm.lowStockThreshold} onChange={(e) => setTagForm({ ...tagForm, lowStockThreshold: e.target.value })}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold">التصنيف الفرعي في الثلاجة</label>
              <select
                value={tagForm.refrigeratorCategoryId || ''} onChange={(e) => setTagForm({ ...tagForm, refrigeratorCategoryId: e.target.value })}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              >
                <option value="">-- بدون تصنيف فرعي --</option>
                {refrigeratorCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.emoji} {cat.name}</option>
                ))}
              </select>
            </div>

            <div className="col-span-full flex justify-end">
              <button
                type="submit" disabled={saving || !selectedProductId}
                className="rounded-lg bg-sky-500 px-6 py-2.5 text-xs font-bold text-slate-950 hover:bg-sky-400 transition-colors flex items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'جاري التحويل...' : 'تحويل المنتج للثلاجة'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Category Management Form */}
      {showCatForm && (
        <div className="rounded-2xl border border-amber-500/20 bg-slate-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-850 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-amber-400" />
              <span>تصنيفات الثلاجة الفرعية</span>
            </h3>
            <button type="button" onClick={() => setShowCatForm(false)} className="text-slate-500 hover:text-slate-300">
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSaveCategory} className="grid gap-4 sm:grid-cols-4 items-end">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold">اسم التصنيف *</label>
              <input type="text" placeholder="مشروبات" required value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold">أيقونة الإيموجي</label>
              <input type="text" placeholder="🥤" value={catForm.emoji} onChange={(e) => setCatForm({ ...catForm, emoji: e.target.value })} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
            </div>
            <button type="submit" disabled={saving} className="rounded-lg bg-amber-500 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400 h-[38px] transition-colors">
              {saving ? 'جاري الحفظ...' : editingCatId ? 'تحديث التصنيف' : 'إضافة التصنيف'}
            </button>
            {editingCatId && (
              <button type="button" onClick={() => { setEditingCatId(null); setCatForm({ name: '', emoji: '🥤', active: true }); }} className="rounded-lg border border-slate-800 bg-slate-950 py-2 text-sm text-slate-300 hover:bg-slate-900 h-[38px] transition-colors">
                إلغاء التعديل
              </button>
            )}
          </form>

          {refrigeratorCategories.length > 0 && (
            <div className="mt-4 border-t border-slate-850 pt-4 flex gap-2 flex-wrap">
              {refrigeratorCategories.map(cat => (
                <div key={cat.id} className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
                  <span>{cat.emoji} {cat.name}</span>
                  <div className="flex gap-1 ml-2 border-r border-slate-800 pl-2">
                    <button onClick={() => { setEditingCatId(cat.id); setCatForm({ name: cat.name, emoji: cat.emoji, active: cat.active }); }} className="text-sky-400 hover:text-sky-300"><Edit2 className="h-3 w-3" /></button>
                    <button onClick={() => handleDeleteCategory(cat.id)} className="text-rose-500 hover:text-rose-400"><X className="h-3 w-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toolbar / Search */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-900 bg-slate-950 p-4">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text" placeholder="بحث عن منتج في الثلاجة..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-850 bg-slate-900 pr-9 pl-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none placeholder-slate-500"
          />
        </div>

        <button 
          onClick={loadData}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-850 bg-slate-900 text-slate-400 hover:bg-slate-850 hover:text-white transition-all"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Table grid */}
      <div className="rounded-2xl border border-slate-900 bg-slate-950 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-900 bg-slate-900/30 text-xs font-bold text-slate-400">
                <th className="p-4">المنتج</th>
                <th className="p-4">السعر</th>
                <th className="p-4">المخزون الحالي</th>
                <th className="p-4">حد الطلب / النقص</th>
                <th className="p-4">الحالة</th>
                <th className="p-4 text-left">التحكم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900 text-sm">
              {refrigeratedProducts.map((p) => {
                const isEditing = editingId === p.id;
                const isLowStock = p.refrigeratorStock <= p.lowStockThreshold;

                return (
                  <tr key={p.id} className={`hover:bg-slate-900/40 transition-colors ${isLowStock ? 'bg-rose-500/[0.02]' : ''}`}>
                    {/* Product cell */}
                    <td className="p-4">
                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <input
                              type="text" value={editForm.emoji}
                              onChange={(e) => setEditForm({ ...editForm, emoji: e.target.value })}
                              className="w-12 rounded border border-slate-805 bg-slate-900 px-2 py-1 text-center focus:outline-none text-sm"
                            />
                            <input
                              type="text" value={editForm.name}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              className="rounded border border-slate-805 bg-slate-900 px-3 py-1 focus:outline-none text-sm w-full"
                            />
                          </div>
                          <select
                            value={(editForm as any).refrigeratorCategoryId || ''}
                            onChange={(e) => setEditForm({ ...editForm, refrigeratorCategoryId: e.target.value } as any)}
                            className="w-full rounded border border-slate-805 bg-slate-900 px-2 py-1 focus:outline-none text-sm text-slate-300"
                          >
                            <option value="">-- بدون تصنيف فرعي --</option>
                            {refrigeratorCategories.map(rcat => (
                              <option key={rcat.id} value={rcat.id}>{rcat.emoji} {rcat.name}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{p.emoji || '🥤'}</span>
                          <div>
                            <span className="font-bold text-white block">{p.name}</span>
                            <span className="text-[10px] text-slate-500">
                              {p.category || 'مشروبات'} 
                              {p.refrigeratorCategoryId ? ` • ${refrigeratorCategories.find(c => c.id === p.refrigeratorCategoryId)?.name || ''}` : ''}
                            </span>
                          </div>
                          {isLowStock && (
                            <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/20 mr-2 animate-pulse">
                              <AlertTriangle className="h-3 w-3" />
                              <span>مخزون منخفض!</span>
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Price cell */}
                    <td className="p-4 font-mono font-bold">
                      {isEditing ? (
                        <input
                          type="number" step="0.5" value={editForm.price}
                          onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                          className="w-20 rounded border border-slate-805 bg-slate-900 px-2 py-1 focus:outline-none text-sm"
                        />
                      ) : (
                        formatCurrency(p.price)
                      )}
                    </td>

                    {/* Stock cell */}
                    <td className="p-4">
                      {isEditing ? (
                        <input
                          type="number" value={editForm.refrigeratorStock}
                          onChange={(e) => setEditForm({ ...editForm, refrigeratorStock: e.target.value })}
                          className="w-20 rounded border border-slate-805 bg-slate-900 px-2 py-1 focus:outline-none text-sm"
                        />
                      ) : (
                        <span className={`font-mono font-bold text-base ${isLowStock ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {p.refrigeratorStock}
                        </span>
                      )}
                    </td>

                    {/* Threshold cell */}
                    <td className="p-4 font-mono text-slate-400">
                      {isEditing ? (
                        <input
                          type="number" value={editForm.lowStockThreshold}
                          onChange={(e) => setEditForm({ ...editForm, lowStockThreshold: e.target.value })}
                          className="w-20 rounded border border-slate-805 bg-slate-900 px-2 py-1 focus:outline-none text-sm"
                        />
                      ) : (
                        p.lowStockThreshold
                      )}
                    </td>

                    {/* Active Status Toggle */}
                    <td className="p-4">
                      {isEditing ? (
                        <button
                          type="button"
                          onClick={() => setEditForm({ ...editForm, active: !editForm.active })}
                          className="text-slate-400 hover:text-white"
                        >
                          {editForm.active ? (
                            <span className="flex items-center gap-1 text-emerald-400 font-bold"><ToggleLeft className="h-5 w-5 text-emerald-500" /> نشط</span>
                          ) : (
                            <span className="flex items-center gap-1 text-slate-500"><ToggleRight className="h-5 w-5 text-slate-500" /> غير نشط</span>
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleProductActive(p)}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            p.active 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-slate-800 text-slate-500 border border-slate-850'
                          }`}
                        >
                          <span>{p.active ? 'نشط' : 'غير نشط'}</span>
                        </button>
                      )}
                    </td>

                    {/* Actions cell */}
                    <td className="p-4 text-left">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleUpdateProduct(p.id)} disabled={saving}
                            className="rounded-lg bg-sky-500 p-2 text-slate-950 hover:bg-sky-400 transition-colors"
                          >
                            <Save className="h-4 w-4" />
                          </button>
                          
                          <button
                            onClick={cancelEditing}
                            className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:bg-slate-850 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => startEditing(p)}
                            className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:bg-slate-850 hover:text-white transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          
                          <button
                            onClick={() => untagProduct(p.id)}
                            className="rounded-lg border border-rose-950 bg-slate-900 p-2 text-rose-500 hover:bg-rose-950/30 transition-colors"
                            title="إلغاء تعيين كمنتج مبرد"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {refrigeratedProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    <Snowflake className="mx-auto h-12 w-12 text-slate-900 mb-3" />
                    <p className="text-sm">لا توجد منتجات مبردة في الثلاجة حالياً.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { fetchInventoryConsumption, fetchIngredientUsage, fetchMostConsumed } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import {
  LayoutGrid, Package, BookOpen, Calculator, Users, BarChart3, AlertTriangle,
  Search, Plus, Pencil, Trash2, X, Check, Ban, ChevronDown, ChevronLeft,
  GripVertical, Copy, History, Save, Coffee, Loader2, RefreshCw, DollarSign,
  TrendingUp, TrendingDown, ShoppingBag, Warehouse, Filter, Upload, Image as ImageIcon,
  LayoutList, Grid3X3, ArrowUp, ArrowDown, Eye,
} from 'lucide-react';

type TabId = 'categories' | 'products' | 'recipes' | 'costing' | 'employees' | 'analytics' | 'low-stock' | 'consumptions';

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: 'categories', label: 'التصنيفات', icon: LayoutGrid },
  { id: 'products', label: 'المنتجات', icon: Coffee },
  { id: 'recipes', label: 'الوصفات', icon: BookOpen },
  { id: 'costing', label: 'التكلفة والأرباح', icon: Calculator },
  { id: 'employees', label: 'الموظفين', icon: Users },
  { id: 'analytics', label: 'تحليلات المبيعات', icon: BarChart3 },
  { id: 'low-stock', label: 'المخزون المنخفض', icon: AlertTriangle },
  { id: 'consumptions', label: 'المستهلكات', icon: TrendingDown },
];

const UNIT_OPTIONS = ['g', 'kg', 'ml', 'L', 'piece', 'packet', 'bottle', 'can', 'cups', 'pcs'];
const EMOJIS = ['☕', '🥤', '🍹', '🍰', '🍔', '🍕', '🥗', '🧊', '🍦', '🍩', '🥐', '🧁', '🍪', '🥪', '🌮', '🍝', '🥘', '🍛', '🍣', '🥟', '🧋', '🍵', '🥛', '🧃'];

export default function OwnerManagementPage() {
  const [activeTab, setActiveTab] = useState<TabId>('categories');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const prevTabRef = useRef(activeTab);

  // Support ?tab= URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as TabId | null;
    if (tab && TABS.some((t) => t.id === tab)) {
      setActiveTab(tab);
      // Clean URL
      window.history.replaceState({}, '', '/owner/management');
    }
  }, []);

  // WebSocket real-time updates - auto-refresh on data changes
  useSocket('/owner');

  // Auto-refresh every 30s when tab is visible
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') setRefreshKey((k) => k + 1);
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-4" dir="rtl">
      {/* Cafe-style header */}
      <div className="rounded-xl border bg-white p-4">
        <h1 className="text-xl font-black text-gray-800">مركز إدارة كوفي</h1>
        <p className="text-sm text-gray-500 mt-1">إدارة القائمة، الوصفات، الموظفين، وتحليلات المبيعات</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl border bg-white p-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'categories' && <CategoriesSection refreshKey={refreshKey} />}
      {activeTab === 'products' && <ProductsSection refreshKey={refreshKey} />}
      {activeTab === 'recipes' && <RecipesSection refreshKey={refreshKey} />}
      {activeTab === 'costing' && <CostingSection refreshKey={refreshKey} />}
      {activeTab === 'employees' && <EmployeesSection refreshKey={refreshKey} />}
      {activeTab === 'analytics' && <AnalyticsSection refreshKey={refreshKey} />}
      {activeTab === 'low-stock' && <LowStockSection refreshKey={refreshKey} />}
      {activeTab === 'consumptions' && <ConsumptionsSection refreshKey={refreshKey} />}
    </div>
  );
}

/* ───────────────────────── CATEGORIES SECTION ───────────────────────── */

function CategoriesSection({ refreshKey }: { refreshKey: number }) {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', icon: '', color: '#8B5CF6', sortOrder: 0 });

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/product-management/categories?includeInactive=true');
      setCategories(Array.isArray(data) ? data : []);
    } catch { setCategories([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const moveCategory = async (idx: number, direction: -1 | 1) => {
    const sorted = [...categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    const current = sorted[idx];
    const target = sorted[targetIdx];
    try {
      await Promise.all([
        api.patch(`/product-management/categories/${current.id}`, { sortOrder: target.sortOrder || 0 }),
        api.patch(`/product-management/categories/${target.id}`, { sortOrder: current.sortOrder || 0 }),
      ]);
      load();
    } catch { alert('فشل إعادة الترتيب'); }
  };

  const handleSubmit = async () => {
    if (!form.name) return;
    try {
      if (editing) {
        await api.patch(`/product-management/categories/${editing.id}`, form);
      } else {
        await api.post('/product-management/categories', form);
      }
      setShowForm(false);
      setEditing(null);
      setForm({ name: '', icon: '', color: '#8B5CF6', sortOrder: 0 });
      load();
    } catch (err: any) { alert(err?.response?.data?.message || 'فشلت العملية'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('حذف هذه التصنيف؟')) return;
    try { await api.delete(`/product-management/categories/${id}`); load(); }
    catch { alert('فشل الحذف'); }
  };

  const openEdit = (cat: any) => {
    setEditing(cat);
    setForm({ name: cat.name, icon: cat.icon || '', color: cat.color || '#8B5CF6', sortOrder: cat.sortOrder || 0 });
    setShowForm(true);
  };

  const toggleActive = async (cat: any) => {
    try {
      await api.patch(`/product-management/categories/${cat.id}`, { active: !cat.active });
      load();
    } catch { alert('فشل التحديث'); }
  };

  if (loading) return <Loader />;
  return (
    <SectionCard title="إدارة التصنيفات" subtitle="إنشاء وتعديل وترتيب تصنيفات القائمة">
      {/* Add Button */}
      <button onClick={() => { setEditing(null); setForm({ name: '', icon: '', color: '#8B5CF6', sortOrder: 0 }); setShowForm(true); }}
        className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
        <Plus className="h-4 w-4" /> إضافة تصنيف
      </button>

      {/* Form Modal */}
      {showForm && (
        <Modal onClose={() => { setShowForm(false); setEditing(null); }}>
          <h2 className="text-lg font-bold text-gray-800 mb-4">{editing ? 'تعديل التصنيف' : 'إضافة تصنيف'}</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">الاسم *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">الرمز التعبيري</label>
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map((emoji) => (
                  <button key={emoji} onClick={() => setForm({ ...form, icon: emoji })}
                    className={`h-9 w-9 rounded-lg text-lg transition-all ${form.icon === emoji ? 'bg-violet-100 ring-2 ring-violet-500 scale-110' : 'hover:bg-gray-100'}`}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">اللون</label>
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-10 w-full rounded-lg border border-gray-200 cursor-pointer" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">ترتيب الفرز</label>
              <input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
            </div>
            <button onClick={handleSubmit}
              className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
              {editing ? 'حفظ التغييرات' : 'إنشاء'}
            </button>
          </div>
        </Modal>
      )}

      {/* Categories Grid with Reorder */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((cat, idx, arr) => (
          <div key={cat.id} className="rounded-xl border bg-white p-4 space-y-2 hover:shadow-md transition-shadow relative group">
            {/* Reorder Arrows */}
            <div className="absolute left-2 top-2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => moveCategory(idx, -1)} disabled={idx === 0}
                className="rounded p-0.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 disabled:opacity-20 transition-colors" title="تحريك لأعلى">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => moveCategory(idx, 1)} disabled={idx === arr.length - 1}
                className="rounded p-0.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 disabled:opacity-20 transition-colors" title="تحريك لأسفل">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl text-xl"
                  style={{ backgroundColor: cat.color || '#f3f4f6' }}>
                  {cat.icon || '📁'}
                </div>
                <div>
                  <p className="font-bold text-gray-800">{cat.name}</p>
                  <div className="flex items-center gap-2">
                    {cat.code && <span className="text-[10px] font-mono font-bold text-violet-500">{cat.code}</span>}
                    <p className="text-xs text-gray-500">{cat._count?.products || 0} منتجات</p>
                    <span className="text-[10px] text-gray-400">ترتيب: {cat.sortOrder || 0}</span>
                  </div>
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cat.active !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {cat.active !== false ? 'نشط' : 'غير نشط'}
              </span>
            </div>
            <div className="flex gap-1 pt-2 border-t border-gray-100">
              <button onClick={() => openEdit(cat)}
                className="flex-1 rounded-lg py-1.5 text-xs font-medium text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors">تعديل</button>
              <button onClick={() => toggleActive(cat)}
                className="flex-1 rounded-lg py-1.5 text-xs font-medium text-gray-600 hover:bg-orange-50 hover:text-orange-600 transition-colors">
                {cat.active !== false ? 'تعطيل' : 'تفعيل'}
              </button>
              <button onClick={() => handleDelete(cat.id)}
                className="flex-1 rounded-lg py-1.5 text-xs font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors">حذف</button>
            </div>
          </div>
        ))}
        {categories.length === 0 && <p className="col-span-full py-12 text-center text-sm text-gray-400">لا توجد تصنيفات</p>}
      </div>
    </SectionCard>
  );
}

/* ───────────────────────── PRODUCTS SECTION ───────────────────────── */

function ProductsSection({ refreshKey }: { refreshKey: number }) {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [form, setForm] = useState({ name: '', price: 0, cost: 0, categoryId: '', emoji: '', description: '', active: true });

  const load = useCallback(async () => {
    try {
      const [prodRes, catRes] = await Promise.all([
        api.get('/product-management/products?includeInactive=true'),
        api.get('/product-management/categories'),
      ]);
      setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
      setCategories(Array.isArray(catRes.data) ? catRes.data : []);
    } catch { setProducts([]); setCategories([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const filtered = products.filter((p) => {
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase());
    const matchCat = !categoryFilter || p.categoryRel?.id === categoryFilter || p.categoryId === categoryFilter;
    return matchSearch && matchCat;
  });

  const handleSubmit = async () => {
    if (!form.name || !form.price) return;
    try {
      if (editing) {
        await api.patch(`/product-management/products/${editing.id}`, form);
      } else {
        await api.post('/product-management/products', form);
      }
      setShowForm(false);
      setEditing(null);
      setForm({ name: '', price: 0, cost: 0, categoryId: '', emoji: '', description: '', active: true });
      load();
    } catch (err: any) { alert(err?.response?.data?.message || 'فشلت العملية'); }
  };

  const toggleActive = async (prod: any) => {
    try {
      if (prod.active !== false) {
        await api.delete(`/product-management/products/${prod.id}`);
      } else {
        await api.post(`/product-management/products/${prod.id}/activate`);
      }
      load();
    } catch { alert('فشل التحديث'); }
  };

  const openEdit = (prod: any) => {
    setEditing(prod);
    setForm({
      name: prod.name, price: Number(prod.price), cost: Number(prod.cost || 0),
      categoryId: prod.categoryId || prod.categoryRel?.id || '',
      emoji: prod.emoji || '', description: prod.description || '', active: prod.active !== false,
    });
    setShowForm(true);
  };

  if (loading) return <Loader />;
  return (
    <SectionCard title="إدارة المنتجات" subtitle="إنشاء وتعديل وتفعيل منتجات القائمة">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="بحث في المنتجات..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 pr-9 pl-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
          <option value="">كل التصنيفات</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        <button onClick={() => { setEditing(null); setForm({ name: '', price: 0, cost: 0, categoryId: '', emoji: '', description: '', active: true }); setShowForm(true); }}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
          <Plus className="h-4 w-4" /> إضافة منتج
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <Modal onClose={() => { setShowForm(false); setEditing(null); }}>
          <h2 className="text-lg font-bold text-gray-800 mb-4">{editing ? 'تعديل المنتج' : 'إضافة منتج'}</h2>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">الاسم *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">الرمز التعبيري</label>
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map((emoji) => (
                  <button key={emoji} onClick={() => setForm({ ...form, emoji })}
                    className={`h-9 w-9 rounded-lg text-lg transition-all ${form.emoji === emoji ? 'bg-violet-100 ring-2 ring-violet-500 scale-110' : 'hover:bg-gray-100'}`}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">التصنيف</label>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
                <option value="">اختر تصنيفاً</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">سعر البيع *</label>
                <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">التكلفة المقدرة</label>
                <input type="number" step="0.01" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">الوصف</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="prod-active" checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
                <label htmlFor="prod-active" className="text-sm text-gray-700">نشط</label>
              </div>
            )}
            <button onClick={handleSubmit}
              className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
              {editing ? 'حفظ التغييرات' : 'إنشاء المنتج'}
            </button>
          </div>
        </Modal>
      )}

      {/* View Toggle */}
      <div className="flex items-center gap-2">
        <button onClick={() => setViewMode('table')}
          className={`rounded-lg p-2 transition-colors ${viewMode === 'table' ? 'bg-violet-100 text-violet-700' : 'text-gray-400 hover:text-gray-600'}`}
          title="عرض جدول">
          <LayoutList className="h-4 w-4" />
        </button>
        <button onClick={() => setViewMode('grid')}
          className={`rounded-lg p-2 transition-colors ${viewMode === 'grid' ? 'bg-violet-100 text-violet-700' : 'text-gray-400 hover:text-gray-600'}`}
          title="عرض شبكي">
          <Grid3X3 className="h-4 w-4" />
        </button>
        <span className="text-xs text-gray-400">{filtered.length} منتج</span>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((prod) => {
            const price = Number(prod.price);
            const cost = Number(prod.cost || 0);
            const profit = price - cost;
            const margin = price > 0 ? (profit / price) * 100 : 0;
            return (
              <div key={prod.id} className="rounded-xl border bg-white p-4 space-y-3 hover:shadow-md transition-all hover:border-violet-200">
                <div className="flex items-start justify-between">
                  <span className="text-3xl">{prod.emoji || '☕'}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${prod.active !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {prod.active !== false ? 'نشط' : 'غير نشط'}
                  </span>
                </div>
                <div>
                  <p className="font-bold text-gray-800">{prod.name}</p>
                  <p className="text-xs text-gray-500">{prod.categoryRel?.name || prod.category || '—'}</p>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-lg font-bold text-gray-800">{formatCurrency(price)}</p>
                    <p className="text-xs text-gray-500">تكلفة: {formatCurrency(cost)}</p>
                  </div>
                  <div className="text-left">
                    <p className={`text-sm font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {margin.toFixed(0)}%
                    </p>
                    <p className="text-xs text-gray-500">{formatCurrency(profit)}</p>
                  </div>
                </div>
                <div className="flex gap-1 pt-2 border-t border-gray-100">
                  <button onClick={() => openEdit(prod)}
                    className="flex-1 rounded-lg py-1.5 text-xs font-medium text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors">تعديل</button>
                  <button onClick={() => toggleActive(prod)}
                    className="flex-1 rounded-lg py-1.5 text-xs font-medium text-gray-600 hover:bg-orange-50 hover:text-orange-600 transition-colors">
                    {prod.active !== false ? 'تعطيل' : 'تفعيل'}
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-gray-400">لا توجد منتجات</div>
          )}
        </div>
      ) : (
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500">
              <th className="px-3 py-3 text-right">الكود</th>
              <th className="px-3 py-3 text-right">المنتج</th>
              <th className="px-3 py-3 text-right">التصنيف</th>
              <th className="px-3 py-3 text-right">السعر</th>
              <th className="px-3 py-3 text-right">التكلفة</th>
              <th className="px-3 py-3 text-right">الربح</th>
              <th className="px-3 py-3 text-right">الحالة</th>
              <th className="px-3 py-3 text-right">الوصفة</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((prod) => {
              const price = Number(prod.price);
              const cost = Number(prod.cost || 0);
              const profit = price - cost;
              const margin = price > 0 ? (profit / price) * 100 : 0;
              return (
                <tr key={prod.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-3 text-xs font-mono font-bold text-violet-600">{prod.code || '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{prod.emoji || '☕'}</span>
                      <span className="font-medium text-gray-800">{prod.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-gray-600">{prod.categoryRel?.name || prod.category || '—'}</td>
                  <td className="px-3 py-3 font-mono font-bold text-gray-800">{formatCurrency(price)}</td>
                  <td className="px-3 py-3 font-mono text-gray-600">{formatCurrency(cost)}</td>
                  <td className="px-3 py-3">
                    <span className={`font-mono font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(profit)} ({margin.toFixed(0)}%)
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${prod.active !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {prod.active !== false ? 'نشط' : 'غير نشط'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${prod.recipe?.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                      {prod.recipe?.length > 0 ? `${prod.recipe.length} مكونات` : 'بدون وصفة'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(prod)}
                        className="rounded p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors" title="تعديل">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => toggleActive(prod)}
                        className={`rounded p-1.5 transition-colors ${prod.active !== false ? 'text-gray-500 hover:bg-orange-50 hover:text-orange-600' : 'text-gray-500 hover:bg-green-50 hover:text-green-600'}`}
                        title={prod.active !== false ? 'تعطيل' : 'تفعيل'}>
                        {prod.active !== false ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">لا توجد منتجات</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </SectionCard>
  );
}

/* ───────────────────────── RECIPES SECTION ───────────────────────── */

function InventorySearchSelect({ inventory, value, onChange, placeholder }: {
  inventory: any[]; value: string; onChange: (id: string, item: any) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = inventory.find((i) => i.id === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = inventory.filter((i) => {
    const q = search.toLowerCase();
    return !q || i.itemName?.toLowerCase().includes(q) || (i.code || '').toLowerCase().includes(q);
  });

  return (
    <div ref={ref} className="relative">
      <input type="text" value={search || (selected ? `${selected.code || '---'} ${selected.emoji || ''} ${selected.itemName}` : '')}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || 'ابحث عن مكون...'}
        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-violet-400 focus:outline-none" />
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">لا توجد نتائج</div>}
          {filtered.map((inv) => (
            <button key={inv.id} type="button" onClick={() => { onChange(inv.id, inv); setSearch(''); setOpen(false); }}
              className={`w-full text-right px-3 py-2 text-xs hover:bg-violet-50 flex items-center gap-2 ${value === inv.id ? 'bg-violet-50 font-bold' : ''}`}>
              <span className="text-sm">{inv.emoji || '📦'}</span>
              <code className="text-[10px] text-gray-400 font-mono">{inv.code || '---'}</code>
              <span className="flex-1">{inv.itemName}</span>
              <span className="text-[10px] text-gray-400">{formatCurrency(Number(inv.costPerUnit))}/{inv.unit}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RecipesSection({ refreshKey }: { refreshKey: number }) {
  const [products, setProducts] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [recipe, setRecipe] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editIngredients, setEditIngredients] = useState<any[]>([]);
  const [costBreakdown, setCostBreakdown] = useState<any>(null);
  const [addOns, setAddOns] = useState<any[]>([]);
  const [sizes, setSizes] = useState<any[]>([]);
  const [showAddOnModal, setShowAddOnModal] = useState(false);
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [showOptionModal, setShowOptionModal] = useState(false);
  const [editAddOn, setEditAddOn] = useState<any>(null);
  const [editSize, setEditSize] = useState<any>(null);
  const [editOption, setEditOption] = useState<any>(null);
  const [options, setOptions] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const [prodRes, invRes] = await Promise.all([
        api.get('/product-management/products?includeInactive=true'),
        api.get('/inventory'),
      ]);
      setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
      setInventory(Array.isArray(invRes.data) ? invRes.data : []);
    } catch { setProducts([]); setInventory([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const loadRecipe = async (productId: string) => {
    if (!productId) return;
    setRecipeLoading(true);
    try {
      const { data } = await api.get(`/product-management/products/${productId}/recipe`);
      setRecipe(Array.isArray(data) ? data : []);
      const { data: costData } = await api.get(`/product-management/products/${productId}/cost-breakdown`).catch(() => ({ data: null }));
      setCostBreakdown(costData);
      api.get(`/product-management/products/${productId}/add-ons`).then(({ data: a }) => setAddOns(Array.isArray(a) ? a : [])).catch(() => {});
      api.get(`/product-management/products/${productId}/sizes`).then(({ data: s }) => setSizes(Array.isArray(s) ? s : [])).catch(() => {});
      api.get(`/product-management/products/${productId}/options`).then(({ data: o }) => setOptions(Array.isArray(o) ? o : [])).catch(() => {});
    } catch { setRecipe([]); setCostBreakdown(null); setAddOns([]); setSizes([]); }
    setRecipeLoading(false);
  };

  useEffect(() => {
    if (selectedProduct) loadRecipe(selectedProduct);
    else { setRecipe([]); setCostBreakdown(null); }
  }, [selectedProduct]);

  const startEdit = () => {
    setEditIngredients(recipe.map((r: any) => ({
      inventoryId: r.inventoryId || '',
      inventoryName: r.inventory?.itemName || '',
      quantity: Number(r.quantity),
      unit: r.unit || 'g',
      wastePercent: Number(r.wastePercent || 0),
      emoji: r.emoji || '',
      notes: r.notes || '',
    })));
    setEditing(true);
  };

  const addIngredientRow = () => {
    setEditIngredients([...editIngredients, { inventoryId: '', inventoryName: '', quantity: 0, unit: 'g', wastePercent: 0, emoji: '', notes: '' }]);
  };

  const removeIngredientRow = (idx: number) => {
    setEditIngredients(editIngredients.filter((_, i) => i !== idx));
  };

  const updateIngredient = (idx: number, field: string, value: any) => {
    const updated = [...editIngredients];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === 'inventoryId') {
      const inv = inventory.find((i: any) => i.id === value);
      if (inv) {
        updated[idx].inventoryName = inv.itemName;
        updated[idx].unit = inv.unit || 'g';
      }
    }
    setEditIngredients(updated);
  };

  const saveRecipe = async () => {
    if (!selectedProduct) return;
    try {
      const ingredients = editIngredients.map((ing) => ({
        inventoryId: ing.inventoryId,
        quantity: Number(ing.quantity),
        unit: ing.unit,
        wastePercent: Number(ing.wastePercent || 0),
        emoji: ing.emoji || undefined,
        notes: ing.notes || undefined,
      }));
      await api.put(`/product-management/products/${selectedProduct}/recipe`, ingredients);
      setEditing(false);
      loadRecipe(selectedProduct);
    } catch (err: any) { alert(err?.response?.data?.message || 'فشل حفظ الوصفة'); }
  };

  const duplicateRecipe = async () => {
    if (!selectedProduct || !recipe.length) return;
    const newName = prompt('اسم المنتج الجديد:');
    if (!newName) return;
    try {
      const prod = products.find((p: any) => p.id === selectedProduct);
      const { data: newProd } = await api.post('/product-management/products', {
        name: newName,
        price: Number(prod?.price || 0),
        categoryId: prod?.categoryId || undefined,
      });
      const ingredients = recipe.map((r: any) => ({
        inventoryId: r.inventoryId,
        quantity: Number(r.quantity),
        unit: r.unit,
        wastePercent: Number(r.wastePercent || 0),
        emoji: r.emoji || undefined,
        notes: r.notes || undefined,
      }));
      await api.put(`/product-management/products/${newProd.id}/recipe`, ingredients);
      load();
      setSelectedProduct(newProd.id);
    } catch (err: any) { alert(err?.response?.data?.message || 'فشل نسخ الوصفة'); }
  };

  const selectedProd = products.find((p: any) => p.id === selectedProduct);

  if (loading) return <Loader />;
  return (
    <SectionCard title="إدارة الوصفات" subtitle="ربط المنتجات بالمكونات وحساب التكاليف">
      {/* Product Selector */}
      <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none">
        <option value="">اختر منتجاً</option>
        {products.map((p: any) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
      </select>

      {!selectedProduct && (
        <div className="py-12 text-center text-sm text-gray-400">اختر منتجاً لعرض وصفتها</div>
      )}

      {selectedProduct && recipeLoading && <Loader />}

      {selectedProduct && !recipeLoading && (
        <div className="space-y-4">
          {/* Product Info */}
          <div className="rounded-xl border bg-gradient-to-br from-violet-50 to-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{selectedProd?.emoji || '☕'}</span>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">{selectedProd?.name}</h3>
                  <p className="text-sm text-gray-500">{selectedProd?.categoryRel?.name}</p>
                </div>
              </div>
              <div className="text-left">
                <p className="text-sm text-gray-500">سعر البيع</p>
                <p className="text-xl font-bold text-gray-800">{formatCurrency(Number(selectedProd?.price || 0))}</p>
              </div>
            </div>
          </div>

          {/* Cost Summary */}
          {costBreakdown && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border bg-white p-3">
                <p className="text-xs text-gray-500">التكلفة التقديرية</p>
                <p className="text-lg font-bold text-gray-800">{formatCurrency(costBreakdown.estimatedCost || 0)}</p>
              </div>
              <div className="rounded-xl border bg-white p-3">
                <p className="text-xs text-gray-500">الربح التقديري</p>
                <p className="text-lg font-bold text-emerald-600">{formatCurrency(costBreakdown.estimatedProfit || 0)}</p>
              </div>
              <div className="rounded-xl border bg-white p-3">
                <p className="text-xs text-gray-500">هامش الربح</p>
                <p className="text-lg font-bold text-violet-600">{(costBreakdown.profitMargin || 0).toFixed(1)}%</p>
              </div>
              <div className="rounded-xl border bg-white p-3">
                <p className="text-xs text-gray-500">تكلفة المكونات</p>
                <p className="text-lg font-bold text-amber-600">{formatCurrency(costBreakdown.breakdown?.ingredientCost || 0)}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {!editing && (
              <>
                <button onClick={startEdit}
                  className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
                  <Pencil className="h-4 w-4" /> تعديل الوصفة
                </button>
                <button onClick={duplicateRecipe}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <Copy className="h-4 w-4" /> نسخ كوصفة جديدة
                </button>
              </>
            )}
            {editing && (
              <>
                <button onClick={saveRecipe}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors">
                  <Save className="h-4 w-4" /> حفظ الوصفة
                </button>
                <button onClick={() => setEditing(false)}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <X className="h-4 w-4" /> إلغاء
                </button>
              </>
            )}
          </div>

          {/* Recipe Ingredients */}
          <div className="overflow-hidden rounded-xl border bg-white">
            <div className="border-b bg-gray-50 px-4 py-3">
              <h4 className="text-sm font-bold text-gray-700">المكونات</h4>
            </div>
            {!editing ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500">
                    <th className="px-4 py-2 text-right">المكون</th>
                    <th className="px-4 py-2 text-right">الكمية</th>
                    <th className="px-4 py-2 text-right">الوحدة</th>
                    <th className="px-4 py-2 text-right">تكلفة الوحدة</th>
                    <th className="px-4 py-2 text-right">التكلفة الإجمالية</th>
                    <th className="px-4 py-2 text-right">المخزون</th>
                  </tr>
                </thead>
                <tbody>
                  {recipe.map((r: any, idx: number) => {
                    const qty = Number(r.quantity);
                    const unitCost = Number(r.inventory?.costPerUnit || 0);
                    const totalCost = qty * unitCost;
                    const invStock = Number(r.inventory?.currentQty || 0);
                    const invThreshold = Number(r.inventory?.minThreshold || 0);
                    const stockOk = invStock > invThreshold;
                    const stockLow = invStock > 0 && invStock <= invThreshold;
                    return (
                      <tr key={r.id || idx} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span>{r.emoji || '🧂'}</span>
                            <span className="font-medium text-gray-800">{r.inventory?.itemName || r.notes || 'مكون'}</span>
                            {r.inventory?.code && <code className="text-[10px] text-gray-400 font-mono">{r.inventory.code}</code>}
                          </div>
                        </td>
                        <td className="px-4 py-2 font-mono text-gray-700">{qty}</td>
                        <td className="px-4 py-2 text-gray-600">{r.unit || r.inventory?.unit}</td>
                        <td className="px-4 py-2 font-mono text-gray-600">{formatCurrency(unitCost)}</td>
                        <td className="px-4 py-2 font-mono font-bold text-gray-800">{formatCurrency(totalCost)}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            stockOk ? 'bg-emerald-100 text-emerald-700' :
                            stockLow ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              stockOk ? 'bg-emerald-500' :
                              stockLow ? 'bg-amber-500' : 'bg-red-500'
                            }`} />
                            {invStock} {r.inventory?.unit || r.unit}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {recipe.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">لا توجد مكونات — أضف وصفة</td></tr>
                  )}
                </tbody>
              </table>
            ) : (
              <div className="p-4 space-y-3">
                {editIngredients.map((ing, idx) => (
                  <div key={idx} className="flex flex-wrap items-end gap-2 rounded-lg border bg-gray-50 p-3">
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-[10px] font-medium text-gray-500 mb-1">المكون</label>
                      <InventorySearchSelect inventory={inventory} value={ing.inventoryId}
                        onChange={(id, inv) => updateIngredient(idx, 'inventoryId', id)} placeholder="ابحث عن مكون..." />
                    </div>
                    <div className="w-20">
                      <label className="block text-[10px] font-medium text-gray-500 mb-1">الكمية</label>
                      <input type="number" step="0.01" min="0" value={ing.quantity}
                        onChange={(e) => updateIngredient(idx, 'quantity', Number(e.target.value))}
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-violet-400 focus:outline-none" />
                    </div>
                    <div className="w-20">
                      <label className="block text-[10px] font-medium text-gray-500 mb-1">الوحدة</label>
                      <select value={ing.unit} onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-violet-400 focus:outline-none">
                        {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="w-20">
                      <label className="block text-[10px] font-medium text-gray-500 mb-1">هدر %</label>
                      <input type="number" min="0" max="100" value={ing.wastePercent}
                        onChange={(e) => updateIngredient(idx, 'wastePercent', Number(e.target.value))}
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-violet-400 focus:outline-none" />
                    </div>
                    <div className="w-12">
                      <label className="block text-[10px] font-medium text-gray-500 mb-1">رمز</label>
                      <input type="text" value={ing.emoji}
                        onChange={(e) => updateIngredient(idx, 'emoji', e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-center focus:border-violet-400 focus:outline-none" />
                    </div>
                    <button onClick={() => removeIngredientRow(idx)}
                      className="rounded-lg p-2 text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button onClick={addIngredientRow}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors w-full justify-center">
                  <Plus className="h-4 w-4" /> إضافة مكون
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add-ons Sub-section ── */}
      {selectedProduct && !recipeLoading && (
        <div className="rounded-xl border bg-white">
          <div className="border-b bg-gradient-to-l from-amber-50 to-white px-4 py-3 flex items-center justify-between">
            <h4 className="text-sm font-bold text-gray-700">الإضافات</h4>
            <button onClick={() => { setEditAddOn(null); setShowAddOnModal(true); }}
              className="flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors">
              <Plus className="h-3.5 w-3.5" /> إضافة
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500">
                <th className="px-4 py-2 text-right">الاسم</th>
                <th className="px-4 py-2 text-right">السعر</th>
                <th className="px-4 py-2 text-right">المخزون</th>
                <th className="px-4 py-2 text-right">الكمية</th>
                <th className="px-4 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {addOns.map((a: any) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{a.name}</td>
                  <td className="px-4 py-2 font-mono text-gray-700">{formatCurrency(Number(a.price))}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{a.inventory?.itemName}</td>
                  <td className="px-4 py-2 font-mono text-gray-600">{Number(a.quantity)} {a.unit}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditAddOn(a); setShowAddOnModal(true); }}
                        className="rounded p-1 text-gray-400 hover:text-amber-600 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={async () => {
                        if (!confirm('حذف الإضافة؟')) return;
                        await api.put(`/product-management/products/${selectedProduct}/add-ons`, addOns.filter((x: any) => x.id !== a.id).map((x: any) => ({
                          name: x.name, price: Number(x.price), inventoryId: x.inventoryId, quantity: Number(x.quantity), unit: x.unit, active: x.active ?? true,
                        })));
                        const { data: aData } = await api.get(`/product-management/products/${selectedProduct}/add-ons`);
                        setAddOns(Array.isArray(aData) ? aData : []);
                      }}
                        className="rounded p-1 text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {addOns.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">لا توجد إضافات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Sizes Sub-section ── */}
      {selectedProduct && !recipeLoading && (
        <div className="rounded-xl border bg-white">
          <div className="border-b bg-gradient-to-l from-blue-50 to-white px-4 py-3 flex items-center justify-between">
            <h4 className="text-sm font-bold text-gray-700">المقاسات</h4>
            <button onClick={() => { setEditSize(null); setShowSizeModal(true); }}
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors">
              <Plus className="h-3.5 w-3.5" /> إضافة
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500">
                <th className="px-4 py-2 text-right">الاسم</th>
                <th className="px-4 py-2 text-right">تعديل السعر</th>
                <th className="px-4 py-2 text-right">% التكلفة</th>
                <th className="px-4 py-2 text-right">الترتيب</th>
                <th className="px-4 py-2 text-right">الحالة</th>
                <th className="px-4 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {sizes.map((s: any) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{s.name}</td>
                  <td className="px-4 py-2 font-mono text-gray-700">{formatCurrency(Number(s.priceAdjust))}</td>
                  <td className="px-4 py-2 font-mono text-gray-600">{Number(s.costPercent)}%</td>
                  <td className="px-4 py-2 font-mono text-gray-500">{s.sortOrder}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.active ? 'نشط' : 'غير نشط'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditSize(s); setShowSizeModal(true); }}
                        className="rounded p-1 text-gray-400 hover:text-blue-600 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={async () => {
                        if (!confirm('حذف المقاس؟')) return;
                        await api.put(`/product-management/products/${selectedProduct}/sizes`, sizes.filter((x: any) => x.id !== s.id).map((x: any) => ({
                          name: x.name, priceAdjust: Number(x.priceAdjust), costPercent: Number(x.costPercent), sortOrder: x.sortOrder, active: x.active ?? true,
                        })));
                        const { data: sData } = await api.get(`/product-management/products/${selectedProduct}/sizes`);
                        setSizes(Array.isArray(sData) ? sData : []);
                      }}
                        className="rounded p-1 text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {sizes.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400">لا توجد مقاسات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Options Sub-section ── */}
      {selectedProduct && !recipeLoading && (
        <div className="rounded-xl border bg-white">
          <div className="border-b bg-gradient-to-l from-purple-50 to-white px-4 py-3 flex items-center justify-between">
            <h4 className="text-sm font-bold text-gray-700">خيارات المنتج</h4>
            <button onClick={() => { setEditOption(null); setShowOptionModal(true); }}
              className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 transition-colors">
              <Plus className="h-3.5 w-3.5" /> إضافة
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500">
                <th className="px-4 py-2 text-right">الاسم</th>
                <th className="px-4 py-2 text-right">مطلوب</th>
                <th className="px-4 py-2 text-right">متعدد</th>
                <th className="px-4 py-2 text-right">عدد الخيارات</th>
                <th className="px-4 py-2 text-right">الترتيب</th>
                <th className="px-4 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {options.map((o: any) => (
                <tr key={o.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{o.name}</td>
                  <td className="px-4 py-2">
                    {o.required
                      ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">نعم</span>
                      : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">لا</span>}
                  </td>
                  <td className="px-4 py-2">
                    {o.multiSelect
                      ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">نعم</span>
                      : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">لا</span>}
                  </td>
                  <td className="px-4 py-2 font-mono text-gray-700">{Array.isArray(o.choices) ? o.choices.length : 0}</td>
                  <td className="px-4 py-2 font-mono text-gray-500">{o.sortOrder}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditOption(o); setShowOptionModal(true); }}
                        className="rounded p-1 text-gray-400 hover:text-purple-600 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={async () => {
                        if (!confirm('حذف مجموعة الخيارات؟')) return;
                        await api.put(`/product-management/products/${selectedProduct}/options`, options.filter((x: any) => x.id !== o.id).map((x: any) => ({
                          name: x.name, required: x.required ?? false, multiSelect: x.multiSelect ?? false, choices: x.choices || [], sortOrder: x.sortOrder ?? 0,
                        })));
                        const { data: oData } = await api.get(`/product-management/products/${selectedProduct}/options`);
                        setOptions(Array.isArray(oData) ? oData : []);
                      }}
                        className="rounded p-1 text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {options.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400">لا توجد خيارات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add-on Modal ── */}
      {showAddOnModal && (
        <Modal onClose={() => { setShowAddOnModal(false); setEditAddOn(null); }}>
          <h3 className="text-lg font-bold text-gray-800 mb-4">{editAddOn ? 'تعديل الإضافة' : 'إضافة جديدة'}</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">الاسم *</label>
              <input type="text" value={editAddOn?.name || ''} onChange={(e) => setEditAddOn({ ...(editAddOn || {}), name: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">السعر *</label>
              <input type="number" min="0" step="0.01" value={editAddOn?.price ?? 0} onChange={(e) => setEditAddOn({ ...(editAddOn || {}), price: Number(e.target.value) })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">المكون (من المخزون) *</label>
              <InventorySearchSelect inventory={inventory} value={editAddOn?.inventoryId || ''}
                onChange={(id) => { const inv = inventory.find((i) => i.id === id); setEditAddOn({ ...(editAddOn || {}), inventoryId: id, unit: inv?.unit || 'g' }); }}
                placeholder="ابحث عن مكون..." />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">الكمية *</label>
                <input type="number" min="0" step="0.01" value={editAddOn?.quantity ?? 0} onChange={(e) => setEditAddOn({ ...(editAddOn || {}), quantity: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none" />
              </div>
              <div className="w-24">
                <label className="block text-xs font-medium text-gray-500 mb-1">الوحدة</label>
                <select value={editAddOn?.unit || 'g'} onChange={(e) => setEditAddOn({ ...(editAddOn || {}), unit: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none">
                  {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <button onClick={async () => {
              if (!editAddOn?.name || !editAddOn?.price || !editAddOn?.inventoryId || !editAddOn?.quantity) { alert('املأ جميع الحقول المطلوبة'); return; }
              const existing = addOns.filter((a: any) => a.id !== editAddOn.id);
              const newList = [...existing, { name: editAddOn.name, price: editAddOn.price, inventoryId: editAddOn.inventoryId, quantity: editAddOn.quantity, unit: editAddOn.unit || 'g', active: true }];
              await api.put(`/product-management/products/${selectedProduct}/add-ons`, newList);
              const { data: aData } = await api.get(`/product-management/products/${selectedProduct}/add-ons`);
              setAddOns(Array.isArray(aData) ? aData : []);
              setShowAddOnModal(false); setEditAddOn(null);
            }}
              className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors">
              حفظ
            </button>
          </div>
        </Modal>
      )}

      {/* ── Size Modal ── */}
      {showSizeModal && (
        <Modal onClose={() => { setShowSizeModal(false); setEditSize(null); }}>
          <h3 className="text-lg font-bold text-gray-800 mb-4">{editSize ? 'تعديل المقاس' : 'إضافة مقاس جديد'}</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">الاسم *</label>
              <input type="text" value={editSize?.name || ''} onChange={(e) => setEditSize({ ...(editSize || {}), name: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">تعديل السعر (جنيه)</label>
                <input type="number" step="0.01" value={editSize?.priceAdjust ?? 0} onChange={(e) => setEditSize({ ...(editSize || {}), priceAdjust: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">% التكلفة</label>
                <input type="number" min="0" max="100" value={editSize?.costPercent ?? 100} onChange={(e) => setEditSize({ ...(editSize || {}), costPercent: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">الترتيب</label>
                <input type="number" min="0" value={editSize?.sortOrder ?? 0} onChange={(e) => setEditSize({ ...(editSize || {}), sortOrder: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editSize?.active ?? true} onChange={(e) => setEditSize({ ...(editSize || {}), active: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-xs font-medium text-gray-600">نشط</span>
                </label>
              </div>
            </div>
            <button onClick={async () => {
              if (!editSize?.name) { alert('أدخل اسم المقاس'); return; }
              const existing = sizes.filter((s: any) => s.id !== editSize.id);
              const newList = [...existing, { name: editSize.name, priceAdjust: editSize.priceAdjust ?? 0, costPercent: editSize.costPercent ?? 100, sortOrder: editSize.sortOrder ?? 0, active: editSize.active ?? true }];
              await api.put(`/product-management/products/${selectedProduct}/sizes`, newList);
              const { data: sData } = await api.get(`/product-management/products/${selectedProduct}/sizes`);
              setSizes(Array.isArray(sData) ? sData : []);
              setShowSizeModal(false); setEditSize(null);
            }}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
              حفظ
            </button>
          </div>
        </Modal>
      )}

      {/* ── Options Modal ── */}
      {showOptionModal && (
        <Modal onClose={() => { setShowOptionModal(false); setEditOption(null); }}>
          <h3 className="text-lg font-bold text-gray-800 mb-4">{editOption ? 'تعديل مجموعة خيارات' : 'إضافة مجموعة خيارات جديدة'}</h3>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">الاسم *</label>
              <input type="text" value={editOption?.name || ''}
                onChange={(e) => setEditOption({ ...(editOption || {}), name: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none" />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editOption?.required ?? true}
                  onChange={(e) => setEditOption({ ...(editOption || {}), required: e.target.checked })}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                <span className="text-xs font-medium text-gray-600">مطلوب</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editOption?.multiSelect ?? false}
                  onChange={(e) => setEditOption({ ...(editOption || {}), multiSelect: e.target.checked })}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                <span className="text-xs font-medium text-gray-600">اختيار متعدد</span>
              </label>
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-gray-500 mb-1">الترتيب</label>
              <input type="number" min="0" value={editOption?.sortOrder ?? 0}
                onChange={(e) => setEditOption({ ...(editOption || {}), sortOrder: Number(e.target.value) })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none" />
            </div>

            {/* Choices sub-list */}
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-600">الخيارات المتاحة</span>
                <button onClick={() => {
                  const choices = [...(editOption?.choices || []), { label: '', priceAdjust: 0, sortOrder: (editOption?.choices?.length || 0) }];
                  setEditOption({ ...(editOption || {}), choices });
                }}
                  className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-medium">
                  <Plus className="h-3 w-3" /> إضافة خيار
                </button>
              </div>
              {(editOption?.choices || []).map((c: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-gray-50">
                  <div className="flex-1">
                    <input type="text" placeholder="الاسم" value={c.label || ''}
                      onChange={(e) => {
                        const choices = [...editOption.choices];
                        choices[idx] = { ...choices[idx], label: e.target.value };
                        setEditOption({ ...editOption, choices });
                      }}
                      className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-purple-400 focus:outline-none" />
                  </div>
                  <div className="w-20">
                    <input type="number" placeholder="تعديل السعر" step="0.01" value={c.priceAdjust ?? 0}
                      onChange={(e) => {
                        const choices = [...editOption.choices];
                        choices[idx] = { ...choices[idx], priceAdjust: Number(e.target.value) };
                        setEditOption({ ...editOption, choices });
                      }}
                      className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-purple-400 focus:outline-none" />
                  </div>
                  <button onClick={() => {
                    const choices = editOption.choices.filter((_: any, i: number) => i !== idx);
                    setEditOption({ ...editOption, choices });
                  }}
                    className="rounded p-1 text-gray-400 hover:text-red-600 transition-colors flex-shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {(!editOption?.choices || editOption.choices.length === 0) && (
                <p className="text-xs text-gray-400 text-center py-2">لا توجد خيارات. أضف خيارات باستخدام الزر أعلاه.</p>
              )}
            </div>

            <button onClick={async () => {
              if (!editOption?.name) { alert('أدخل اسم مجموعة الخيارات'); return; }
              const choices = (editOption.choices || []).filter((c: any) => c.label).map((c: any, i: number) => ({
                label: c.label, priceAdjust: Number(c.priceAdjust || 0), sortOrder: c.sortOrder ?? i,
              }));
              if (choices.length === 0) { alert('أضف خياراً واحداً على الأقل'); return; }
              const existing = options.filter((x: any) => x.id !== editOption.id);
              const newList = [...existing, {
                name: editOption.name, required: editOption.required ?? true, multiSelect: editOption.multiSelect ?? false,
                choices, sortOrder: editOption.sortOrder ?? 0,
              }];
              await api.put(`/product-management/products/${selectedProduct}/options`, newList);
              const { data: oData } = await api.get(`/product-management/products/${selectedProduct}/options`);
              setOptions(Array.isArray(oData) ? oData : []);
              setShowOptionModal(false); setEditOption(null);
            }}
              className="w-full rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 transition-colors">
              حفظ
            </button>
          </div>
        </Modal>
      )}
    </SectionCard>
  );
}

/* ───────────────────────── COSTING SECTION ───────────────────────── */

function CostingSection({ refreshKey }: { refreshKey: number }) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [costData, setCostData] = useState<any>(null);
  const [costLoading, setCostLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/product-management/products?includeInactive=true');
      setProducts(Array.isArray(data) ? data : []);
    } catch { setProducts([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    if (!selectedProduct) { setCostData(null); return; }
    setCostLoading(true);
    api.get(`/product-management/products/${selectedProduct}/cost-breakdown`)
      .then(({ data }) => setCostData(data))
      .catch(() => setCostData(null))
      .finally(() => setCostLoading(false));
  }, [selectedProduct]);

  if (loading) return <Loader />;
  return (
    <SectionCard title="التكلفة والأرباح" subtitle="تحليل تفصيلي لتكلفة المنتجات وهامش الربح">
      <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none">
        <option value="">اختر منتجاً</option>
        {products.map((p: any) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
      </select>

      {costLoading && <Loader />}

      {!selectedProduct && !costLoading && (
        <div className="py-12 text-center text-sm text-gray-400">اختر منتجاً لتحليل التكلفة</div>
      )}

      {costData && !costLoading && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-gray-500">سعر البيع</p>
              <p className="text-2xl font-bold text-gray-800">{formatCurrency(costData.sellingPrice || 0)}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-gray-500">التكلفة التقديرية</p>
              <p className="text-2xl font-bold text-amber-600">{formatCurrency(costData.estimatedCost || 0)}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-gray-500">الربح التقديري</p>
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(costData.estimatedProfit || 0)}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-gray-500">هامش الربح</p>
              <p className="text-2xl font-bold text-violet-600">{(costData.profitMargin || 0).toFixed(1)}%</p>
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="rounded-xl border bg-white">
            <div className="border-b bg-gray-50 px-4 py-3">
              <h4 className="text-sm font-bold text-gray-700">تفصيل التكلفة</h4>
            </div>
            <div className="p-4 space-y-3">
              {[
                { label: 'تكلفة المكونات', value: costData.breakdown?.ingredientCost || 0, color: 'bg-violet-500', pct: costData.estimatedCost > 0 ? ((costData.breakdown?.ingredientCost || 0) / costData.estimatedCost) * 100 : 0 },
                { label: 'تكلفة العمالة', value: costData.breakdown?.laborCost || 0, color: 'bg-blue-500', pct: costData.estimatedCost > 0 ? ((costData.breakdown?.laborCost || 0) / costData.estimatedCost) * 100 : 0 },
                { label: 'التكاليف التشغيلية', value: costData.breakdown?.operationalCost || 0, color: 'bg-amber-500', pct: costData.estimatedCost > 0 ? ((costData.breakdown?.operationalCost || 0) / costData.estimatedCost) * 100 : 0 },
                { label: 'تكلفة المرافق', value: costData.breakdown?.utilityCost || 0, color: 'bg-emerald-500', pct: costData.estimatedCost > 0 ? ((costData.breakdown?.utilityCost || 0) / costData.estimatedCost) * 100 : 0 },
                { label: 'تكاليف متنوعة', value: costData.breakdown?.miscellaneousCost || 0, color: 'bg-rose-500', pct: costData.estimatedCost > 0 ? ((costData.breakdown?.miscellaneousCost || 0) / costData.estimatedCost) * 100 : 0 },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{item.label}</span>
                    <span className="font-mono font-bold text-gray-800">{formatCurrency(item.value)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full ${item.color} transition-all`} style={{ width: `${Math.min(item.pct, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ingredient Breakdown */}
          {costData.breakdown?.ingredientBreakdown?.length > 0 && (
            <div className="rounded-xl border bg-white">
              <div className="border-b bg-gray-50 px-4 py-3">
                <h4 className="text-sm font-bold text-gray-700">تفصيل المكونات</h4>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500">
                    <th className="px-4 py-2 text-right">المكون</th>
                    <th className="px-4 py-2 text-right">الكمية</th>
                    <th className="px-4 py-2 text-right">سعر الوحدة</th>
                    <th className="px-4 py-2 text-right">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {costData.breakdown.ingredientBreakdown.map((ing: any, idx: number) => (
                    <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-800">{ing.emoji} {ing.name || ing.itemName}</td>
                      <td className="px-4 py-2 text-gray-600">{ing.quantity} {ing.unit}</td>
                      <td className="px-4 py-2 font-mono text-gray-600">{formatCurrency(Number(ing.unitCost) || 0)}</td>
                      <td className="px-4 py-2 font-mono font-bold text-gray-800">{formatCurrency(Number(ing.totalCost) || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

/* ───────────────────────── EMPLOYEES SECTION ───────────────────────── */

function EmployeesSection({ refreshKey }: { refreshKey: number }) {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', role: 'BARISTA', salary: 0, salaryType: 'MONTHLY', hourlyWage: 0, active: true, loginCode: '', password: '' });
  const [generating, setGenerating] = useState<string | null>(null);
  const [expandedStats, setExpandedStats] = useState<Record<string, any>>({});
  const [loadingStats, setLoadingStats] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/staff');
      setStaff(Array.isArray(data) ? data : []);
    } catch { setStaff([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const filtered = staff.filter((s) => {
    const ms = !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.phone?.includes(search);
    const mr = !roleFilter || s.role === roleFilter;
    return ms && mr;
  });

  const handleSubmit = async () => {
    if (!form.name || !form.phone) return;
    try {
      if (editing) {
        const body: any = { name: form.name, phone: form.phone, role: form.role, salary: form.salary, salaryType: form.salaryType, active: form.active };
        if (form.salaryType === 'HOURLY') body.hourlyWage = form.hourlyWage;
        await api.patch(`/staff/${editing.id}`, body);
      } else {
        const body: any = { name: form.name, phone: form.phone, role: form.role, salary: form.salary, salaryType: form.salaryType };
        if (form.salaryType === 'HOURLY') body.hourlyWage = form.hourlyWage;
        if (form.loginCode) body.loginCode = form.loginCode;
        if (form.password) body.password = form.password;
        await api.post('/staff', body);
      }
      setShowForm(false);
      setEditing(null);
      setForm({ name: '', phone: '', role: 'BARISTA', salary: 0, salaryType: 'MONTHLY', hourlyWage: 0, active: true, loginCode: '', password: '' });
      load();
    } catch (err: any) { alert(err?.response?.data?.message || 'فشلت العملية'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('حذف هذا الموظف نهائياً؟')) return;
    try { await api.delete(`/staff/${id}`); load(); }
    catch { alert('فشل الحذف'); }
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    try { await api.patch(`/staff/${id}`, { active: !currentActive }); load(); }
    catch { alert('فشل التحديث'); }
  };

  const resetLoginCode = async (id: string) => {
    setGenerating(id);
    try { await api.post(`/staff/${id}/reset-code`); load(); }
    finally { setGenerating(null); }
  };

  const setPassword = async (id: string) => {
    const pw = prompt('أدخل كلمة السر الجديدة:');
    if (!pw) return;
    try { await api.post(`/staff/${id}/set-password`, { password: pw }); alert('تم تعيين كلمة السر'); }
    catch (err: any) { alert(err?.response?.data?.message || 'فشل'); }
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
    } finally { setLoadingStats(null); }
  };

  if (loading) return <Loader />;
  return (
    <SectionCard title="إدارة الموظفين" subtitle="إضافة، تعديل، وإدارة بيانات الموظفين">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="ابحث بالاسم أو الهاتف..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 pr-9 pl-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
          <option value="">كل الأدوار</option>
          <option value="BARISTA">باريستا</option>
          <option value="DRIVER">سائق</option>
          <option value="OWNER">مالك</option>
        </select>
        <button onClick={() => { setEditing(null); setForm({ name: '', phone: '', role: 'BARISTA', salary: 0, salaryType: 'MONTHLY', hourlyWage: 0, active: true, loginCode: '', password: '' }); setShowForm(true); }}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
          <Plus className="h-4 w-4" /> إضافة موظف
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <Modal onClose={() => { setShowForm(false); setEditing(null); }}>
          <h2 className="text-lg font-bold text-gray-800 mb-4">{editing ? 'تعديل الموظف' : 'إضافة موظف'}</h2>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">الاسم *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">رقم الهاتف *</label>
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
              <input type="number" min="0" value={form.salary} onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
            </div>
            {form.salaryType === 'HOURLY' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">أجر الساعة (جنيه)</label>
                <input type="number" min="0" value={form.hourlyWage} onChange={(e) => setForm({ ...form, hourlyWage: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
              </div>
            )}
            {!editing && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">اسم المستخدم (كود الدخول)</label>
                  <input type="text" placeholder="مثال: ahmed-01" value={form.loginCode} onChange={(e) => setForm({ ...form, loginCode: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">كلمة السر</label>
                  <input type="password" placeholder="******" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
                </div>
              </>
            )}
            {editing && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="emp-active" checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
                <label htmlFor="emp-active" className="text-sm text-gray-700">نشط</label>
              </div>
            )}
            <button onClick={handleSubmit}
              className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
              {editing ? 'حفظ التغييرات' : 'إنشاء الموظف'}
            </button>
          </div>
        </Modal>
      )}

      {/* Employees Table */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500">
              <th className="px-4 py-3 text-right">الاسم</th>
              <th className="px-4 py-3 text-right">الهاتف</th>
              <th className="px-4 py-3 text-right">الدور</th>
              <th className="px-4 py-3 text-right">الراتب</th>
              <th className="px-4 py-3 text-right">نظام الأجر</th>
              <th className="px-4 py-3 text-right">الحالة</th>
              <th className="px-4 py-3 text-right">كود الدخول</th>
              <th className="px-4 py-3 text-right">الإجراءات</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                <td className="px-4 py-3 text-gray-600" dir="ltr">{s.phone}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    s.role === 'BARISTA' ? 'bg-amber-100 text-amber-700' : s.role === 'DRIVER' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'
                  }`}>{s.role}</span>
                </td>
                <td className="px-4 py-3 font-mono text-gray-600">{formatCurrency(s.salary)}</td>
                <td className="px-4 py-3 text-gray-600">
                  {s.salaryType === 'MONTHLY' ? 'شهري' : s.salaryType === 'DAILY' ? 'يومي' : 'بالساعة'}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {s.active ? 'نشط' : 'غير نشط'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <code className="rounded bg-gray-100 px-2 py-0.5 text-xs font-mono font-bold tracking-wider">{s.loginCode || '—'}</code>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(s); setForm({ name: s.name, phone: s.phone, role: s.role, salary: Number(s.salary), salaryType: s.salaryType || 'MONTHLY', hourlyWage: Number(s.hourlyWage ?? 0), active: s.active, loginCode: s.loginCode || '', password: '' }); setShowForm(true); }}
                      className="rounded p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors" title="تعديل">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => resetLoginCode(s.id)} disabled={generating === s.id}
                      className="rounded p-1.5 text-gray-500 hover:bg-violet-50 hover:text-violet-600 transition-colors disabled:opacity-50" title="تغيير كود الدخول">
                      {generating === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyIcon className="h-4 w-4" />}
                    </button>
                    <button onClick={() => setPassword(s.id)}
                      className="rounded p-1.5 text-gray-500 hover:bg-amber-50 hover:text-amber-600 transition-colors" title="تعيين كلمة سر">
                      <LockIcon className="h-4 w-4" />
                    </button>
                    <button onClick={() => toggleActive(s.id, s.active)}
                      className={`rounded p-1.5 transition-colors ${s.active ? 'text-gray-500 hover:bg-orange-50 hover:text-orange-600' : 'text-gray-500 hover:bg-green-50 hover:text-green-600'}`}
                      title={s.active ? 'تعطيل' : 'تفعيل'}>
                      {s.active ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button onClick={() => handleDelete(s.id)}
                      className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors" title="حذف">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleStats(s.id)}
                    className={`rounded p-1.5 transition-colors ${expandedStats[s.id] ? 'text-violet-600 bg-violet-50' : 'text-gray-400 hover:text-violet-600'}`}
                    title="إحصائيات">
                    {loadingStats === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">لا يوجد موظفين</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Expanded Stats */}
      {Object.entries(expandedStats).map(([id, stats]) => {
        const emp = staff.find((s) => s.id === id);
        if (!emp) return null;
        return (
          <div key={id} className="rounded-xl border bg-white p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-800">{emp.name} — الأداء</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs font-medium text-blue-600 mb-1">الطلبات المُنجزة</p>
                <p className="text-2xl font-bold text-blue-700">{stats.ordersHandled || 0}</p>
              </div>
              <div className="rounded-lg bg-green-50 p-3">
                <p className="text-xs font-medium text-green-600 mb-1">المبالغ المحصلة</p>
                <p className="text-2xl font-bold text-green-700">{formatCurrency(stats.moneyCollected || 0)}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <p className="text-xs font-medium text-amber-600 mb-1">الراتب اليومي</p>
                <p className="text-2xl font-bold text-amber-700">{formatCurrency(Number(emp.salary) / 30)}</p>
              </div>
              <div className="rounded-lg bg-violet-50 p-3">
                <p className="text-xs font-medium text-violet-600 mb-1">الأداء</p>
                <p className="text-2xl font-bold text-violet-700">{stats.performance ? `${stats.performance.overallScore?.toFixed(0) || 0}/100` : '—'}</p>
              </div>
            </div>
          </div>
        );
      })}
    </SectionCard>
  );
}

/* ───────────────────────── ANALYTICS SECTION ───────────────────────── */

function AnalyticsSection({ refreshKey }: { refreshKey: number }) {
  const [timeRange, setTimeRange] = useState('7d');
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [profitRanking, setProfitRanking] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const getDateRange = () => {
    const now = new Date();
    const from = new Date(now);
    if (timeRange === 'today') from.setHours(0, 0, 0, 0);
    else if (timeRange === '7d') from.setDate(now.getDate() - 7);
    else if (timeRange === '30d') from.setDate(now.getDate() - 30);
    else if (timeRange === '90d') from.setDate(now.getDate() - 90);
    else from.setFullYear(now.getFullYear() - 10);
    return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange();
    try {
      const [topRes, profitRes] = await Promise.all([
        api.get(`/analytics/sales/top-products?limit=10&from=${from}&to=${to}`).catch(() => ({ data: [] })),
        api.get(`/analytics/sales/product-profitability?from=${from}&to=${to}`).catch(() => ({ data: [] })),
      ]);
      setTopProducts(Array.isArray(topRes.data) ? topRes.data : []);
      setProfitRanking(Array.isArray(profitRes.data) ? profitRes.data : []);
    } catch { setTopProducts([]); setProfitRanking([]); }
    setLoading(false);
  }, [timeRange]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Sort profit ranking
  const mostProfitable = [...profitRanking].sort((a, b) => Number(b.marginPercent || 0) - Number(a.marginPercent || 0)).slice(0, 10);
  const leastProfitable = [...profitRanking].sort((a, b) => Number(a.marginPercent || 0) - Number(b.marginPercent || 0)).slice(0, 10);

  if (loading) return <Loader />;
  return (
    <SectionCard title="تحليلات المبيعات" subtitle="أفضل وأسوأ المنتجات أداءً مع هامش الربح">
      {/* Time Range Filter */}
      <div className="flex gap-2">
          {[
              { value: 'today', label: 'اليوم' },
              { value: '7d', label: 'آخر 7 أيام' },
              { value: '30d', label: 'آخر 30 يوم' },
              { value: '90d', label: 'آخر 90 يوم' },
              { value: 'all', label: 'كل الوقت' },
            ].map((opt) => (
          <button key={opt.value} onClick={() => setTimeRange(opt.value)}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              timeRange === opt.value
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Selling Products */}
        <div className="rounded-xl border bg-white">
          <div className="border-b bg-gradient-to-l from-emerald-50 to-white px-4 py-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <h4 className="text-sm font-bold text-gray-700">الأكثر مبيعاً</h4>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500">
                <th className="px-4 py-2 text-right">المنتج</th>
                <th className="px-4 py-2 text-right">التصنيف</th>
                <th className="px-4 py-2 text-right">الكمية</th>
                <th className="px-4 py-2 text-right">الإيرادات</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((p: any, idx: number) => (
                <tr key={p.productId || idx} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{p.name}</td>
                  <td className="px-4 py-2 text-gray-600">{p.category || '—'}</td>
                  <td className="px-4 py-2 font-mono text-gray-700">{p.quantity || 0}</td>
                  <td className="px-4 py-2 font-mono font-bold text-emerald-600">{formatCurrency(p.revenue || 0)}</td>
                </tr>
              ))}
              {topProducts.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">لا توجد بيانات مبيعات</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Least Selling Products */}
        <div className="rounded-xl border bg-white">
          <div className="border-b bg-gradient-to-l from-red-50 to-white px-4 py-3 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-600" />
            <h4 className="text-sm font-bold text-gray-700">الأقل مبيعاً</h4>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500">
                <th className="px-4 py-2 text-right">المنتج</th>
                <th className="px-4 py-2 text-right">التصنيف</th>
                <th className="px-4 py-2 text-right">الكمية</th>
                <th className="px-4 py-2 text-right">الإيرادات</th>
              </tr>
            </thead>
            <tbody>
              {[...topProducts].reverse().slice(0, 5).map((p: any, idx: number) => (
                <tr key={p.productId || idx} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{p.name}</td>
                  <td className="px-4 py-2 text-gray-600">{p.category || '—'}</td>
                  <td className="px-4 py-2 font-mono text-gray-700">{p.quantity || 0}</td>
                  <td className="px-4 py-2 font-mono font-bold text-red-600">{formatCurrency(p.revenue || 0)}</td>
                </tr>
              ))}
              {topProducts.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">لا توجد بيانات مبيعات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Profitability Ranking */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white">
          <div className="border-b bg-gradient-to-l from-green-50 to-white px-4 py-3">
            <h4 className="text-sm font-bold text-gray-700">الأعلى ربحية</h4>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500">
                <th className="px-4 py-2 text-right">المنتج</th>
                <th className="px-4 py-2 text-right">الكمية</th>
                <th className="px-4 py-2 text-right">الربح</th>
                <th className="px-4 py-2 text-right">الهامش</th>
              </tr>
            </thead>
            <tbody>
              {mostProfitable.map((p: any, idx: number) => (
                <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{p.name}</td>
                  <td className="px-4 py-2 text-gray-600">{p.quantity || 0}</td>
                  <td className="px-4 py-2 font-mono font-bold text-emerald-600">{formatCurrency(p.profit || 0)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(Number(p.marginPercent || 0), 100)}%` }} />
                      </div>
                      <span className="text-xs font-bold text-gray-700">{(p.marginPercent || 0).toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {mostProfitable.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">لا توجد بيانات</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border bg-white">
          <div className="border-b bg-gradient-to-l from-red-50 to-white px-4 py-3">
            <h4 className="text-sm font-bold text-gray-700">الأقل ربحية</h4>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500">
                <th className="px-4 py-2 text-right">المنتج</th>
                <th className="px-4 py-2 text-right">الكمية</th>
                <th className="px-4 py-2 text-right">الربح</th>
                <th className="px-4 py-2 text-right">الهامش</th>
              </tr>
            </thead>
            <tbody>
              {leastProfitable.map((p: any, idx: number) => (
                <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{p.name}</td>
                  <td className="px-4 py-2 text-gray-600">{p.quantity || 0}</td>
                  <td className="px-4 py-2 font-mono font-bold text-red-600">{formatCurrency(p.profit || 0)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(Math.max(Number(p.marginPercent || 0), 0), 100)}%` }} />
                      </div>
                      <span className="text-xs font-bold text-gray-700">{(p.marginPercent || 0).toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {leastProfitable.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">لا توجد بيانات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}

/* ───────────────────────── LOW STOCK SECTION ───────────────────────── */

function LowStockSection({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refillItem, setRefillItem] = useState<any | null>(null);
  const [refillForm, setRefillForm] = useState({ quantity: '1', cost: '', supplier: '', notes: '' });
  const [refilling, setRefilling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [lowRes, invRes] = await Promise.all([
        api.get('/inventory/low-stock'),
        api.get('/inventory'),
      ]);
      setItems(Array.isArray(lowRes.data) ? lowRes.data : []);
      setInventory(Array.isArray(invRes.data) ? invRes.data : []);
    } catch { setItems([]); setInventory([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleRefill = async () => {
    if (!refillItem || !refillForm.quantity) return;
    setRefilling(true);
    try {
      await api.post(`/inventory/${refillItem.id}/refill`, {
        quantity: Number(refillForm.quantity),
        cost: refillForm.cost ? Number(refillForm.cost) : undefined,
        supplier: refillForm.supplier || undefined,
        notes: refillForm.notes || undefined,
      });
      setRefillForm({ quantity: '1', cost: '', supplier: '', notes: '' });
      setRefillItem(null);
      load();
    } catch (err: any) { alert(err?.response?.data?.message || 'فشلت إعادة التخزين'); }
    setRefilling(false);
  };

  const normalItems = inventory.filter((i: any) => Number(i.currentQty) > Number(i.minThreshold));

  if (loading) return <Loader />;
  return (
    <SectionCard title="المخزون المنخفض" subtitle="مراقبة المخزون وإعادة التخزين">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-gray-500">منخفض/نافد</p>
          <p className="text-2xl font-bold text-red-600">{items.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-gray-500">طبيعي</p>
          <p className="text-2xl font-bold text-emerald-600">{normalItems.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-gray-500">إجمالي</p>
          <p className="text-2xl font-bold text-gray-800">{inventory.length}</p>
        </div>
      </div>

      {/* Low Stock Items */}
      {items.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50">
          <div className="border-b border-red-200 px-4 py-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h4 className="text-sm font-bold text-red-700">تنبيه: هذه الأصناف تحتاج إلى إعادة تخزين</h4>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-red-200 bg-red-100/50 text-xs font-semibold text-red-800">
                <th className="px-4 py-2 text-right">الصنف</th>
                <th className="px-4 py-2 text-right">الوحدة</th>
                <th className="px-4 py-2 text-right">المخزون الحالي</th>
                <th className="px-4 py-2 text-right">الحد الأدنى</th>
                <th className="px-4 py-2 text-right">الحالة</th>
                <th className="px-4 py-2 text-right">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => {
                const qty = Number(item.currentQty);
                const threshold = Number(item.minThreshold);
                const isOut = qty <= 0;
                return (
                  <tr key={item.id} className="border-b border-red-100 last:border-0 hover:bg-red-100/30">
                    <td className="px-4 py-3 font-medium text-gray-800">{item.itemName}</td>
                    <td className="px-4 py-3 text-gray-600">{item.unit}</td>
                    <td className="px-4 py-3">
                      <span className={`font-mono font-bold ${isOut ? 'text-red-600' : 'text-amber-600'}`}>{qty}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-600">{threshold}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isOut ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {isOut ? 'نافد' : 'منخفض'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setRefillItem(item); setRefillForm({ quantity: String(Math.max(threshold * 2, 10)), cost: '', supplier: '', notes: '' }); }}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors">
                        <Package className="h-3.5 w-3.5" /> إعادة تخزين
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {items.length === 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
          <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
          <p className="text-sm font-medium text-green-700">كل أصناف المخزون في المستوى الطبيعي</p>
        </div>
      )}

      {/* All Inventory Status */}
      <div className="rounded-xl border bg-white">
        <div className="border-b bg-gray-50 px-4 py-3">
          <h4 className="text-sm font-bold text-gray-700">جميع أصناف المخزون</h4>
        </div>
        <div className="divide-y">
          {inventory.map((item: any) => {
            const qty = Number(item.currentQty);
            const threshold = Number(item.minThreshold);
            const ratio = threshold > 0 ? (qty / threshold) * 100 : 100;
            const isLow = qty <= threshold;
            return (
              <div key={item.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{item.itemName}</p>
                    <p className="text-xs text-gray-500">{item.unit} · {formatCurrency(Number(item.costPerUnit))}/وحدة</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={`text-sm font-mono font-bold ${isLow ? 'text-red-600' : 'text-emerald-600'}`}>{qty}</p>
                    <p className="text-[10px] text-gray-400">الحد: {threshold}</p>
                  </div>
                  <div className="w-20">
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${isLow ? 'bg-red-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(ratio, 100)}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {inventory.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">لا توجد أصناف في المخزون</div>
          )}
        </div>
      </div>

      {/* Refill Modal */}
      {refillItem && (
        <Modal onClose={() => { setRefillItem(null); setRefillForm({ quantity: '1', cost: '', supplier: '', notes: '' }); }}>
          <h3 className="text-lg font-bold text-gray-800 mb-4">إعادة تخزين: {refillItem.itemName}</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">الكمية *</label>
              <input type="number" min="1" value={refillForm.quantity}
                onChange={(e) => setRefillForm({ ...refillForm, quantity: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">تكلفة الشراء</label>
              <input type="number" step="0.01" min="0" placeholder="0.00" value={refillForm.cost}
                onChange={(e) => setRefillForm({ ...refillForm, cost: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">المورد</label>
              <input type="text" placeholder="اسم المورد" value={refillForm.supplier}
                onChange={(e) => setRefillForm({ ...refillForm, supplier: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">ملاحظات</label>
              <textarea placeholder="ملاحظات..." value={refillForm.notes} rows={2}
                onChange={(e) => setRefillForm({ ...refillForm, notes: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
            </div>
            <button onClick={handleRefill} disabled={refilling || !refillForm.quantity}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {refilling ? 'جاري...' : 'تأكيد إعادة التخزين'}
            </button>
          </div>
        </Modal>
      )}
    </SectionCard>
  );
}

/* ───────────────────────── CONSUMPTIONS SECTION ───────────────────────── */

function ConsumptionsSection({ refreshKey }: { refreshKey: number }) {
  const [subTab, setSubTab] = useState<'consumption' | 'usage' | 'top'>('consumption');
  const [consumption, setConsumption] = useState<any[]>([]);
  const [usage, setUsage] = useState<any[]>([]);
  const [top, setTop] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [productFilter, setProductFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const f = dateRange.from || undefined;
      const t = dateRange.to || undefined;
      const [c, u, tp] = await Promise.all([
        fetchInventoryConsumption(f, t).catch(() => []),
        fetchIngredientUsage(f, t).catch(() => []),
        fetchMostConsumed(10, f, t).catch(() => []),
      ]);
      setConsumption(Array.isArray(c) ? c : []);
      setUsage(Array.isArray(u) ? u : []);
      setTop(Array.isArray(tp) ? tp : []);
    } catch { setConsumption([]); setUsage([]); setTop([]); }
    setLoading(false);
  }, [dateRange.from, dateRange.to]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const filteredConsumption = consumption.filter((r) => {
    if (!productFilter) return true;
    const q = productFilter.toLowerCase();
    return r.productName?.toLowerCase().includes(q) || r.inventory?.itemName?.toLowerCase().includes(q);
  });

  const totalConsumedCost = filteredConsumption.reduce((s, r) => s + Number(r.totalCost), 0);
  const totalConsumedQty = filteredConsumption.reduce((s, r) => s + Number(r.quantity), 0);

  return (
    <SectionCard title="المستهلكات" subtitle="تتبع استهلاك المخزون والمكونات">
      {/* Date Range + Product Filter */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">من</label>
          <input type="date" value={dateRange.from} onChange={(e) => setDateRange(p => ({ ...p, from: e.target.value }))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">إلى</label>
          <input type="date" value={dateRange.to} onChange={(e) => setDateRange(p => ({ ...p, to: e.target.value }))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-[10px] font-medium text-gray-500 mb-1">بحث</label>
          <input type="text" placeholder="منتج أو مكون..." value={productFilter} onChange={(e) => setProductFilter(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-gray-500">إجمالي استهلاك المخزون</p>
          <p className="text-2xl font-bold text-gray-800">{formatCurrency(totalConsumedCost)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-gray-500">إجمالي الكمية المستهلكة</p>
          <p className="text-2xl font-bold text-amber-600">{totalConsumedQty.toFixed(1)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-gray-500">عدد المكونات المستخدمة</p>
          <p className="text-2xl font-bold text-violet-600">{usage.length}</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2">
        {[
          { id: 'consumption' as const, label: '📦 سجل الاستهلاك', icon: Package },
          { id: 'usage' as const, label: '📊 استخدام المكونات', icon: BarChart3 },
          { id: 'top' as const, label: '📈 الأكثر استهلاكاً', icon: TrendingDown },
        ].map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              subTab === t.id ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {loading && <Loader />}

      {/* ── Consumption Log ── */}
      {!loading && subTab === 'consumption' && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="border-b bg-gray-50 px-4 py-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-violet-600" />
            <h4 className="text-sm font-bold text-gray-700">سجل استهلاك المخزون</h4>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b text-xs font-semibold text-gray-500">
                  <th className="px-4 py-2 text-right">التاريخ</th>
                  <th className="px-4 py-2 text-right">المكون</th>
                  <th className="px-4 py-2 text-right">المنتج</th>
                  <th className="px-4 py-2 text-right">الكمية</th>
                  <th className="px-4 py-2 text-right">التكلفة</th>
                </tr>
              </thead>
              <tbody>
                {filteredConsumption.map((r: any) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs text-gray-500">{new Date(r.createdAt).toLocaleString('ar-EG')}</td>
                    <td className="px-4 py-2">
                      <span className="font-medium">{r.inventory?.emoji || '📦'} {r.inventory?.itemName}</span>
                      {r.inventory?.code && <code className="mr-1 text-[10px] text-gray-400 font-mono">{r.inventory.code}</code>}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{r.productName}</td>
                    <td className="px-4 py-2 font-mono text-gray-700">{Number(r.quantity).toFixed(2)} {r.unit}</td>
                    <td className="px-4 py-2 font-mono font-bold text-rose-600">{formatCurrency(Number(r.totalCost))}</td>
                  </tr>
                ))}
                {filteredConsumption.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">لا توجد بيانات استهلاك</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Ingredient Usage ── */}
      {!loading && subTab === 'usage' && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="border-b bg-gray-50 px-4 py-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-amber-600" />
            <h4 className="text-sm font-bold text-gray-700">ملخص استخدام المكونات</h4>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500">
                <th className="px-4 py-2 text-right">#</th>
                <th className="px-4 py-2 text-right">المكون</th>
                <th className="px-4 py-2 text-right">الكمية الإجمالية</th>
                <th className="px-4 py-2 text-right">التكلفة الإجمالية</th>
                <th className="px-4 py-2 text-right">عدد المرات</th>
                <th className="px-4 py-2 text-right">% من التكلفة</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u: any, idx: number) => {
                const pct = totalConsumedCost > 0 ? (u.totalCost / totalConsumedCost) * 100 : 0;
                return (
                  <tr key={u.inventoryId} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-2">
                      <span>{u.emoji || '📦'} {u.itemName}</span>
                      {u.code && <code className="mr-1 text-[10px] text-gray-400 font-mono">{u.code}</code>}
                    </td>
                    <td className="px-4 py-2 font-mono text-gray-700">{u.totalQuantity.toFixed(2)} {u.unit}</td>
                    <td className="px-4 py-2 font-mono font-bold text-rose-600">{formatCurrency(u.totalCost)}</td>
                    <td className="px-4 py-2 font-mono text-gray-600">{u.count}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-xs font-bold text-gray-700">{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {usage.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">لا توجد بيانات استخدام</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Most Consumed ── */}
      {!loading && subTab === 'top' && (
        <div className="grid gap-4">
          <div className="rounded-xl border bg-white overflow-hidden">
            <div className="border-b bg-gradient-to-l from-red-50 to-white px-4 py-3 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              <h4 className="text-sm font-bold text-gray-700">أكثر 10 مكونات استهلاكاً</h4>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500">
                  <th className="px-4 py-2 text-right">#</th>
                  <th className="px-4 py-2 text-right">المكون</th>
                  <th className="px-4 py-2 text-right">الكمية</th>
                  <th className="px-4 py-2 text-right">التكلفة</th>
                  <th className="px-4 py-2 text-right">مرات الاستخدام</th>
                  <th className="px-4 py-2 text-right">الشريط</th>
                </tr>
              </thead>
              <tbody>
                {top.map((u: any, idx: number) => {
                  const maxQty = top.length > 0 ? Math.max(...top.map((x: any) => x.totalQuantity)) : 1;
                  const barPct = (u.totalQuantity / maxQty) * 100;
                  return (
                    <tr key={u.inventoryId} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-2">
                        <span>{u.emoji || '📦'} {u.itemName}</span>
                        {u.code && <code className="mr-1 text-[10px] text-gray-400 font-mono">{u.code}</code>}
                      </td>
                      <td className="px-4 py-2 font-mono font-bold text-gray-800">{u.totalQuantity.toFixed(1)} {u.unit}</td>
                      <td className="px-4 py-2 font-mono text-rose-600">{formatCurrency(u.totalCost)}</td>
                      <td className="px-4 py-2 font-mono text-gray-600">{u.count}</td>
                      <td className="px-4 py-2">
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full bg-red-500 transition-all" style={{ width: `${Math.min(barPct, 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {top.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">لا توجد بيانات</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/* ───────────────────────── SHARED COMPONENTS ───────────────────────── */

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <h2 className="text-lg font-bold text-gray-800">{title}</h2>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-violet-600" />
    </div>
  );
}

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md mx-4 rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Icons used above that aren't from lucide-react
function KeyIcon(props: any) { return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>; }
function LockIcon(props: any) { return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>; }


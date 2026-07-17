'use client';

import { useState, useEffect } from 'react';
import { fetchAllProducts, fetchRecipe, fetchSizes, fetchAddOns, fetchPackaging, fetchRecipeVersions, fetchCostSnapshots, setRecipe, setSizes, setAddOns, setPackaging, fetchInventory, recalculateProductCost } from '@/lib/api';
import { Search, Plus, Trash2, Save, History, Eye, X, ChevronDown, ChevronUp, Package, Ruler, Layers, Box, DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';

const UNIT_EMOJIS: Record<string, string> = {
  g: '⚖️', kg: '🏋️', ml: '🧪', L: '🫗',
  piece: '📦', packet: '📨', bottle: '🍾', can: '🥫',
};

const UNITS = ['g', 'kg', 'ml', 'L', 'piece', 'packet', 'bottle', 'can'];

const EMOJI_PICKER = ['🫘', '🥛', '🍬', '🥤', '🥄', '🫖', '💧', '🧊', '🍋', '🍯', '🧁', '🍫', '🥜', '🧂', '🌿', '☕', '🍵', '🧃', '🥥', '🍓'];

export default function RecipesPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('recipe');
  const [loading, setLoading] = useState(true);

  // Editor state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recipeIngredients, setRecipeIngredients] = useState<any[]>([]);
  const [sizes, setSizesState] = useState<any[]>([]);
  const [addOns, setAddOnsState] = useState<any[]>([]);
  const [packaging, setPackagingState] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [costSnapshots, setCostSnapshots] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [prods, inv] = await Promise.all([
        fetchAllProducts(true),
        fetchInventory(),
      ]);
      setProducts(prods);
      setInventory(inv);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function openEditor(productId: string) {
    setEditingId(productId);
    try {
      const [recipe, sz, add, pkg, vers, snaps] = await Promise.all([
        fetchRecipe(productId).catch(() => []),
        fetchSizes(productId).catch(() => []),
        fetchAddOns(productId).catch(() => []),
        fetchPackaging(productId).catch(() => []),
        fetchRecipeVersions(productId).catch(() => []),
        fetchCostSnapshots(productId).catch(() => []),
      ]);
      setRecipeIngredients(recipe);
      setSizesState(sz);
      setAddOnsState(add);
      setPackagingState(pkg);
      setVersions(vers);
      setCostSnapshots(snaps);
    } catch (e) { console.error(e); }
  }

  function closeEditor() {
    setEditingId(null);
    setActiveTab('recipe');
  }

  async function saveAll() {
    if (!editingId) return;
    setSaving(true);
    try {
      await setRecipe(editingId, recipeIngredients.map(r => ({
        inventoryId: r.inventoryId,
        quantity: Number(r.quantity),
        unit: r.unit || 'g',
        wastePercent: r.wastePercent ? Number(r.wastePercent) : 0,
        emoji: r.emoji || null,
        notes: r.notes || null,
      })));
      await setSizes(editingId, sizes.map(s => ({
        name: s.name, sortOrder: s.sortOrder ?? 0,
        priceAdjust: Number(s.priceAdjust ?? 0),
        costPercent: Number(s.costPercent ?? 100),
        active: s.active ?? true,
      })));
      await setAddOns(editingId, addOns.map(a => ({
        name: a.name, price: Number(a.price),
        inventoryId: a.inventoryId, quantity: Number(a.quantity),
        unit: a.unit || 'g', active: a.active ?? true, sortOrder: a.sortOrder ?? 0,
      })));
      await setPackaging(editingId, packaging.map(p => ({
        name: p.name, inventoryId: p.inventoryId,
        quantity: Number(p.quantity), unit: p.unit || 'piece',
      })));
      await recalculateProductCost(editingId);
      await loadData();
      await openEditor(editingId);
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  function addIngredient() {
    setRecipeIngredients([...recipeIngredients, {
      inventoryId: '', quantity: 0, unit: 'g', wastePercent: 0, emoji: '', notes: '',
    }]);
  }

  function updateIngredient(i: number, field: string, value: any) {
    const upd = [...recipeIngredients];
    upd[i] = { ...upd[i], [field]: value };
    if (field === 'inventoryId' && value) {
      const inv = inventory.find((x: any) => x.id === value);
      if (inv) {
        upd[i].unit = inv.unit || 'g';
        upd[i].emoji = upd[i].emoji || '🫘';
      }
    }
    setRecipeIngredients(upd);
  }

  function removeIngredient(i: number) {
    setRecipeIngredients(recipeIngredients.filter((_, idx) => idx !== i));
  }

  function addSize() {
    setSizesState([...sizes, { name: '', sortOrder: sizes.length, priceAdjust: 0, costPercent: 100, active: true }]);
  }

  function addAddOn() {
    setAddOnsState([...addOns, { name: '', price: 0, inventoryId: '', quantity: 0, unit: 'g', active: true, sortOrder: addOns.length }]);
  }

  function addPackaging() {
    setPackagingState([...packaging, { name: '', inventoryId: '', quantity: 1, unit: 'piece' }]);
  }

  const product = products.find((p: any) => p.id === editingId);
  const filtered = products.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const tabs = [
    { id: 'recipe', label: '🥘 المقادير', icon: Package },
    { id: 'sizes', label: '📏 المقاسات', icon: Ruler },
    { id: 'addons', label: '➕ الإضافات', icon: Layers },
    { id: 'packaging', label: '📦 التغليف', icon: Box },
    { id: 'versions', label: '📜 السجل', icon: History },
    { id: 'costs', label: '💰 التكاليف', icon: DollarSign },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-amber-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 lg:p-6 rtl" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-800">📖 كتاب الوصفات</h1>
        <div className="relative w-72">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text" placeholder="بحث عن منتج..." dir="rtl"
            className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {editingId && product ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-gradient-to-l from-amber-50 to-white">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{product.emoji || '☕'}</span>
              <div>
                <h2 className="text-lg font-black text-slate-800">{product.name}</h2>
                <p className="text-xs text-slate-500">{(Number(product.price)).toFixed(2)} ج.م | التكلفة: {(Number(product.cost)).toFixed(2)} ج.م</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={saveAll} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors text-sm font-bold disabled:opacity-50">
                <Save className="h-4 w-4" /> {saving ? 'جاري الحفظ...' : 'حفظ الكل'}
              </button>
              <button onClick={closeEditor}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
          </div>

          <div className="flex border-b border-slate-100 bg-slate-50 overflow-x-auto">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id ? 'border-amber-500 text-amber-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}>
                <tab.icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* RECIPE TAB */}
            {activeTab === 'recipe' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-bold text-slate-600">المقادير الأساسية</p>
                  <button onClick={addIngredient}
                    className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700 font-bold">
                    <Plus className="h-4 w-4" /> إضافة مكون
                  </button>
                </div>
                {recipeIngredients.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">لا توجد مقادير — أضف مكونات الوصفة</div>
                ) : (
                  recipeIngredients.map((ing, i) => {
                    const invItem = inventory.find((x: any) => x.id === ing.inventoryId);
                    const lineCost = invItem ? Number(ing.quantity) * Number(invItem.costPerUnit) * (1 + (Number(ing.wastePercent) || 0) / 100) : 0;
                    return (
                      <div key={i} className="flex items-center gap-2 p-3 rounded-xl border border-slate-100 bg-white hover:shadow-sm transition-shadow">
                        <div className="text-xl w-8 text-center">{ing.emoji || '🫘'}</div>
                        <select value={ing.inventoryId} onChange={e => updateIngredient(i, 'inventoryId', e.target.value)}
                          className="flex-1 min-w-[140px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white">
                          <option value="">اختر صنف...</option>
                          {inventory.map((inv: any) => (
                            <option key={inv.id} value={inv.id}>{inv.itemName}</option>
                          ))}
                        </select>
                        <input type="number" step="0.1" min="0" value={ing.quantity}
                          onChange={e => updateIngredient(i, 'quantity', e.target.value)}
                          className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-center" placeholder="الكمية" />
                        <select value={ing.unit} onChange={e => updateIngredient(i, 'unit', e.target.value)}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white w-20">
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <div className="relative group">
                          <input type="number" step="0.1" min="0" max="100" value={ing.wastePercent || 0}
                            onChange={e => updateIngredient(i, 'wastePercent', e.target.value)}
                            className="w-16 rounded-lg border border-slate-200 px-1 py-1.5 text-xs text-center" placeholder="هدر%" />
                          <span className="absolute -top-2 -right-2 text-[10px] bg-amber-100 text-amber-700 px-1 rounded">%</span>
                        </div>
                        <select value={ing.emoji || ''} onChange={e => updateIngredient(i, 'emoji', e.target.value)}
                          className="rounded-lg border border-slate-200 px-1 py-1.5 text-sm bg-white w-16">
                          <option value="">🫘</option>
                          {EMOJI_PICKER.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                        <div className="text-xs font-mono text-slate-600 w-20 text-left">
                          ≈ {lineCost.toFixed(2)} ج.م
                        </div>
                        <button onClick={() => removeIngredient(i)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })
                )}
                {recipeIngredients.length > 0 && (
                  <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
                    <p className="text-sm font-bold text-amber-800">
                      إجمالي تكلفة المكونات: ≈ {recipeIngredients.reduce((s, ing) => {
                        const inv = inventory.find((x: any) => x.id === ing.inventoryId);
                        return s + (inv ? Number(ing.quantity) * Number(inv.costPerUnit) * (1 + (Number(ing.wastePercent) || 0) / 100) : 0);
                      }, 0).toFixed(2)} ج.م
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* SIZES TAB */}
            {activeTab === 'sizes' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-bold text-slate-600">مقاسات المنتج (صغير/وسط/كبير)</p>
                  <button onClick={addSize}
                    className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700 font-bold">
                    <Plus className="h-4 w-4" /> إضافة مقاس
                  </button>
                </div>
                {sizes.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">لا توجد مقاسات — أضف مقاسات مختلفة</div>
                ) : (
                  sizes.map((sz, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white">
                      <input value={sz.name} onChange={e => {
                        const upd = [...sizes]; upd[i] = { ...upd[i], name: e.target.value }; setSizesState(upd);
                      }} className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" placeholder="اسم المقاس (صغير/وسط/كبير)" />
                      <div className="text-xs text-slate-500 whitespace-nowrap">+</div>
                      <input type="number" step="0.5" value={sz.priceAdjust || 0} onChange={e => {
                        const upd = [...sizes]; upd[i] = { ...upd[i], priceAdjust: Number(e.target.value) }; setSizesState(upd);
                      }} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-center" placeholder="الزيادة" />
                      <span className="text-xs text-slate-500">ج.م</span>
                      <div className="text-xs text-slate-500 whitespace-nowrap">تكلفة</div>
                      <input type="number" step="5" value={sz.costPercent || 100} onChange={e => {
                        const upd = [...sizes]; upd[i] = { ...upd[i], costPercent: Number(e.target.value) }; setSizesState(upd);
                      }} className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-center" />
                      <span className="text-xs text-slate-500">%</span>
                      <button onClick={() => {
                        const upd = [...sizes]; upd[i] = { ...upd[i], active: !upd[i].active }; setSizesState(upd);
                      }} className={`px-2 py-1 rounded-lg text-xs font-bold ${sz.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                        {sz.active ? 'نشط' : 'غير نشط'}
                      </button>
                      <button onClick={() => setSizesState(sizes.filter((_, idx) => idx !== i))}
                        className="p-1.5 text-red-400 hover:text-red-600 rounded-lg">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ADD-ONS TAB */}
            {activeTab === 'addons' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-bold text-slate-600">الإضافات والمكونات الإضافية</p>
                  <button onClick={addAddOn}
                    className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700 font-bold">
                    <Plus className="h-4 w-4" /> إضافة
                  </button>
                </div>
                {addOns.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">لا توجد إضافات</div>
                ) : (
                  addOns.map((ao, i) => {
                    const invItem = inventory.find((x: any) => x.id === ao.inventoryId);
                    return (
                      <div key={i} className="flex items-center gap-2 p-3 rounded-xl border border-slate-100 bg-white">
                        <input value={ao.name} onChange={e => {
                          const upd = [...addOns]; upd[i] = { ...upd[i], name: e.target.value }; setAddOnsState(upd);
                        }} className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" placeholder="الاسم" />
                        <select value={ao.inventoryId} onChange={e => {
                          const upd = [...addOns]; upd[i] = { ...upd[i], inventoryId: e.target.value }; setAddOnsState(upd);
                        }} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white">
                          <option value="">اختر...</option>
                          {inventory.map((inv: any) => (
                            <option key={inv.id} value={inv.id}>{inv.itemName}</option>
                          ))}
                        </select>
                        <input type="number" step="0.1" min="0" value={ao.quantity}
                          onChange={e => { const upd = [...addOns]; upd[i] = { ...upd[i], quantity: Number(e.target.value) }; setAddOnsState(upd); }}
                          className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-center" />
                        <select value={ao.unit || 'g'} onChange={e => {
                          const upd = [...addOns]; upd[i] = { ...upd[i], unit: e.target.value }; setAddOnsState(upd);
                        }} className="rounded-lg border border-slate-200 px-1 py-1.5 text-sm bg-white w-16">
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <div className="text-xs text-slate-500">بـ</div>
                        <input type="number" step="0.5" min="0" value={ao.price}
                          onChange={e => { const upd = [...addOns]; upd[i] = { ...upd[i], price: Number(e.target.value) }; setAddOnsState(upd); }}
                          className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-center" />
                        <span className="text-xs text-slate-500">ج.م</span>
                        {invItem && <span className="text-[10px] text-slate-400">{invItem.itemName}</span>}
                        <button onClick={() => setAddOnsState(addOns.filter((_, idx) => idx !== i))}
                          className="p-1.5 text-red-400 hover:text-red-600 rounded-lg">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* PACKAGING TAB */}
            {activeTab === 'packaging' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-bold text-slate-600">مواد التغليف</p>
                  <button onClick={addPackaging}
                    className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700 font-bold">
                    <Plus className="h-4 w-4" /> إضافة
                  </button>
                </div>
                {packaging.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">لا توجد مواد تغليف</div>
                ) : (
                  packaging.map((pkg, i) => {
                    const invItem = inventory.find((x: any) => x.id === pkg.inventoryId);
                    const pkgCost = invItem ? Number(pkg.quantity) * Number(invItem.costPerUnit) : 0;
                    return (
                      <div key={i} className="flex items-center gap-2 p-3 rounded-xl border border-slate-100 bg-white">
                        <input value={pkg.name} onChange={e => {
                          const upd = [...packaging]; upd[i] = { ...upd[i], name: e.target.value }; setPackagingState(upd);
                        }} className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" placeholder="الاسم" />
                        <select value={pkg.inventoryId} onChange={e => {
                          const upd = [...packaging]; upd[i] = { ...upd[i], inventoryId: e.target.value }; setPackagingState(upd);
                        }} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white">
                          <option value="">اختر...</option>
                          {inventory.map((inv: any) => (
                            <option key={inv.id} value={inv.id}>{inv.itemName}</option>
                          ))}
                        </select>
                        <input type="number" step="0.1" min="0" value={pkg.quantity}
                          onChange={e => { const upd = [...packaging]; upd[i] = { ...upd[i], quantity: Number(e.target.value) }; setPackagingState(upd); }}
                          className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-center" />
                        <select value={pkg.unit || 'piece'} onChange={e => {
                          const upd = [...packaging]; upd[i] = { ...upd[i], unit: e.target.value }; setPackagingState(upd);
                        }} className="rounded-lg border border-slate-200 px-1 py-1.5 text-sm bg-white w-16">
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <span className="text-xs font-mono text-slate-600">≈ {pkgCost.toFixed(2)} ج.م</span>
                        <button onClick={() => setPackagingState(packaging.filter((_, idx) => idx !== i))}
                          className="p-1.5 text-red-400 hover:text-red-600 rounded-lg">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* VERSIONS TAB */}
            {activeTab === 'versions' && (
              <div className="space-y-3">
                <p className="text-sm font-bold text-slate-600 mb-4">سجل إصدارات الوصفة</p>
                {versions.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">لا يوجد سجل إصدارات بعد — احفظ الوصفة لتسجيل إصدار</div>
                ) : (
                  versions.map((v: any) => {
                    const snapshot = typeof v.snapshot === 'string' ? JSON.parse(v.snapshot) : v.snapshot;
                    const items = Array.isArray(snapshot) ? snapshot : [];
                    return (
                      <div key={v.id} className="p-4 rounded-xl border border-slate-200 bg-white">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-black text-amber-700">الإصدار #{v.versionNumber}</span>
                          <span className="text-xs text-slate-400">{new Date(v.createdAt).toLocaleDateString('ar-EG', { dateStyle: 'medium' })}</span>
                        </div>
                        <div className="text-xs text-slate-500 mb-2">التكلفة: {Number(v.totalCost).toFixed(2)} ج.م</div>
                        <div className="grid grid-cols-2 gap-1">
                          {items.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-1 text-xs text-slate-600">
                              <span>{item.emoji || '🫘'}</span>
                              <span>{item.inventory?.itemName || 'مكون'}</span>
                              <span className="font-mono">{Number(item.quantity).toFixed(1)}{item.unit}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* COST SNAPSHOTS TAB */}
            {activeTab === 'costs' && (
              <div className="space-y-3">
                <p className="text-sm font-bold text-slate-600 mb-2">تقدير التكلفة والربحية</p>
                {(() => {
                  const ingCost = recipeIngredients.reduce((s, ing) => {
                    const inv = inventory.find((x: any) => x.id === ing.inventoryId);
                    return s + (inv ? Number(ing.quantity) * Number(inv.costPerUnit) * (1 + (Number(ing.wastePercent) || 0) / 100) : 0);
                  }, 0);
                  const pkgCost = packaging.reduce((s, pkg) => {
                    const inv = inventory.find((x: any) => x.id === pkg.inventoryId);
                    return s + (inv ? Number(pkg.quantity) * Number(inv.costPerUnit) : 0);
                  }, 0);
                  const totalCost = ingCost + pkgCost;
                  const sellPrice = product ? Number(product.price) : 0;
                  const profit = sellPrice - totalCost;
                  const margin = sellPrice > 0 ? (profit / sellPrice) * 100 : 0;
                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <p className="text-xs text-slate-500">تكلفة المكونات</p>
                          <p className="text-lg font-black text-slate-800 font-mono">{ingCost.toFixed(2)} ج.م</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <p className="text-xs text-slate-500">تكلفة التغليف</p>
                          <p className="text-lg font-black text-slate-800 font-mono">{pkgCost.toFixed(2)} ج.م</p>
                        </div>
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                          <p className="text-xs text-amber-600">إجمالي التكلفة</p>
                          <p className="text-lg font-black text-amber-800 font-mono">{totalCost.toFixed(2)} ج.م</p>
                        </div>
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                          <p className="text-xs text-emerald-600">الربح المتوقع</p>
                          <p className="text-lg font-black text-emerald-800 font-mono">
                            {profit.toFixed(2)} ج.م
                            <span className={`text-xs mr-2 ${margin >= 30 ? 'text-emerald-600' : margin >= 15 ? 'text-amber-600' : 'text-red-600'}`}>
                              ({margin.toFixed(1)}%)
                            </span>
                          </p>
                        </div>
                      </div>
                      {margin < 15 && (
                        <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-red-500" />
                          <span className="text-sm text-red-700">هامش الربح منخفض جداً — راجع تكاليف المكونات أو أعد تسعير المنتج</span>
                        </div>
                      )}
                      {margin >= 30 && (
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-emerald-500" />
                          <span className="text-sm text-emerald-700">ربحية ممتازة! 🎉</span>
                        </div>
                      )}
                      {sizes.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs font-bold text-slate-500 mb-2">تقدير التكلفة حسب المقاس:</p>
                          <div className="grid grid-cols-2 gap-2">
                            {sizes.filter((s: any) => s.active).map((sz: any) => {
                              const szCost = totalCost * (Number(sz.costPercent || 100) / 100);
                              const szPrice = sellPrice + Number(sz.priceAdjust || 0);
                              const szProfit = szPrice - szCost;
                              const szMargin = szPrice > 0 ? (szProfit / szPrice) * 100 : 0;
                              return (
                                <div key={sz.name} className="p-2 rounded-lg border border-slate-100 bg-white">
                                  <p className="text-xs font-bold text-slate-700">{sz.name}</p>
                                  <p className="text-xs font-mono">التكلفة: {szCost.toFixed(2)} ج.م</p>
                                  <p className="text-xs font-mono">السعر: {szPrice.toFixed(2)} ج.م</p>
                                  <p className={`text-xs font-bold ${szMargin >= 30 ? 'text-emerald-600' : szMargin >= 15 ? 'text-amber-600' : 'text-red-600'}`}>
                                    الهامش: {szMargin.toFixed(1)}%
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {costSnapshots.length > 0 && (
                        <div className="mt-6">
                          <p className="text-xs font-bold text-slate-500 mb-2">سجل التكاليف (الـ {costSnapshots.length} الأخيرة):</p>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {costSnapshots.map((cs: any) => (
                              <div key={cs.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50">
                                <span className="text-slate-500">{new Date(cs.createdAt).toLocaleDateString('ar-EG', { dateStyle: 'short' })}</span>
                                <span className="font-mono">المكونات: {Number(cs.ingredientCost).toFixed(2)}</span>
                                <span className="font-mono">التغليف: {Number(cs.packagingCost).toFixed(2)}</span>
                                <span className="font-mono font-bold">الإجمالي: {Number(cs.totalCost).toFixed(2)}</span>
                                <span className="font-mono text-emerald-600">السعر: {Number(cs.sellingPrice).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* PRODUCT LIST - Visual Recipe Cards */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((prod: any) => {
            const recipe = prod.recipe || [];
            const totalCost = recipe.reduce((s: number, r: any) => s + Number(r.quantity || 0) * Number(r.inventory?.costPerUnit || 0), 0);
            const margin = Number(prod.price) > 0 ? ((Number(prod.price) - totalCost) / Number(prod.price)) * 100 : 0;
            return (
              <div key={prod.id}
                onClick={() => openEditor(prod.id)}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden group">
                <div className="p-4 border-b border-slate-100">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">{prod.emoji || '☕'}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-black text-slate-800 truncate">{prod.name}</h3>
                      <p className="text-xs text-slate-400">{prod.categoryRel?.name || prod.category || 'عام'}</p>
                    </div>
                    <div className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                      margin >= 30 ? 'bg-emerald-100 text-emerald-700' :
                      margin >= 15 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {margin.toFixed(0)}%
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="font-mono">💰 {Number(prod.price).toFixed(2)} ج.م</span>
                    <span className="font-mono">⚙️ {totalCost.toFixed(2)} ج.م</span>
                  </div>
                </div>
                <div className="p-4">
                  {recipe.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">لا توجد وصفة — انقر لإضافة المكونات</p>
                  ) : (
                    <div className="space-y-1.5">
                      {recipe.slice(0, 5).map((ing: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <span className="w-5 text-center">{ing.emoji || '🫘'}</span>
                          <span className="flex-1 text-slate-700 truncate">{ing.inventory?.itemName || 'مكون'}</span>
                          <span className="font-mono text-slate-500 whitespace-nowrap">
                            {Number(ing.quantity).toFixed(1)}{ing.unit}
                            {Number(ing.wastePercent || 0) > 0 && (
                              <span className="text-amber-500 mr-1" title={`نسبة هدر ${ing.wastePercent}%`}>+{ing.wastePercent}%</span>
                            )}
                          </span>
                        </div>
                      ))}
                      {recipe.length > 5 && (
                        <p className="text-xs text-amber-600 text-center pt-1">+{recipe.length - 5} مكونات أخرى...</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-400">{recipe.length} مكونات</span>
                  <span className="text-xs text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity font-bold">تعديل الوصفة ←</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

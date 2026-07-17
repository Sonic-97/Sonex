'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  Coffee, Tags, Plus, Search, Edit2, Trash2, 
  ChevronLeft, Beaker, Package, Calculator, Droplet, 
  AlertTriangle, DollarSign, X, Check, Save, TrendingUp, Loader2
} from 'lucide-react';
import { fetchAllProducts, fetchCategories, fetchInventory, setRecipe, createProduct } from '@/lib/api';

// --- Types ---
type Unit = 'g' | 'kg' | 'ml' | 'L' | 'Piece' | 'Packet' | 'Bottle';

interface Category {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

interface InventoryItem {
  id: string;
  name: string;
  emoji: string;
  costPerUnit: number;
  baseUnit: Unit;
  currentStock: number;
  minThreshold: number;
}

interface RecipeIngredient {
  id: string;
  inventoryId: string;
  quantity: number;
  unit: Unit;
  wastePercent: number;
}

interface Product {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  emoji: string;
  recipe: RecipeIngredient[];
}

const UNITS: Unit[] = ['g', 'kg', 'ml', 'L', 'Piece', 'Packet', 'Bottle'];
const COLORS = ['#8C6239', '#3B82F6', '#F59E0B', '#EC4899', '#EF4444', '#06B6D4', '#10B981', '#8B5CF6'];
const EMOJIS: Record<string, string> = {};

export default function MenuManagement() {
  const [activeTab, setActiveTab] = useState<'products' | 'categories'>('products');
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', price: 0, categoryId: '', emoji: '📦' });
  const [newRecipe, setNewRecipe] = useState<RecipeIngredient[]>([]);
  
  const selectedProduct = useMemo(() => products.find(p => p.id === selectedProductId), [products, selectedProductId]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [apiProducts, apiCategories, apiInventory] = await Promise.all([
          fetchAllProducts(true),
          fetchCategories(true),
          fetchInventory(),
        ]);
        setProducts((apiProducts || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          categoryId: p.categoryId,
          price: Number(p.cafePrice || p.price || 0),
          emoji: p.emoji || '📦',
          recipe: (p.recipe || []).map((r: any) => ({
            id: r.id,
            inventoryId: r.inventoryId,
            quantity: Number(r.quantity),
            unit: r.unit || 'g',
            wastePercent: r.wastePercent || 0,
          })),
        })));
        setCategories((apiCategories || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          emoji: c.icon || '📁',
          color: c.color || '#8C6239',
        })));
        setInventory((apiInventory || []).map((i: any) => ({
          id: i.id,
          name: i.itemName,
          emoji: i.emoji || '📦',
          costPerUnit: Number(i.costPerUnit || 0),
          baseUnit: i.unit || 'g',
          currentStock: Number(i.currentQty || 0),
          minThreshold: Number(i.minThreshold || 0),
        })));
      } catch (e) {
        console.error('Failed to load data', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // --- Helpers for Calculation ---
  const convertToBaseQty = (qty: number, unit: Unit, baseUnit: Unit) => {
    if (unit === baseUnit) return qty;
    if (unit === 'kg' && baseUnit === 'g') return qty * 1000;
    if (unit === 'g' && baseUnit === 'kg') return qty / 1000;
    if (unit === 'L' && baseUnit === 'ml') return qty * 1000;
    if (unit === 'ml' && baseUnit === 'L') return qty / 1000;
    return qty;
  };

  const calculateIngredientCost = (ing: RecipeIngredient) => {
    const inv = inventory.find(i => i.id === ing.inventoryId);
    if (!inv) return 0;
    const baseQty = convertToBaseQty(ing.quantity, ing.unit, inv.baseUnit);
    const cost = baseQty * inv.costPerUnit;
    const wasteCost = cost * (ing.wastePercent / 100);
    return cost + wasteCost;
  };

  const estimatedCost = useMemo(() => {
    if (!selectedProduct) return 0;
    return selectedProduct.recipe.reduce((total, ing) => total + calculateIngredientCost(ing), 0);
  }, [selectedProduct, inventory]);

  const profitMargin = useMemo(() => {
    if (!selectedProduct || selectedProduct.price === 0) return 0;
    return ((selectedProduct.price - estimatedCost) / selectedProduct.price) * 100;
  }, [selectedProduct, estimatedCost]);

  // --- Handlers ---
  const handleUpdateRecipe = (ingId: string, field: keyof RecipeIngredient, value: any) => {
    if (!selectedProduct) return;
    const updatedRecipe = selectedProduct.recipe.map(ing => 
      ing.id === ingId ? { ...ing, [field]: value } : ing
    );
    setProducts(products.map(p => p.id === selectedProduct.id ? { ...p, recipe: updatedRecipe } : p));
  };

  const handleAddIngredient = (invId: string) => {
    if (!selectedProduct) return;
    const inv = inventory.find(i => i.id === invId);
    if (!inv) return;
    
    const newIng: RecipeIngredient = {
      id: `r_${Date.now()}`,
      inventoryId: invId,
      quantity: 1,
      unit: inv.baseUnit,
      wastePercent: 0
    };
    
    setProducts(products.map(p => p.id === selectedProduct.id ? { ...p, recipe: [...p.recipe, newIng] } : p));
  };

  const handleRemoveIngredient = (ingId: string) => {
    if (!selectedProduct) return;
    setProducts(products.map(p => p.id === selectedProduct.id ? { ...p, recipe: p.recipe.filter(r => r.id !== ingId) } : p));
  };

  const handleSaveRecipe = async () => {
    if (!selectedProduct) return;
    setSaving(true);
    try {
      await setRecipe(selectedProduct.id, selectedProduct.recipe.map(r => ({
        inventoryId: r.inventoryId,
        quantity: r.quantity,
        unit: r.unit,
        wastePercent: r.wastePercent,
      })));
    } catch (e) {
      console.error('Failed to save recipe', e);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAddForm = () => {
    setNewProduct({ name: '', price: 0, categoryId: categories[0]?.id || '', emoji: '📦' });
    setNewRecipe([]);
    setShowAddForm(true);
  };

  const handleAddProduct = async () => {
    if (!newProduct.name.trim()) return;
    setSaving(true);
    try {
      const created = await createProduct({
        name: newProduct.name,
        categoryId: newProduct.categoryId || undefined,
        price: newProduct.price,
        cafePrice: newProduct.price,
      });
      if (newRecipe.length > 0) {
        await setRecipe(created.id, newRecipe.map(r => ({
          inventoryId: r.inventoryId,
          quantity: r.quantity,
          unit: r.unit,
          wastePercent: r.wastePercent,
        })));
      }
      setShowAddForm(false);
      window.location.reload();
    } catch (e) {
      console.error('Failed to create product', e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full bg-[#FDFBF7] items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-[#8C6239]" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#FDFBF7] text-slate-900 font-sans overflow-hidden" dir="rtl">
      
      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-8 py-6 shrink-0 flex justify-between items-center z-10 shadow-sm">
          <div>
            <h1 className="text-3xl font-black text-[#1E1513] tracking-tight">إدارة المنيو والوصفات</h1>
            <p className="text-slate-500 font-medium mt-1">التحكم الكامل بالتصنيفات، المنتجات، وهندسة الوصفات والمخزون.</p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button 
              onClick={() => setActiveTab('products')}
              className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'products' ? 'bg-white text-[#8C6239] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Coffee className="w-4 h-4" /> المنتجات والوصفات
            </button>
            <button 
              onClick={() => setActiveTab('categories')}
              className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'categories' ? 'bg-white text-[#8C6239] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Tags className="w-4 h-4" /> إدارة التصنيفات
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          
          {/* TAB: CATEGORIES */}
          {activeTab === 'categories' && (
            <div className="max-w-6xl mx-auto">
              <div className="flex justify-between items-center mb-8">
                <div className="relative w-96">
                  <Search className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="البحث في التصنيفات..." className="w-full bg-white border border-slate-200 rounded-2xl py-3 pr-11 pl-4 font-bold text-slate-700 focus:ring-2 focus:ring-[#8C6239]/20 focus:border-[#8C6239] outline-none shadow-sm transition-all" />
                </div>
                <button className="bg-[#1E1513] text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-[#322420] transition-colors shadow-md">
                  <Plus className="w-5 h-5" /> تصنيف جديد
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {categories.map(cat => (
                  <div key={cat.id} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-lg transition-all group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-2 h-full" style={{ backgroundColor: cat.color }}></div>
                    <div className="flex justify-between items-start mb-4 pr-3">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-sm" style={{ backgroundColor: `${cat.color}15`, color: cat.color }}>
                        {cat.emoji}
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                        <button className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <h3 className="text-xl font-black text-slate-800 pr-3">{cat.name}</h3>
                    <div className="mt-4 flex items-center gap-2 pr-3">
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-lg">
                        {products.filter(p => p.categoryId === cat.id).length} منتجات مرتبطة
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: PRODUCTS */}
          {activeTab === 'products' && (
            <div className="max-w-6xl mx-auto flex gap-8">
              
              <div className="flex-1">
                <div className="flex justify-between items-center mb-8">
                  <div className="relative w-96">
                    <Search className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="البحث في المنتجات..." 
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-2xl py-3 pr-11 pl-4 font-bold text-slate-700 focus:ring-2 focus:ring-[#8C6239]/20 focus:border-[#8C6239] outline-none shadow-sm transition-all" 
                    />
                  </div>
                  <button onClick={handleOpenAddForm} className="bg-[#1E1513] text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-[#322420] transition-colors shadow-md">
                    <Plus className="w-5 h-5" /> إضافة منتج
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {products.filter(p => p.name.includes(search)).map(product => {
                    const cat = categories.find(c => c.id === product.categoryId);
                    const hasLowStock = product.recipe.some(r => {
                      const inv = inventory.find(i => i.id === r.inventoryId);
                      return inv && inv.currentStock <= inv.minThreshold;
                    });

                    return (
                      <div 
                        key={product.id} 
                        onClick={() => setSelectedProductId(product.id)}
                        className={`bg-white rounded-3xl p-5 border-2 shadow-sm hover:shadow-lg transition-all cursor-pointer relative overflow-hidden group ${
                          selectedProductId === product.id ? 'border-[#8C6239] ring-4 ring-[#8C6239]/10' : 'border-slate-200 hover:border-[#8C6239]/50'
                        }`}
                      >
                        {hasLowStock && (
                          <div className="absolute top-4 left-4 bg-rose-100 text-rose-600 p-1.5 rounded-lg animate-pulse" title="يوجد نقص في مكونات هذه الوصفة">
                            <AlertTriangle className="w-4 h-4" />
                          </div>
                        )}
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-inner bg-slate-50">
                            {product.emoji}
                          </div>
                          <div>
                            <h3 className="font-black text-lg text-slate-800">{product.name}</h3>
                            <span className="text-xs font-bold px-2 py-1 rounded-md" style={{ backgroundColor: `${cat?.color}15`, color: cat?.color }}>
                              {cat?.name}
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                          <div className="font-bold text-slate-500 flex items-center gap-1.5 text-sm">
                            <Beaker className="w-4 h-4" /> {product.recipe.length} مكونات
                          </div>
                          <div className="font-black text-lg text-[#1E1513]">{product.price.toFixed(2)} ر.س</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* ── DRAWER: RECIPE ENGINE ── */}
      {activeTab === 'products' && (
        <div 
          className={`fixed inset-y-0 left-0 w-[500px] bg-white shadow-[-20px_0_40px_rgba(0,0,0,0.1)] border-r border-slate-200 z-50 transition-transform duration-500 ease-in-out flex flex-col ${
            selectedProductId ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {selectedProduct && (
            <>
              {/* Drawer Header */}
              <div className="p-6 border-b border-slate-200 flex justify-between items-start bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-3xl border border-slate-100">
                    {selectedProduct.emoji}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-[#1E1513]">{selectedProduct.name}</h2>
                    <p className="text-sm font-bold text-slate-500 flex items-center gap-2 mt-1">
                      محرك هندسة الوصفة <ChevronLeft className="w-3 h-3" /> سعر البيع: {selectedProduct.price} ر.س
                    </p>
                  </div>
                </div>
                <button onClick={() => setSelectedProductId(null)} className="p-2 bg-white text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-xl border border-slate-200 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-[#FDFBF7]">
                
                {/* Analytics & Rules Panel */}
                <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
                  <h3 className="font-black text-slate-800 flex items-center gap-2 mb-4">
                    <Calculator className="w-5 h-5 text-[#8C6239]" /> التحليلات والمبيعات
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                      <div className="text-xs font-bold text-slate-500 mb-1">التكلفة التقديرية (بناءً على المكونات)</div>
                      <div className="text-xl font-black text-rose-600">{estimatedCost.toFixed(2)} ر.س</div>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                      <div className="text-xs font-bold text-slate-500 mb-1">هامش الربح (Profit Margin)</div>
                      <div className={`text-xl font-black flex items-center gap-1 ${profitMargin < 40 ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {profitMargin.toFixed(1)}%
                        {profitMargin < 40 && <AlertTriangle className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ingredients List */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-black text-slate-800 flex items-center gap-2">
                      <Beaker className="w-5 h-5 text-[#8C6239]" /> مكونات الوصفة الحية
                    </h3>
                    <div className="relative group">
                      <button className="text-sm font-bold bg-[#8C6239]/10 text-[#8C6239] px-3 py-1.5 rounded-lg hover:bg-[#8C6239]/20 transition-colors flex items-center gap-1">
                        <Plus className="w-4 h-4" /> إضافة مكون
                      </button>
                      <div className="absolute left-0 top-full mt-2 w-64 bg-white border border-slate-200 shadow-xl rounded-2xl p-2 hidden group-hover:block z-20">
                        <div className="text-xs font-bold text-slate-400 px-3 py-2">اختر من المخزون:</div>
                        <div className="max-h-60 overflow-y-auto space-y-1">
                          {inventory.filter(inv => !selectedProduct.recipe.some(r => r.inventoryId === inv.id)).map(inv => (
                            <button key={inv.id} onClick={() => handleAddIngredient(inv.id)} className="w-full text-right flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl transition-colors">
                              <span className="text-xl">{inv.emoji}</span>
                              <div>
                                <div className="font-bold text-sm text-slate-800">{inv.name}</div>
                                <div className="text-[10px] text-slate-400">تكلفة: {inv.costPerUnit} ر.س / {inv.baseUnit}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selectedProduct.recipe.length === 0 ? (
                      <div className="text-center py-10 bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
                        لا توجد مكونات، هذا المنتج لن يخصم من المخزون
                      </div>
                    ) : (
                      selectedProduct.recipe.map(ing => {
                        const inv = inventory.find(i => i.id === ing.inventoryId);
                        if (!inv) return null;
                        
                        const isLowStock = inv.currentStock <= inv.minThreshold;
                        const ingCost = calculateIngredientCost(ing);

                        return (
                          <div key={ing.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                            {isLowStock && (
                              <div className="absolute top-0 right-0 w-1 h-full bg-rose-500"></div>
                            )}
                            
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex items-center gap-3">
                                <div className="text-2xl bg-slate-50 w-10 h-10 flex items-center justify-center rounded-xl border border-slate-100">
                                  {inv.emoji}
                                </div>
                                <div>
                                  <div className="font-bold text-slate-800">{inv.name}</div>
                                  <div className={`text-[10px] font-bold flex items-center gap-1 ${isLowStock ? 'text-rose-500' : 'text-slate-400'}`}>
                                    <Package className="w-3 h-3" /> المخزون: {inv.currentStock} {inv.baseUnit}
                                  </div>
                                </div>
                              </div>
                              <button onClick={() => handleRemoveIngredient(ing.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                              <div className="flex-1 flex flex-col">
                                <span className="text-[10px] font-bold text-slate-400 mb-1 px-1">الكمية</span>
                                <input 
                                  type="number" 
                                  value={ing.quantity}
                                  onChange={(e) => handleUpdateRecipe(ing.id, 'quantity', Number(e.target.value))}
                                  className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-center focus:border-[#8C6239] outline-none" 
                                />
                              </div>
                              <div className="flex-1 flex flex-col">
                                <span className="text-[10px] font-bold text-slate-400 mb-1 px-1">الوحدة</span>
                                <select 
                                  value={ing.unit}
                                  onChange={(e) => handleUpdateRecipe(ing.id, 'unit', e.target.value as Unit)}
                                  className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-bold focus:border-[#8C6239] outline-none"
                                >
                                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                              </div>
                              <div className="flex-1 flex flex-col">
                                <span className="text-[10px] font-bold text-slate-400 mb-1 px-1">نسبة الهدر</span>
                                <div className="relative">
                                  <input 
                                    type="number" 
                                    value={ing.wastePercent}
                                    onChange={(e) => handleUpdateRecipe(ing.id, 'wastePercent', Number(e.target.value))}
                                    className="w-full bg-white border border-slate-200 rounded-lg py-1.5 pl-5 pr-2 text-sm font-black text-center focus:border-[#8C6239] outline-none text-rose-500" 
                                  />
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-rose-500">%</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="mt-2 text-left">
                              <span className="text-xs font-bold bg-[#8C6239]/10 text-[#8C6239] px-2 py-1 rounded-md">
                                التكلفة: {ingCost.toFixed(3)} ر.س
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>
              
              {/* Drawer Footer */}
              <div className="p-6 border-t border-slate-200 bg-white shrink-0 flex gap-4 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
                <button onClick={handleSaveRecipe} disabled={saving} className="flex-1 bg-[#1E1513] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#322420] transition-colors shadow-lg disabled:opacity-50">
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} حفظ إعدادات الوصفة
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ADD PRODUCT MODAL ── */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-[#1E1513]/20 backdrop-blur-sm" onClick={() => setShowAddForm(false)}></div>
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-xl font-black text-[#1E1513]">إضافة منتج جديد</h2>
              <button onClick={() => setShowAddForm(false)} className="p-2 text-slate-400 hover:text-slate-700 rounded-xl border border-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">الاسم *</label>
                <input type="text" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl py-2.5 px-4 font-bold text-slate-800 focus:border-[#8C6239] outline-none" />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">سعر البيع للعميل *</label>
                <div className="relative">
                  <input type="number" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-xl py-2.5 px-4 font-bold text-slate-800 focus:border-[#8C6239] outline-none" />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">ج.م</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">القسم</label>
                <select value={newProduct.categoryId} onChange={(e) => setNewProduct({ ...newProduct, categoryId: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl py-2.5 px-4 font-bold text-slate-800 focus:border-[#8C6239] outline-none">
                  {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-bold text-slate-700">المكونات (الوصفة)</label>
                  <div className="relative group">
                    <button className="text-xs font-bold bg-[#8C6239]/10 text-[#8C6239] px-3 py-1.5 rounded-lg hover:bg-[#8C6239]/20 transition-colors flex items-center gap-1">
                      <Plus className="w-3 h-3" /> إضافة مكون
                    </button>
                    <div className="absolute left-0 top-full mt-2 w-64 bg-white border border-slate-200 shadow-xl rounded-2xl p-2 hidden group-hover:block z-20">
                      <div className="text-xs font-bold text-slate-400 px-3 py-2">اختر من المخزون:</div>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {inventory.filter(inv => !newRecipe.some(r => r.inventoryId === inv.id)).map(inv => (
                          <button key={inv.id} onClick={() => {
                            const newIng: RecipeIngredient = { id: `r_${Date.now()}`, inventoryId: inv.id, quantity: 1, unit: inv.baseUnit, wastePercent: 0 };
                            setNewRecipe([...newRecipe, newIng]);
                          }} className="w-full text-right flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl transition-colors">
                            <span className="text-xl">{inv.emoji}</span>
                            <div>
                              <div className="font-bold text-sm text-slate-800">{inv.name}</div>
                              <div className="text-[10px] text-slate-400">تكلفة: {inv.costPerUnit} ر.س / {inv.baseUnit}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                {newRecipe.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 text-sm">
                    لا توجد مكونات — المنتج مش هيخصم من المخزون
                  </div>
                ) : (
                  <div className="space-y-2">
                    {newRecipe.map(ing => {
                      const inv = inventory.find(i => i.id === ing.inventoryId);
                      if (!inv) return null;
                      return (
                        <div key={ing.id} className="bg-slate-50 rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                          <span className="text-xl">{inv.emoji}</span>
                          <div className="flex-1">
                            <div className="font-bold text-sm text-slate-800">{inv.name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <input type="number" value={ing.quantity} onChange={(e) => setNewRecipe(newRecipe.map(r => r.id === ing.id ? { ...r, quantity: Number(e.target.value) } : r))}
                                className="w-16 bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold text-center" />
                              <select value={ing.unit} onChange={(e) => setNewRecipe(newRecipe.map(r => r.id === ing.id ? { ...r, unit: e.target.value as Unit } : r))}
                                className="bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold">
                                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </div>
                          </div>
                          <button onClick={() => setNewRecipe(newRecipe.filter(r => r.id !== ing.id))} className="text-slate-300 hover:text-red-500 p-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3">
              <button onClick={() => setShowAddForm(false)} className="flex-1 py-3 rounded-xl font-bold border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                إلغاء
              </button>
              <button onClick={handleAddProduct} disabled={saving || !newProduct.name.trim()}
                className="flex-1 bg-[#1E1513] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#322420] transition-colors shadow-lg disabled:opacity-50">
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer Overlay */}
      {selectedProductId && (
        <div 
          className="fixed inset-0 bg-[#1E1513]/20 backdrop-blur-sm z-40"
          onClick={() => setSelectedProductId(null)}
        ></div>
      )}

    </div>
  );
}
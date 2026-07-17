'use client';

import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Save, Copy, History, Trash2, GripVertical, Beaker, Package, Coffee, FileText, ChevronDown, Loader2 } from 'lucide-react';
import { fetchAllProducts, fetchInventory, setRecipe } from '@/lib/api';

// --- Types ---
type Unit = 'g' | 'kg' | 'ml' | 'L' | 'pcs' | 'Sachet' | 'Pack';

interface InventoryItem {
  id: string;
  name: string;
  nameAr: string;
  emoji: string;
  costPerUnit: number; 
  baseUnit: Unit;
  color: string;
}

interface RecipeIngredient {
  id: string;
  inventoryId: string;
  quantity: number;
  unit: Unit;
}

interface RecipeVersion {
  id: string;
  versionNumber: number;
  date: string;
  totalCost: number;
}

interface ProductRecipe {
  id: string;
  name: string;
  nameAr: string;
  category: string;
  emoji: string;
  ingredients: RecipeIngredient[];
  versions: RecipeVersion[];
}

const UNIT_OPTIONS: Unit[] = ['g', 'kg', 'ml', 'L', 'pcs', 'Sachet', 'Pack'];
const INVENTORY_COLORS = [
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-blue-50 text-blue-800 border-blue-200',
  'bg-slate-100 text-slate-800 border-slate-200',
  'bg-sky-50 text-sky-800 border-sky-200',
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-cyan-50 text-cyan-800 border-cyan-200',
  'bg-red-50 text-red-800 border-red-200',
  'bg-orange-50 text-orange-800 border-orange-200',
  'bg-stone-100 text-stone-800 border-stone-300',
];

function getBaseQuantity(qty: number, unit: Unit, baseUnit: Unit): number {
  if (unit === baseUnit) return qty;
  if (unit === 'kg' && baseUnit === 'g') return qty * 1000;
  if (unit === 'g' && baseUnit === 'kg') return qty / 1000;
  if (unit === 'L' && baseUnit === 'ml') return qty * 1000;
  if (unit === 'ml' && baseUnit === 'L') return qty / 1000;
  return qty;
}

export default function RecipeBuilder() {
  const [recipes, setRecipes] = useState<ProductRecipe[]>([]);
  const [inventory, setInventoryData] = useState<InventoryItem[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [searchInv, setSearchInv] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedRecipe = useMemo(() => recipes.find(r => r.id === selectedRecipeId), [recipes, selectedRecipeId]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [apiProducts, apiInventory] = await Promise.all([
          fetchAllProducts(true),
          fetchInventory(),
        ]);
        setRecipes((apiProducts || []).map((p: any, idx: number) => ({
          id: p.id,
          name: p.name,
          nameAr: p.name,
          category: p.categoryRel?.name || '',
          emoji: p.emoji || '📦',
          ingredients: (p.recipe || []).map((r: any) => ({
            id: r.id,
            inventoryId: r.inventoryId,
            quantity: Number(r.quantity),
            unit: r.unit || 'g',
          })),
          versions: [],
        })));
        setInventoryData((apiInventory || []).map((i: any, idx: number) => ({
          id: i.id,
          name: i.itemName || '',
          nameAr: i.itemName || '',
          emoji: i.emoji || '📦',
          costPerUnit: Number(i.costPerUnit || 0),
          baseUnit: i.unit || 'g',
          color: INVENTORY_COLORS[idx % INVENTORY_COLORS.length],
        })));
        if (apiProducts?.length > 0) {
          setSelectedRecipeId(apiProducts[0].id);
        }
      } catch (e) {
        console.error('Failed to load recipes', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredInventory = useMemo(() => {
    return inventory.filter(item => item.nameAr.includes(searchInv) || item.name.toLowerCase().includes(searchInv.toLowerCase()));
  }, [searchInv, inventory]);

  const totalCost = useMemo(() => {
    if (!selectedRecipe) return 0;
    return selectedRecipe.ingredients.reduce((total, ing) => {
      const invItem = inventory.find(i => i.id === ing.inventoryId);
      if (!invItem) return total;
      const baseQty = getBaseQuantity(ing.quantity, ing.unit, invItem.baseUnit);
      return total + (baseQty * invItem.costPerUnit);
    }, 0);
  }, [selectedRecipe, inventory]);

  const handleDragStart = (e: React.DragEvent, invItem: InventoryItem) => {
    e.dataTransfer.setData('inventoryId', invItem.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const invId = e.dataTransfer.getData('inventoryId');
    if (!invId || !selectedRecipe) return;

    const invItem = inventory.find(i => i.id === invId);
    if (!invItem) return;

    // Add new ingredient
    const newIngredient: RecipeIngredient = {
      id: `ri_${Date.now()}`,
      inventoryId: invItem.id,
      quantity: invItem.baseUnit === 'pcs' || invItem.baseUnit === 'Sachet' ? 1 : 10,
      unit: invItem.baseUnit
    };

    updateRecipe({
      ...selectedRecipe,
      ingredients: [...selectedRecipe.ingredients, newIngredient]
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  // --- Recipe Mutations ---
  const updateRecipe = (updated: ProductRecipe) => {
    setRecipes(prev => prev.map(r => r.id === updated.id ? updated : r));
  };

  const updateIngredient = (ingId: string, updates: Partial<RecipeIngredient>) => {
    if (!selectedRecipe) return;
    updateRecipe({
      ...selectedRecipe,
      ingredients: selectedRecipe.ingredients.map(ing => ing.id === ingId ? { ...ing, ...updates } : ing)
    });
  };

  const removeIngredient = (ingId: string) => {
    if (!selectedRecipe) return;
    updateRecipe({
      ...selectedRecipe,
      ingredients: selectedRecipe.ingredients.filter(ing => ing.id !== ingId)
    });
  };

  const handleDuplicate = () => {
    if (!selectedRecipe) return;
    const newRecipe: ProductRecipe = {
      ...selectedRecipe,
      id: `prod_${Date.now()}`,
      name: `${selectedRecipe.name} (Copy)`,
      nameAr: `${selectedRecipe.nameAr} (نسخة)`,
      ingredients: selectedRecipe.ingredients.map(i => ({ ...i, id: `ri_${Math.random()}` })),
      versions: []
    };
    setRecipes([...recipes, newRecipe]);
    setSelectedRecipeId(newRecipe.id);
  };

  const handleSaveVersion = async () => {
    if (!selectedRecipe) return;
    setSaving(true);
    try {
      await setRecipe(selectedRecipe.id, selectedRecipe.ingredients.map(r => ({
        inventoryId: r.inventoryId,
        quantity: r.quantity,
        unit: r.unit,
      })));
    } catch (e) {
      console.error('Failed to save recipe', e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-80px)] w-full bg-[#FDFBF7] items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-[#8C6239]" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-80px)] w-full bg-[#FDFBF7] text-slate-900 font-sans overflow-hidden" dir="rtl">
      
      {/* ── LEFT PANEL: Products List ── */}
      <div className="w-64 border-l border-slate-200 bg-white flex flex-col shrink-0 shadow-sm z-10">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-xl font-black flex items-center gap-2 text-[#1E1513]">
            <Beaker className="w-5 h-5 text-[#8C6239]" />
            الوصفات
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {recipes.map(recipe => (
            <button
              key={recipe.id}
              onClick={() => setSelectedRecipeId(recipe.id)}
              className={`w-full text-right p-3 rounded-xl border transition-all flex items-center gap-3 ${
                selectedRecipeId === recipe.id 
                  ? 'bg-[#8C6239]/10 border-[#8C6239] shadow-sm' 
                  : 'bg-white border-transparent hover:bg-slate-50'
              }`}
            >
              <span className="text-2xl">{recipe.emoji}</span>
              <div className="flex-1">
                <div className={`font-bold ${selectedRecipeId === recipe.id ? 'text-[#1E1513]' : 'text-slate-600'}`}>{recipe.nameAr}</div>
                <div className="text-xs text-slate-400">{recipe.ingredients.length} مكونات</div>
              </div>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-slate-100">
          <button className="w-full py-2.5 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 font-bold hover:border-[#8C6239] hover:text-[#8C6239] transition-colors flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> وصفة جديدة
          </button>
        </div>
      </div>

      {/* ── CENTER PANEL: Recipe Builder ── */}
      <div className="flex-1 flex flex-col bg-[#FDFBF7] overflow-hidden">
        {selectedRecipe ? (
          <>
            {/* Header */}
            <div className="p-6 md:p-8 bg-white border-b border-slate-200 shadow-sm shrink-0 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-4xl">{selectedRecipe.emoji}</span>
                  <h1 className="text-3xl font-black text-[#1E1513] tracking-tight">
                    {selectedRecipe.nameAr}
                  </h1>
                </div>
                <div className="text-slate-500 font-medium flex items-center gap-4 mt-2">
                  <span className="bg-slate-100 px-3 py-1 rounded-full text-sm font-bold text-slate-600">{selectedRecipe.category}</span>
                  <span>النسخة الحالية: V{selectedRecipe.versions.length || 1}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleDuplicate} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 hover:text-[#1E1513] transition-all flex items-center gap-2 shadow-sm">
                  <Copy className="w-4 h-4" /> نسخ
                </button>
                <button onClick={handleSaveVersion} disabled={saving} className="px-5 py-2 rounded-xl bg-[#8C6239] text-white font-bold hover:bg-[#704B2A] transition-all flex items-center gap-2 shadow-md shadow-[#8C6239]/20 disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ الوصفة
                </button>
              </div>
            </div>

            {/* Builder Area */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 flex gap-8">
              <div className="flex-1">
                <h3 className="text-lg font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center justify-between">
                  <span>مكونات الوصفة</span>
                  <span className="text-[#8C6239] text-sm bg-[#8C6239]/10 px-3 py-1 rounded-lg">إجمالي التكلفة: {totalCost.toFixed(2)} ر.س</span>
                </h3>
                
                <div 
                  className={`min-h-[400px] rounded-3xl border-2 transition-all p-4 flex flex-col gap-3 ${
                    isDraggingOver 
                      ? 'border-[#8C6239] bg-[#8C6239]/5 shadow-inner' 
                      : 'border-dashed border-slate-300 bg-white/50'
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  {selectedRecipe.ingredients.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 pointer-events-none">
                      <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                        <Plus className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="font-bold text-lg text-slate-500">اسحب المكونات وأفلتها هنا</p>
                      <p className="text-sm mt-2">قم بسحب المواد الخام من القائمة الجانبية لبناء الوصفة</p>
                    </div>
                  ) : (
                    selectedRecipe.ingredients.map((ing, index) => {
                      const invItem = inventory.find(i => i.id === ing.inventoryId);
                      if (!invItem) return null;
                      
                      const itemCost = getBaseQuantity(ing.quantity, ing.unit, invItem.baseUnit) * invItem.costPerUnit;

                      return (
                        <div key={ing.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow group relative">
                          <div className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500">
                            <GripVertical className="w-5 h-5" />
                          </div>
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl border shrink-0 ${invItem.color}`}>
                            {invItem.emoji}
                          </div>
                          <div className="flex-1">
                            <div className="font-bold text-slate-800 text-lg">{invItem.nameAr}</div>
                            <div className="text-xs font-bold text-slate-400">التكلفة: {itemCost.toFixed(3)} ر.س</div>
                          </div>
                          
                          {/* Quantity Controls */}
                          <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100">
                            <input 
                              type="number" 
                              value={ing.quantity}
                              onChange={(e) => updateIngredient(ing.id, { quantity: Number(e.target.value) })}
                              className="w-20 text-center font-black text-lg bg-transparent border-none outline-none text-[#1E1513] focus:ring-0"
                              min="0"
                              step={invItem.baseUnit === 'pcs' || invItem.baseUnit === 'Sachet' ? '1' : '0.5'}
                            />
                            <div className="w-px h-6 bg-slate-200"></div>
                            <div className="relative">
                              <select 
                                value={ing.unit}
                                onChange={(e) => updateIngredient(ing.id, { unit: e.target.value as Unit })}
                                className="appearance-none bg-transparent pr-8 pl-3 py-1 font-bold text-slate-600 outline-none cursor-pointer"
                              >
                                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </div>

                          <button 
                            onClick={() => removeIngredient(ing.id)}
                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-2"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Version History Sidebar */}
              <div className="w-64 shrink-0 border border-slate-200 rounded-3xl bg-white p-5 shadow-sm self-start">
                <h3 className="font-black text-[#1E1513] flex items-center gap-2 mb-6">
                  <History className="w-5 h-5 text-slate-400" /> سجل الإصدارات
                </h3>
                <div className="space-y-4">
                  {selectedRecipe.versions.length === 0 ? (
                    <div className="text-slate-400 text-sm text-center py-4">لم يتم حفظ أي إصدار حتى الآن.</div>
                  ) : (
                    selectedRecipe.versions.map((v, i) => (
                      <div key={v.id} className="relative pl-4 border-r-2 border-slate-100 pb-4 last:border-0 last:pb-0">
                        <div className="absolute w-3 h-3 bg-[#8C6239] rounded-full -right-[7px] top-1 border-2 border-white"></div>
                        <div className="font-bold text-sm text-slate-800">إصدار V{v.versionNumber} {i === 0 && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 rounded-full ml-2">الحالي</span>}</div>
                        <div className="text-xs text-slate-500 mt-1">{v.date}</div>
                        <div className="text-xs font-bold text-[#8C6239] mt-1 bg-[#8C6239]/10 inline-block px-2 py-0.5 rounded-md">التكلفة: {v.totalCost.toFixed(2)} ر.س</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">اختر وصفة للبدء في البناء</div>
        )}
      </div>

      {/* ── RIGHT PANEL: Inventory Drag Source ── */}
      <div className="w-72 border-r border-slate-200 bg-white flex flex-col shrink-0 shadow-[0_0_40px_rgba(0,0,0,0.02)] z-10">
        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-black flex items-center gap-2 text-[#1E1513] mb-4">
            <Package className="w-5 h-5 text-[#8C6239]" />
            مكونات المخزون
          </h2>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث عن مكون..."
              value={searchInv}
              onChange={(e) => setSearchInv(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pr-9 pl-3 text-sm font-bold focus:border-[#8C6239] focus:ring-1 focus:ring-[#8C6239] outline-none transition-all shadow-sm"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            {filteredInventory.map(item => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, item)}
                className={`border rounded-2xl p-3 flex flex-col items-center justify-center gap-2 cursor-grab active:cursor-grabbing hover:scale-105 hover:shadow-md transition-all ${item.color}`}
              >
                <div className="text-3xl">{item.emoji}</div>
                <div className="text-xs font-bold text-center leading-tight">{item.nameAr}</div>
                <div className="text-[10px] font-black opacity-60 uppercase">{item.baseUnit}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

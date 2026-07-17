'use client';

import { useState, useEffect } from 'react';
import { ProductDetail, ProductCategory, RecipeIngredient, ProductOption, InventoryItem } from '@/types';
import { fetchAllProducts, updateProduct, createProduct, setRecipe, setOptions, fetchCategories, fetchPriceHistory } from '@/lib/api';
import { X, Save, Plus, Trash2 } from 'lucide-react';

interface Props {
  product: ProductDetail | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ProductEditor({ product, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<'details' | 'recipe' | 'options' | 'history'>('details');
  const [name, setName] = useState(product?.name ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryRel?.id ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? Number(product.price) : 0);
  const [cost, setCost] = useState(product ? Number(product.cost) : 0);
  const [cafePrice, setCafePrice] = useState(product ? Number(product.cafePrice ?? product.price) : 0);
  const [active, setActive] = useState(product?.active ?? true);
  const [saving, setSaving] = useState(false);

  const [recipe, setRecipeState] = useState<RecipeIngredient[]>(product?.recipe ?? []);
  const [newIngredient, setNewIngredient] = useState({ inventoryId: '', quantity: 0, unit: 'g' });

  const [options, setOptionsState] = useState<ProductOption[]>(product?.options ?? []);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);

  const [inventoryMap, setInventoryMap] = useState<Map<string, InventoryItem>>(new Map());

  useEffect(() => {
    fetchCategories(true).then(setCategories).catch(() => {});
    fetch('/api/inventory').catch(() => {}).then(async () => {
      try {
        const mod = await import('@/lib/api');
        const res = await (mod as any).fetchInventory?.();
        if (res) {
          setInventoryItems(res);
          setInventoryMap(new Map(res.map((i: any) => [i.id, i])));
        }
      } catch {}
    });
    if (product?.id) {
      fetchPriceHistory(product.id).then(setPriceHistory).catch(() => {});
    }
  }, [product?.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (product?.id) {
        await updateProduct(product.id, { name, category, categoryId, description, price, cost, cafePrice, active });
        if (recipe.length > 0) {
          await setRecipe(product.id, recipe.map(r => ({
            inventoryId: r.inventoryId,
            quantity: Number(r.quantity),
            unit: r.unit,
            notes: r.notes || undefined,
          })));
        }
        if (options.length > 0) {
          await setOptions(product.id, options.map(o => ({
            name: o.name,
            required: o.required,
            multiSelect: o.multiSelect,
            choices: o.choices.map(c => ({
              label: c.label,
              priceAdjust: c.priceAdjust,
              ingredientImpacts: c.ingredientImpacts,
              sortOrder: c.sortOrder,
            })),
            sortOrder: o.sortOrder,
          })));
        }
      } else {
        const cafeId = sessionStorage.getItem('sonic_cafe_id') || undefined;
        await createProduct({
          name,
          category,
          categoryId,
          description,
          price,
          cost,
          cafePrice,
          cafeId,
        } as any);
      }
      onSaved();
      onClose();
    } catch {}
    setSaving(false);
  };

  const addRecipeRow = () => {
    if (!newIngredient.inventoryId) return;
    setRecipeState([...recipe, {
      id: '',
      productId: product?.id ?? '',
      inventoryId: newIngredient.inventoryId,
      quantity: newIngredient.quantity,
      unit: newIngredient.unit,
      notes: null,
      inventory: inventoryMap.get(newIngredient.inventoryId) || { id: '', itemName: '', unit: '', costPerUnit: 0 },
    }]);
    setNewIngredient({ inventoryId: '', quantity: 0, unit: 'g' });
  };

  const removeRecipeRow = (idx: number) => {
    setRecipeState(recipe.filter((_, i) => i !== idx));
  };

  const addOption = () => {
    setOptionsState([...options, {
      id: '', productId: product?.id ?? '', name: '', required: false, multiSelect: false,
      choices: [], sortOrder: options.length, createdAt: '',
    }]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold text-gray-800">
            {product ? `Edit: ${product.name}` : 'New Product'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-gray-50 px-6">
          {(['details', 'recipe', 'options', 'history'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t ? 'border-b-2 border-amber-600 text-amber-700' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'details' ? 'Details' : t === 'recipe' ? 'Recipe' : t === 'options' ? 'Options' : 'History'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {tab === 'details' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500">Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Category (string)</label>
                  <input value={category} onChange={e => setCategory(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Category (linked)</label>
                  <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
                    <option value="">None</option>
                    {categories.filter(c => c.active).map(c => (
                      <option key={c.id} value={c.id}>{c.icon || ''} {c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input type="checkbox" id="active" checked={active} onChange={e => setActive(e.target.checked)} />
                  <label htmlFor="active" className="text-sm text-gray-700">Active</label>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500">Selling Price ($)</label>
                  <input type="number" step="0.01" value={price} onChange={e => setPrice(parseFloat(e.target.value) || 0)} className="w-full rounded-lg border px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Cost ($)</label>
                  <input type="number" step="0.01" value={cost} onChange={e => setCost(parseFloat(e.target.value) || 0)} className="w-full rounded-lg border px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Café Price ($)</label>
                  <input type="number" step="0.01" value={cafePrice} onChange={e => setCafePrice(parseFloat(e.target.value) || 0)} className="w-full rounded-lg border px-3 py-2 text-sm" />
                </div>
              </div>
              {price > 0 && (
                <div className="rounded-lg bg-gray-50 p-3 text-sm">
                  <span className="text-gray-500">Profit Margin: </span>
                  <span className={`font-bold ${price - cost > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {((price - cost) / price * 100).toFixed(1)}%
                  </span>
                  <span className="text-gray-400 ml-4">Cost: ${cost.toFixed(2)} | Margin: ${(price - cost).toFixed(2)}</span>
                </div>
              )}
            </>
          )}

          {tab === 'recipe' && (
            <>
              <div className="space-y-2">
                {recipe.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-gray-50 p-2 text-sm">
                    <span className="flex-1 font-medium text-gray-700">{r.inventory?.itemName || 'Unknown'}</span>
                    <span className="tabular-nums">{Number(r.quantity).toFixed(2)}</span>
                    <span className="text-gray-400">{r.unit}</span>
                    <span className="text-gray-400">
                      ${(Number(r.quantity) * Number(r.inventory?.costPerUnit || 0)).toFixed(2)}
                    </span>
                    <button onClick={() => removeRecipeRow(i)} className="text-red-400 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-end gap-2 border-t pt-3">
                <div className="flex-1">
                  <label className="text-[10px] font-medium text-gray-400">Ingredient</label>
                  <select value={newIngredient.inventoryId}
                    onChange={e => {
                      const inv = inventoryItems.find(i => i.id === e.target.value);
                      setNewIngredient({ ...newIngredient, inventoryId: e.target.value, unit: inv?.unit || 'g' });
                    }}
                    className="w-full rounded-lg border px-2 py-1.5 text-sm">
                    <option value="">Select...</option>
                    {inventoryItems.map(i => (
                      <option key={i.id} value={i.id}>{i.itemName} ({i.unit})</option>
                    ))}
                  </select>
                </div>
                <div className="w-20">
                  <label className="text-[10px] font-medium text-gray-400">Qty</label>
                  <input type="number" step="0.1" value={newIngredient.quantity}
                    onChange={e => setNewIngredient({ ...newIngredient, quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border px-2 py-1.5 text-sm" />
                </div>
                <button onClick={addRecipeRow} className="rounded-lg bg-amber-600 p-2 text-white hover:bg-amber-700">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {recipe.length > 0 && (
                <p className="text-xs text-gray-400">
                  Computed cost: ${recipe.reduce((s, r) => s + Number(r.quantity) * Number(r.inventory?.costPerUnit || 0), 0).toFixed(2)}
                </p>
              )}
            </>
          )}

          {tab === 'options' && (
            <>
              {options.map((opt, oi) => (
                <div key={oi} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={opt.name} onChange={e => {
                      const copy = [...options]; copy[oi] = { ...copy[oi], name: e.target.value }; setOptionsState(copy);
                    }} placeholder="Option name (e.g. Size, Roast)" className="flex-1 rounded border px-2 py-1 text-sm" />
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={opt.required} onChange={e => {
                        const copy = [...options]; copy[oi] = { ...copy[oi], required: e.target.checked }; setOptionsState(copy);
                      }} /> Required
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={opt.multiSelect} onChange={e => {
                        const copy = [...options]; copy[oi] = { ...copy[oi], multiSelect: e.target.checked }; setOptionsState(copy);
                      }} /> Multi
                    </label>
                    <button onClick={() => setOptionsState(options.filter((_, i) => i !== oi))} className="text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  {opt.choices.map((ch, ci) => (
                    <div key={ci} className="ml-4 flex items-center gap-2 text-sm">
                      <input value={ch.label} onChange={e => {
                        const copy = [...options]; copy[oi] = { ...copy[oi], choices: copy[oi].choices.map((c, i) => i === ci ? { ...c, label: e.target.value } : c) }; setOptionsState(copy);
                      }} placeholder="Label" className="w-32 rounded border px-2 py-1 text-xs" />
                      <span className="text-gray-400">+$</span>
                      <input type="number" step="0.01" value={ch.priceAdjust || 0} onChange={e => {
                        const copy = [...options]; copy[oi] = { ...copy[oi], choices: copy[oi].choices.map((c, i) => i === ci ? { ...c, priceAdjust: parseFloat(e.target.value) || 0 } : c) }; setOptionsState(copy);
                      }} className="w-16 rounded border px-2 py-1 text-xs" />
                    </div>
                  ))}
                  <button onClick={() => {
                    const copy = [...options]; copy[oi] = { ...copy[oi], choices: [...copy[oi].choices, { label: '', priceAdjust: 0, ingredientImpacts: [], sortOrder: copy[oi].choices.length }] }; setOptionsState(copy);
                  }} className="ml-4 text-xs text-amber-600 hover:text-amber-700">+ Add choice</button>
                </div>
              ))}
              <button onClick={addOption} className="w-full rounded-lg border-2 border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500 hover:border-gray-300">
                + Add option group
              </button>
            </>
          )}

          {tab === 'history' && (
            <div className="space-y-2">
              {priceHistory.length === 0 && <p className="text-sm text-gray-400">No price changes recorded.</p>}
              {priceHistory.map((h: any) => (
                <div key={h.id} className="rounded-lg bg-gray-50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">
                      ${Number(h.oldPrice).toFixed(2)} → ${Number(h.newPrice).toFixed(2)}
                    </span>
                    <span className="text-xs text-gray-400">{new Date(h.createdAt).toLocaleString()}</span>
                  </div>
                  {h.reason && <p className="text-xs text-gray-400 mt-1">{h.reason}</p>}
                  {h.changedBy && <p className="text-xs text-gray-400">By: {h.changedBy.name}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
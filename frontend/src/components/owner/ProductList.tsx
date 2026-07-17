'use client';

import { useState, useEffect } from 'react';
import { ProductDetail } from '@/types';
import { fetchAllProducts, deactivateProduct, activateProduct } from '@/lib/api';
import { ProductEditor } from './ProductEditor';
import { Package, Plus, Search, ToggleLeft, ToggleRight } from 'lucide-react';

export function ProductList() {
  const [products, setProducts] = useState<ProductDetail[]>([]);
  const [filtered, setFiltered] = useState<ProductDetail[]>([]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<ProductDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAllProducts(true);
      setProducts(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(products.filter(p =>
      (showInactive || p.active) &&
      (p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
    ));
  }, [products, search, showInactive]);

  const handleToggle = async (p: ProductDetail) => {
    try {
      if (p.active) await deactivateProduct(p.id);
      else await activateProduct(p.id);
      await load();
    } catch {}
  };

  const totalProfit = products.filter(p => p.active).reduce((s, p) => s + Number(p.price) - Number(p.cost), 0);

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-amber-600" />
          <h3 className="text-sm font-bold text-gray-800">Products ({products.filter(p => p.active).length})</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">Total margin: <span className="font-bold text-emerald-600">${totalProfit.toFixed(2)}</span></span>
          <button onClick={() => setCreating(true)} className="flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b bg-gray-50 px-4 py-2">
        <Search className="h-4 w-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="flex-1 bg-transparent text-sm outline-none" />
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-amber-600" />
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {filtered.map((p) => {
            const margin = Number(p.price) - Number(p.cost);
            const marginPct = Number(p.price) > 0 ? (margin / Number(p.price) * 100) : 0;
            return (
              <div key={p.id}
                className={`flex items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-gray-50 cursor-pointer ${!p.active ? 'opacity-50' : ''}`}
                onClick={() => setEditing(p)}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="font-medium text-gray-800 truncate">{p.name}</span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{p.category}</span>
                </div>
                <div className="flex items-center gap-4 text-xs tabular-nums">
                  <span className="text-gray-500 w-20 text-right">${Number(p.price).toFixed(2)}</span>
                  <span className={`w-16 text-right font-medium ${margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {marginPct.toFixed(0)}%
                  </span>
                  {p.recipe && p.recipe.length > 0 && (
                    <span className="text-gray-400" title={`${p.recipe.length} ingredients`}>
                      🥘{p.recipe.length}
                    </span>
                  )}
                  {p.options && p.options.length > 0 && (
                    <span className="text-gray-400" title={`${p.options.length} option groups`}>
                      ⚙️{p.options.length}
                    </span>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); handleToggle(p); }} className="text-gray-400 hover:text-amber-600">
                    {p.active ? <ToggleRight className="h-4 w-4 text-emerald-500" /> : <ToggleLeft className="h-4 w-4 text-gray-300" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(editing || creating) && (
        <ProductEditor
          product={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={load}
        />
      )}
    </div>
  );
}
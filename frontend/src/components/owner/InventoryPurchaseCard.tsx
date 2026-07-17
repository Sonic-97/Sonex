'use client';

import { useState, useEffect } from 'react';
import { createInventoryPurchase, fetchInventoryPurchases } from '@/lib/api';
import { Package, Plus } from 'lucide-react';

interface Purchase {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  cost?: number;
  supplier?: string;
  notes?: string;
  createdAt: string;
  purchasedBy?: { id: string; name: string };
}

export function InventoryPurchaseCard() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ itemName: '', quantity: 0, unit: 'kg', cost: 0, supplier: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchInventoryPurchases();
      setPurchases(data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.itemName.trim() || form.quantity <= 0) return;
    setSaving(true);
    try {
      const purchasedById = sessionStorage.getItem('auth_employee_id') || undefined;
      await createInventoryPurchase({ ...form, purchasedById, cost: form.cost || undefined, supplier: form.supplier || undefined, notes: form.notes || undefined });
      setForm({ itemName: '', quantity: 0, unit: 'kg', cost: 0, supplier: '', notes: '' });
      setShowForm(false);
      load();
    } catch {
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border bg-white p-5 shadow-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-indigo-600" />
          <h2 className="font-bold text-gray-800">Inventory Purchases</h2>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
          <Plus className="h-3 w-3" /> {showForm ? 'Close' : 'Record'}
        </button>
      </div>

      {showForm && (
        <div className="mb-4 space-y-3 rounded-lg border bg-gray-50 p-4">
          <input
            type="text"
            value={form.itemName}
            onChange={(e) => setForm({ ...form, itemName: e.target.value })}
            placeholder="Item name *"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              type="number"
              value={form.quantity || ''}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              placeholder="Qty *"
              min={0}
              step="any"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option>kg</option>
              <option>ml</option>
              <option>g</option>
              <option>units</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              value={form.cost || ''}
              onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })}
              placeholder="Cost ($)"
              min={0}
              step="0.01"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              placeholder="Supplier"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notes"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.itemName || form.quantity <= 0} className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Purchase'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-600" />
        </div>
      ) : purchases.length === 0 ? (
        <div className="rounded-lg bg-gray-50 py-6 text-center text-sm text-gray-400">No purchases recorded</div>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {purchases.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-gray-800">{p.itemName}</p>
                <p className="text-xs text-gray-400">
                  {p.quantity} {p.unit}
                  {p.supplier && ` — ${p.supplier}`}
                  {p.purchasedBy && ` · by ${p.purchasedBy.name}`}
                </p>
              </div>
              <div className="text-right">
                {p.cost ? <p className="text-sm font-semibold text-gray-700">${p.cost.toFixed(2)}</p> : null}
                <p className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

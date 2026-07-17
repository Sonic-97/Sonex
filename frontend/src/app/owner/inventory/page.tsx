'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import api from '@/lib/api';
import { Search, Plus, AlertTriangle, PackagePlus, X, TrendingUp, DollarSign, Calendar, ClipboardList, Truck, History } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import UnitSelect from '@/components/inventory/UnitSelect';
import EmojiPicker from '@/components/inventory/EmojiPicker';
import { getUnitLabel } from '@/lib/inventory-units';

export default function OwnerInventoryPage() {
  useSocket('/owner');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [refillItem, setRefillItem] = useState<any | null>(null);
  const [form, setForm] = useState({ itemName: '', emoji: '📦', unit: 'pcs', currentQty: '0', minThreshold: '10', costPerUnit: '0' });
  const [editForm, setEditForm] = useState({ itemName: '', emoji: '📦', unit: 'pcs', currentQty: '0', minThreshold: '10', costPerUnit: '0' });
  const [refillForm, setRefillForm] = useState({ quantity: '1', cost: '', supplier: '', notes: '' });
  const [refilling, setRefilling] = useState(false);
  const [reportTab, setReportTab] = useState<'purchases' | 'expenses' | 'movements'>('purchases');
  const [purchases, setPurchases] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [expenseSummary, setExpenseSummary] = useState<{ daily: number; weekly: number; monthly: number }>({ daily: 0, weekly: 0, monthly: 0 });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [data, daily, weekly, monthly] = await Promise.all([
        api.get('/inventory').then(r => Array.isArray(r.data) ? r.data : []),
        api.get('/expenses/daily').then(r => r.data).catch(() => ({ totalExpenses: 0 })),
        api.get('/expenses/weekly').then(r => r.data).catch(() => ({ totalExpenses: 0 })),
        api.get('/expenses/monthly').then(r => r.data).catch(() => ({ totalExpenses: 0 })),
      ]);
      setItems(data);
      setExpenseSummary({
        daily: Number(daily.totalExpenses),
        weekly: Number(weekly.totalExpenses),
        monthly: Number(monthly.totalExpenses),
      });
    } catch { setItems([]); }
    setLoading(false);
  };

  const loadReports = async (tab: string) => {
    setReportLoading(true);
    try {
      if (tab === 'purchases') {
        const { data } = await api.get('/inventory-purchases');
        setPurchases(Array.isArray(data) ? data : []);
      } else if (tab === 'expenses') {
        const { data } = await api.get('/expenses');
        setExpenses(Array.isArray(data) ? data : []);
      } else if (tab === 'movements') {
        const { data } = await api.get('/inventory/movements');
        setMovements(Array.isArray(data) ? data : []);
      }
    } catch { setPurchases([]); setExpenses([]); setMovements([]); }
    setReportLoading(false);
  };

  const switchReportTab = (tab: 'purchases' | 'expenses' | 'movements') => {
    setReportTab(tab);
    loadReports(tab);
  };

  const filtered = items.filter((i) =>
    !search || i.itemName?.toLowerCase().includes(search.toLowerCase())
  );

  const lowStockCount = items.filter((i) => Number(i.currentQty) <= Number(i.minThreshold)).length;

  const getStockStatus = (item: any) => {
    const qty = Number(item.currentQty);
    const threshold = Number(item.minThreshold);
    if (qty <= 0) return { label: 'Out of Stock', color: 'bg-red-100 text-red-700', icon: true };
    if (qty <= threshold) return { label: 'Low', color: 'bg-amber-100 text-amber-700', icon: true };
    return { label: 'Normal', color: 'bg-green-100 text-green-700', icon: false };
  };

  const handleUpdateStock = async (id: string, qty: number) => {
    await api.patch(`/inventory/${id}`, { currentQty: qty });
    loadData();
  };

  const handleUpdateThreshold = async (id: string, threshold: number) => {
    await api.patch(`/inventory/${id}/threshold`, { minThreshold: threshold });
    loadData();
  };

  const handleCreate = async () => {
    if (!form.itemName) return;
    await api.post('/inventory', {
      itemName: form.itemName,
      emoji: form.emoji,
      unit: form.unit,
      currentQty: Number(form.currentQty),
      minThreshold: Number(form.minThreshold),
      costPerUnit: Number(form.costPerUnit),
    });
    setForm({ itemName: '', emoji: '📦', unit: 'pcs', currentQty: '0', minThreshold: '10', costPerUnit: '0' });
    setShowForm(false);
    loadData();
  };

  const handleEdit = async () => {
    if (!editItem || !editForm.itemName) return;
    await api.patch(`/inventory/${editItem.id}`, {
      itemName: editForm.itemName,
      emoji: editForm.emoji,
      unit: editForm.unit,
      currentQty: Number(editForm.currentQty),
      minThreshold: Number(editForm.minThreshold),
      costPerUnit: Number(editForm.costPerUnit),
    });
    setEditItem(null);
    loadData();
  };

  const openEditForm = (item: any) => {
    setEditForm({
      itemName: item.itemName || '',
      emoji: item.emoji || '📦',
      unit: item.unit || 'pcs',
      currentQty: String(item.currentQty ?? '0'),
      minThreshold: String(item.minThreshold ?? '10'),
      costPerUnit: String(item.costPerUnit ?? '0'),
    });
    setEditItem(item);
  };

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
      loadData();
    } catch (err) {
      console.error('Refill failed', err);
    }
    setRefilling(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-violet-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4" dir="rtl">
      {/* Expense Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2.5"><Calendar className="h-5 w-5 text-blue-600" /></div>
          <div>
            <p className="text-xs text-gray-500">مصروفات اليوم</p>
            <p className="text-lg font-bold text-gray-800">{formatCurrency(expenseSummary.daily)}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4 flex items-center gap-3">
          <div className="rounded-lg bg-indigo-50 p-2.5"><TrendingUp className="h-5 w-5 text-indigo-600" /></div>
          <div>
            <p className="text-xs text-gray-500">مصروفات الأسبوع</p>
            <p className="text-lg font-bold text-gray-800">{formatCurrency(expenseSummary.weekly)}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-50 p-2.5"><DollarSign className="h-5 w-5 text-emerald-600" /></div>
          <div>
            <p className="text-xs text-gray-500">مصروفات الشهر</p>
            <p className="text-lg font-bold text-gray-800">{formatCurrency(expenseSummary.monthly)}</p>
          </div>
        </div>
      </div>

      {/* Low Stock Alert Banner */}
      {lowStockCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">
            ⚠ يوجد {lowStockCount} أصناف منخفضة المخزون — يرجى إعادة التخزين
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="بحث في المخزون..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
          <Plus className="h-4 w-4" /> إضافة صنف
        </button>
      </div>

      {/* Add Item Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-800">➕ إضافة صنف جديد</h3>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {/* Section 1: Item Info */}
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">📦 معلومات الصنف</p>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">📦 اسم الصنف <span className="text-red-500">*</span></label>
                  <input type="text" placeholder="أدخل اسم الصنف" value={form.itemName}
                    onChange={(e) => setForm({ ...form, itemName: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">🏷️ كود الصنف</label>
                  <input type="text" placeholder="يتم إنشاؤه تلقائياً" disabled
                    className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-400" />
                  <p className="mt-0.5 text-[10px] text-gray-400">يتم إنشاء كود فريد تلقائياً.</p>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">😊 الإيموجي</label>
                  <EmojiPicker value={form.emoji} onChange={(v) => setForm({ ...form, emoji: v })} />
                </div>
              </div>

              {/* Section 2: Quantity & Units */}
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">📏 الكمية والوحدات</p>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">🔢 الكمية الحالية</label>
                  <input type="number" placeholder="أدخل الكمية الموجودة حالياً" value={form.currentQty}
                    onChange={(e) => setForm({ ...form, currentQty: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">📏 وحدة القياس</label>
                  <UnitSelect value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">⚠️ حد التنبيه</label>
                  <input type="number" placeholder="أدخل الحد الأدنى للتنبيه" value={form.minThreshold}
                    onChange={(e) => setForm({ ...form, minThreshold: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
                </div>
              </div>
            </div>

            {/* Section 3: Cost Info — full width */}
            <div className="mt-5 space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">💰 معلومات التكلفة</p>
              <div className="md:w-1/2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">💰 سعر الوحدة</label>
                <input type="number" step="0.01" min="0" placeholder="أدخل سعر الوحدة" value={form.costPerUnit}
                  onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowForm(false)}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                إلغاء
              </button>
              <button onClick={handleCreate}
                className="flex-1 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Table */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-4 py-3">الكود</th>
              <th className="px-4 py-3">الصنف</th>
              <th className="px-4 py-3">الوحدة</th>
              <th className="px-4 py-3">المخزون</th>
              <th className="px-4 py-3">الحد الأدنى</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">التكلفة/وحدة</th>
              <th className="px-4 py-3">قيمة المخزون</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const status = getStockStatus(item);
              const stockValue = (Number(item.currentQty) * Number(item.costPerUnit)).toFixed(2);
              return (
                <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-xs font-mono text-violet-600 font-bold">{item.code || '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{item.emoji ? `${item.emoji} ` : ''}{item.itemName}</td>
                  <td className="px-4 py-3 text-gray-600">{getUnitLabel(item.unit)}</td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      defaultValue={item.currentQty}
                      onBlur={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val) && val !== Number(item.currentQty)) handleUpdateStock(item.id, val);
                      }}
                      className="w-20 rounded border border-gray-200 px-2 py-1 text-sm focus:border-violet-400 focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      defaultValue={item.minThreshold}
                      onBlur={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val) && val !== Number(item.minThreshold)) handleUpdateThreshold(item.id, val);
                      }}
                      className="w-20 rounded border border-gray-200 px-2 py-1 text-sm focus:border-amber-400 focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>
                      {status.icon && <AlertTriangle className="h-3 w-3" />}
                      {status.label === 'Low' ? '⚠ منخفض' : status.label === 'Out of Stock' ? '⚠ نفذ' : 'طبيعي'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatCurrency(Number(item.costPerUnit))}</td>
                  <td className="px-4 py-3 text-gray-600">{formatCurrency(Number(stockValue))}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openEditForm(item)}
                        className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => { setRefillItem(item); setRefillForm({ quantity: '1', cost: '', supplier: '', notes: '' }); }}
                        className="flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        <PackagePlus className="h-3.5 w-3.5" />
                        إعادة تخزين
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">لا توجد أصناف في المخزون</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Reports Section */}
      <div className="rounded-xl border bg-white">
        <div className="flex border-b">
          <button onClick={() => switchReportTab('purchases')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${reportTab === 'purchases' ? 'border-b-2 border-violet-600 text-violet-700' : 'text-gray-500 hover:text-gray-700'}`}>
            <ClipboardList className="h-4 w-4" /> المشتريات
          </button>
          <button onClick={() => switchReportTab('expenses')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${reportTab === 'expenses' ? 'border-b-2 border-violet-600 text-violet-700' : 'text-gray-500 hover:text-gray-700'}`}>
            <DollarSign className="h-4 w-4" /> المصروفات
          </button>
          <button onClick={() => switchReportTab('movements')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${reportTab === 'movements' ? 'border-b-2 border-violet-600 text-violet-700' : 'text-gray-500 hover:text-gray-700'}`}>
            <History className="h-4 w-4" /> حركة المخزون
          </button>
        </div>
        <div className="p-4">
          {reportLoading ? (
            <div className="py-8 text-center text-sm text-gray-400">جاري التحميل...</div>
          ) : reportTab === 'purchases' ? (
            purchases.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">لا توجد مشتريات</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500">
                      <th className="px-3 py-2 text-right">الصنف</th>
                      <th className="px-3 py-2 text-right">الكمية</th>
                      <th className="px-3 py-2 text-right">التكلفة</th>
                      <th className="px-3 py-2 text-right">المورد</th>
                      <th className="px-3 py-2 text-right">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((p: any) => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800">{p.itemName}</td>
                        <td className="px-3 py-2 text-gray-600">{p.quantity} {getUnitLabel(p.unit)}</td>
                        <td className="px-3 py-2 text-gray-600">{p.cost ? formatCurrency(Number(p.cost)) : '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{p.supplier || '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{new Date(p.createdAt).toLocaleDateString('ar-EG')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : reportTab === 'expenses' ? (
            expenses.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">لا توجد مصروفات</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500">
                      <th className="px-3 py-2 text-right">التصنيف</th>
                      <th className="px-3 py-2 text-right">المبلغ</th>
                      <th className="px-3 py-2 text-right">الوصف</th>
                      <th className="px-3 py-2 text-right">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e: any) => (
                      <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800">{e.category}</td>
                        <td className="px-3 py-2 font-mono font-bold text-red-600">{formatCurrency(Number(e.amount))}</td>
                        <td className="px-3 py-2 text-gray-600">{e.description || '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{new Date(e.expenseDate).toLocaleDateString('ar-EG')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            movements.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">لا توجد حركات مخزون</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500">
                      <th className="px-3 py-2 text-right">الصنف</th>
                      <th className="px-3 py-2 text-right">التغيير</th>
                      <th className="px-3 py-2 text-right">الحالة</th>
                      <th className="px-3 py-2 text-right">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m: any) => (
                      <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800">{m.inventory?.itemName || '—'}</td>
                        <td className={`px-3 py-2 font-mono font-bold ${m.change > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {m.change > 0 ? '+' : ''}{m.change}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${m.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {m.status === 'completed' ? 'مكتمل' : 'معلق'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">{new Date(m.createdAt).toLocaleDateString('ar-EG')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>

      {/* Edit Item Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditItem(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-800">✏️ تعديل الصنف</h3>
              <button onClick={() => setEditItem(null)} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">📦 معلومات الصنف</p>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">📦 اسم الصنف <span className="text-red-500">*</span></label>
                  <input type="text" placeholder="أدخل اسم الصنف" value={editForm.itemName}
                    onChange={(e) => setEditForm({ ...editForm, itemName: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">🏷️ كود الصنف</label>
                  <input type="text" value={editItem.code || '—'} disabled
                    className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-500 font-mono" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">😊 الإيموجي</label>
                  <EmojiPicker value={editForm.emoji} onChange={(v) => setEditForm({ ...editForm, emoji: v })} />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">📏 الكمية والوحدات</p>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">🔢 الكمية الحالية</label>
                  <input type="number" placeholder="أدخل الكمية الموجودة حالياً" value={editForm.currentQty}
                    onChange={(e) => setEditForm({ ...editForm, currentQty: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">📏 وحدة القياس</label>
                  <UnitSelect value={editForm.unit} onChange={(v) => setEditForm({ ...editForm, unit: v })} />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">⚠️ حد التنبيه</label>
                  <input type="number" placeholder="أدخل الحد الأدنى للتنبيه" value={editForm.minThreshold}
                    onChange={(e) => setEditForm({ ...editForm, minThreshold: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">💰 معلومات التكلفة</p>
              <div className="md:w-1/2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">💰 سعر الوحدة</label>
                <input type="number" step="0.01" min="0" placeholder="أدخل سعر الوحدة" value={editForm.costPerUnit}
                  onChange={(e) => setEditForm({ ...editForm, costPerUnit: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setEditItem(null)}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                إلغاء
              </button>
              <button onClick={handleEdit}
                className="flex-1 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
                حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refill Modal */}
      {refillItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setRefillItem(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">📦 إعادة تخزين: {refillItem.itemName}</h3>
              <button onClick={() => setRefillItem(null)} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">🔢 الكمية * ({getUnitLabel(refillItem.unit)})</label>
                <input type="number" min="1" placeholder="أدخل الكمية" value={refillForm.quantity}
                  onChange={(e) => setRefillForm({ ...refillForm, quantity: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">💰 تكلفة الشراء</label>
                <input type="number" step="0.01" min="0" placeholder="0.00" value={refillForm.cost}
                  onChange={(e) => setRefillForm({ ...refillForm, cost: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">🏭 المورد</label>
                <input type="text" placeholder="اسم المورد" value={refillForm.supplier}
                  onChange={(e) => setRefillForm({ ...refillForm, supplier: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">📝 ملاحظات</label>
                <textarea placeholder="ملاحظات..." value={refillForm.notes} rows={2}
                  onChange={(e) => setRefillForm({ ...refillForm, notes: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
              </div>
              <button
                onClick={handleRefill}
                disabled={refilling || !refillForm.quantity}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {refilling ? 'جاري...' : 'تأكيد إعادة التخزين'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

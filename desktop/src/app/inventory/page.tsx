'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { api, isApiError } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonSummary, Skeleton } from '@/components/ui/Skeleton';
import { StaggerChildren } from '@/components/ui/PageTransition';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Search, Plus, Package, AlertTriangle, Tags,
  Barcode, Pencil, Trash2, X, ChevronLeft, ChevronRight,
  History, Boxes, ArrowUpDown, RefreshCcw, LayoutGrid, List,
  Warehouse, DollarSign, Filter, PackagePlus, Inbox,
} from 'lucide-react';
import type { InventoryItem, InventoryCategory, InventorySummary, StockMovement } from '@/types';

type ViewMode = 'table' | 'grid';
type SortField = 'name' | 'currentQty' | 'costPerUnit' | 'category';
type SortOrder = 'asc' | 'desc';

const STOCK_LEVELS = { critical: 0.25, low: 0.75, ok: 1.0 } as const;
const limit = 20;

function getStockLevel(item: InventoryItem): { label: string; variant: 'danger' | 'warning' | 'success' } {
  if (item.minQty <= 0) return { label: 'غير محدد', variant: 'success' };
  const ratio = item.currentQty / item.minQty;
  if (ratio <= STOCK_LEVELS.critical) return { label: 'حرج', variant: 'danger' };
  if (ratio <= STOCK_LEVELS.low) return { label: 'منخفض', variant: 'warning' };
  return { label: 'جيد', variant: 'success' };
}

function CategoryPill({ category, active, onClick }: {
  category: InventoryCategory | null; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150',
        active ? 'bg-copper-700 text-white shadow-sm' : 'bg-surface-secondary text-text-secondary hover:bg-surface-hover'
      )}>
      {category?.icon && <span>{category.icon}</span>}
      {category?.name || 'All'}
    </button>
  );
}

function MovementBadge({ type }: { type: string }) {
  const variants: Record<string, 'success' | 'danger' | 'warning' | 'info'> = {
    IN: 'success', OUT: 'danger', ADJUSTMENT: 'warning', TRANSFER: 'info', RETURN: 'info', WASTE: 'danger',
  };
  const labels: Record<string, string> = {
    IN: 'Add', OUT: 'Use', ADJUSTMENT: 'Adjust', TRANSFER: 'Transfer', RETURN: 'Return', WASTE: 'Waste',
  };
  return <Badge variant={variants[type] || 'default'}>{labels[type] || type}</Badge>;
}

function SummaryCard({ icon: Icon, label, value, variant = 'default' }: {
  icon: React.ElementType; label: string; value: string | number; variant?: 'default' | 'warning';
}) {
  return (
    <Card hover>
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg',
          variant === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-copper-100 text-copper-700 dark:bg-copper-900/30 dark:text-copper-400'
        )}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-text-tertiary">{label}</p>
          <p className={cn('text-lg font-semibold tabular-nums', variant === 'warning' ? 'text-amber-700 dark:text-amber-400' : 'text-text-primary dark:text-dark-text-primary')}>
            {value}
          </p>
        </div>
      </div>
    </Card>
  );
}

function SortHeader({ field, current, order, onClick, children }: {
  field: SortField; current: SortField; order: SortOrder; onClick: (f: SortField) => void; children: React.ReactNode;
}) {
  const active = field === current;
  return (
    <th className="cursor-pointer px-4 py-3 select-none transition hover:text-text-primary" onClick={() => onClick(field)} aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : undefined}>
      <div className="flex items-center gap-1 text-xs font-medium uppercase text-text-tertiary">
        {children}
        <ArrowUpDown className={cn('h-3 w-3', active && 'text-copper-700')} />
      </div>
    </th>
  );
}

function StockBadge({ level }: { level: ReturnType<typeof getStockLevel> }) {
  return <Badge variant={level.variant} dot>{level.label}</Badge>;
}

const InventoryCard = memo(function InventoryCard({ item, onEdit, onAdjust, onMovements }: {
  item: InventoryItem; onEdit: () => void; onAdjust: () => void; onMovements: () => void;
}) {
  const level = getStockLevel(item);
  return (
    <Card hover className="group">
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-copper-100 text-copper-700 dark:bg-copper-900/30 dark:text-copper-400">
          <Package className="h-5 w-5" />
        </div>
        <StockBadge level={level} />
      </div>
      <h3 className="mt-3 text-sm font-medium text-text-primary">{item.name}</h3>
      {item.sku && <p className="text-xs text-text-tertiary">SKU: {item.sku}</p>}
      {item.barcode && (
        <p className="mt-1 inline-flex items-center gap-1 rounded bg-surface-secondary px-2 py-0.5 text-xs text-text-tertiary font-mono">
          <Barcode className="h-3 w-3" />{item.barcode}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <div>
          <p className={cn('text-lg font-semibold tabular-nums', level.variant === 'danger' ? 'text-red-600 dark:text-red-400' : level.variant === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-text-primary')}>
            {item.currentQty}
          </p>
          <p className="text-xs text-text-tertiary">{item.unit} / min: {item.minQty}</p>
        </div>
        <p className="text-sm text-text-secondary tabular-nums">{formatCurrency(item.costPerUnit)}/unit</p>
      </div>
      {item.minQty > 0 && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary dark:bg-dark-surface-secondary">
          <div className={cn('h-full rounded-full transition-all duration-300', level.variant === 'danger' ? 'bg-red-500' : level.variant === 'warning' ? 'bg-amber-500' : 'bg-emerald-500')}
            style={{ width: `${Math.min(100, (item.currentQty / item.minQty) * 100)}%` }} />
        </div>
      )}
      {item.category && <p className="mt-2 text-xs text-text-tertiary">{item.category}</p>}
      <div className="mt-3 flex items-center gap-1 border-t border-border pt-3 opacity-0 transition group-hover:opacity-100">
        <button onClick={onMovements} className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary" aria-label="View movements"><History className="h-4 w-4" /></button>
        <button onClick={onAdjust} className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary" aria-label="Adjust stock"><PackagePlus className="h-4 w-4" /></button>
        <button onClick={onEdit} className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary" aria-label="Edit item"><Pencil className="h-4 w-4" /></button>
      </div>
    </Card>
  );
});

// ─── Main Page ───────────────────────────────────────────────

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showLowStock, setShowLowStock] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [itemModal, setItemModal] = useState<{ open: boolean; item?: InventoryItem }>({ open: false });
  const [adjustModal, setAdjustModal] = useState<{ open: boolean; item?: InventoryItem }>({ open: false });
  const [movementsModal, setMovementsModal] = useState<{ open: boolean; item?: InventoryItem }>({ open: false });
  const [categoryModal, setCategoryModal] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, cats, sum] = await Promise.all([
        api.inventory.items.list({ page, limit, search: search || undefined, categoryId: selectedCategory || undefined, lowStock: showLowStock || undefined }),
        api.inventory.categories.list(),
        api.inventory.summary(),
      ]);
      setItems(itemsRes.items);
      setTotalPages(itemsRes.totalPages);
      setTotal(itemsRes.total);
      setCategories(cats);
      setSummary(sum);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedCategory, showLowStock]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortOrder('asc'); }
  };

  const sortedItems = [...items].sort((a, b) => {
    const dir = sortOrder === 'asc' ? 1 : -1;
    switch (sortField) {
      case 'name': return a.name.localeCompare(b.name) * dir;
      case 'currentQty': return (a.currentQty - b.currentQty) * dir;
      case 'costPerUnit': return (a.costPerUnit - b.costPerUnit) * dir;
      case 'category': return (a.category || '').localeCompare(b.category || '') * dir;
      default: return 0;
    }
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Inventory</h2>
          <p className="mt-0.5 text-sm text-text-secondary">Manage stock, categories, and suppliers</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setCategoryModal(true)}>
            <Tags className="h-4 w-4" />Categories
          </Button>
          <Button onClick={() => setItemModal({ open: true })}>
            <Plus className="h-4 w-4" />Add Item
          </Button>
        </div>
      </div>

      {/* Summary */}
      {loading ? <SkeletonSummary cards={4} /> : summary && (
        <StaggerChildren className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard icon={Boxes} label="Total Items" value={summary.totalItems} />
          <SummaryCard icon={AlertTriangle} label="Low Stock" value={summary.lowStockItems} variant={summary.lowStockItems > 0 ? 'warning' : 'default'} />
          <SummaryCard icon={DollarSign} label="Inventory Value" value={formatCurrency(summary.totalValue)} />
          <SummaryCard icon={Tags} label="Categories" value={summary.totalCategories} />
        </StaggerChildren>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 animate-fade-in-up">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search items by name or SKU..."
            className="h-10 w-full rounded-lg border border-border bg-surface pl-3 pr-10 text-sm text-text-primary placeholder:text-text-tertiary hover:border-copper-400 focus:border-copper-700 focus:outline-none focus:ring-2 focus:ring-copper-200 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text-primary"
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1); }} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <CategoryPill category={null} active={!selectedCategory} onClick={() => setSelectedCategory(null)} />
          {categories.map((cat) => (
            <CategoryPill key={cat.id} category={cat} active={selectedCategory === cat.id} onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)} />
          ))}
        </div>
        <div className="flex items-center gap-2 mr-auto">
          <button onClick={() => { setShowLowStock(!showLowStock); setPage(1); }}
            className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
              showLowStock ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-surface-secondary text-text-secondary hover:bg-surface-hover'
          )}>
            <AlertTriangle className="h-3.5 w-3.5" />Low Stock Only
          </button>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button onClick={() => setViewMode('table')}
              className={cn('p-2 transition', viewMode === 'table' ? 'bg-copper-700 text-white' : 'text-text-secondary hover:bg-surface-hover')} aria-label="Table view">
              <List className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode('grid')}
              className={cn('p-2 transition', viewMode === 'grid' ? 'bg-copper-700 text-white' : 'text-text-secondary hover:bg-surface-hover')} aria-label="Grid view">
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchData} aria-label="Refresh">
            <RefreshCcw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <p className="text-sm text-text-tertiary tabular-nums">{total} item{total !== 1 ? 's' : ''}{showLowStock && ' (low stock filter)'}</p>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="animate-fade-in rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">{error}</div>
      )}

      {/* Empty */}
      {!loading && !error && items.length === 0 && (
        <EmptyState icon="inbox" title="No items found"
          description={search ? 'Try a different search term' : 'Add your first inventory item'}
          action={!search ? { label: 'Add Item', onClick: () => setItemModal({ open: true }) } : undefined} />
      )}

      {/* Table View */}
      {!loading && !error && items.length > 0 && viewMode === 'table' && (
        <div className="animate-fade-in-up overflow-hidden rounded-xl border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-secondary text-left text-xs font-medium uppercase text-text-tertiary">
                <SortHeader field="name" current={sortField} order={sortOrder} onClick={toggleSort}>Item</SortHeader>
                <th className="px-4 py-3">Category</th>
                <SortHeader field="currentQty" current={sortField} order={sortOrder} onClick={toggleSort}>Stock</SortHeader>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Unit</th>
                <SortHeader field="costPerUnit" current={sortField} order={sortOrder} onClick={toggleSort}>Cost</SortHeader>
                <th className="px-4 py-3">Barcode</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => (
                <tr key={item.id} className="border-b border-border transition hover:bg-surface-hover/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-copper-100 text-copper-700 dark:bg-copper-900/30 dark:text-copper-400">
                        <Package className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">{item.name}</p>
                        {item.sku && <p className="text-xs text-text-tertiary">SKU: {item.sku}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{item.category || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm font-medium tabular-nums', item.currentQty <= item.minQty ? 'text-red-600' : item.currentQty <= item.minQty * 1.5 ? 'text-amber-600' : 'text-text-primary')}>
                        {item.currentQty}
                      </span>
                      <span className="text-xs text-text-tertiary">/ {item.minQty}</span>
                      {item.minQty > 0 && (
                        <div className="ml-2 h-1.5 w-16 overflow-hidden rounded-full bg-surface-secondary dark:bg-dark-surface-secondary">
                          <div className={cn('h-full rounded-full transition-all duration-300', item.currentQty / item.minQty <= 0.25 ? 'bg-red-500' : item.currentQty / item.minQty <= 0.75 ? 'bg-amber-500' : 'bg-emerald-500')}
                            style={{ width: `${Math.min(100, (item.currentQty / item.minQty) * 100)}%` }} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3"><StockBadge level={getStockLevel(item)} /></td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{item.unit}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary tabular-nums">{formatCurrency(item.costPerUnit)}</td>
                  <td className="px-4 py-3">
                    {item.barcode ? (
                      <span className="inline-flex items-center gap-1 rounded bg-surface-secondary px-2 py-0.5 text-xs text-text-tertiary font-mono"><Barcode className="h-3 w-3" />{item.barcode}</span>
                    ) : <span className="text-text-tertiary text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setMovementsModal({ open: true, item })} className="rounded-lg p-1.5 text-text-tertiary transition hover:bg-surface-hover hover:text-text-primary" aria-label="View movements"><History className="h-4 w-4" /></button>
                      <button onClick={() => setAdjustModal({ open: true, item })} className="rounded-lg p-1.5 text-text-tertiary transition hover:bg-surface-hover hover:text-text-primary" aria-label="Adjust stock"><PackagePlus className="h-4 w-4" /></button>
                      <button onClick={() => setItemModal({ open: true, item })} className="rounded-lg p-1.5 text-text-tertiary transition hover:bg-surface-hover hover:text-text-primary" aria-label="Edit item"><Pencil className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Grid View */}
      {!loading && !error && items.length > 0 && viewMode === 'grid' && (
        <StaggerChildren className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sortedItems.map((item) => (
            <InventoryCard key={item.id} item={item}
              onEdit={() => setItemModal({ open: true, item })}
              onAdjust={() => setAdjustModal({ open: true, item })}
              onMovements={() => setMovementsModal({ open: true, item })} />
          ))}
        </StaggerChildren>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between animate-fade-in">
          <p className="text-sm text-text-tertiary tabular-nums">Page {page} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronRight className="h-4 w-4" />Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                if (p > totalPages) return null;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition',
                      p === page ? 'bg-copper-700 text-white' : 'text-text-secondary hover:bg-surface-hover'
                    )}>{p}</button>
                );
              })}
            </div>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next<ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── MODALS ─────────────────────────────────────────── */}
      <ItemFormModal open={itemModal.open} item={itemModal.item} categories={categories} onClose={() => setItemModal({ open: false })} onSaved={fetchData} />
      <AdjustStockModal open={adjustModal.open} item={adjustModal.item} onClose={() => setAdjustModal({ open: false })} onSaved={fetchData} />
      <MovementsModal open={movementsModal.open} item={movementsModal.item} onClose={() => setMovementsModal({ open: false })} />
      <CategoryManagerModal open={categoryModal} categories={categories} onClose={() => setCategoryModal(false)} onSaved={fetchData} />
    </div>
  );
}

// ─── Item Form Modal ─────────────────────────────────────────

function ItemFormModal({ open, item, categories, onClose, onSaved }: {
  open: boolean; item?: InventoryItem; categories: InventoryCategory[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ name: '', sku: '', category: '', unit: 'piece', purchaseUnit: '', consumptionUnit: '', conversionRatio: 1, currentQty: 0, minQty: 0, maxQty: 0, costPerUnit: 0, barcode: '', location: '', inventoryCategoryId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setForm({ name: item.name, sku: item.sku || '', category: item.category || '', unit: item.unit, purchaseUnit: item.purchaseUnit || '', consumptionUnit: item.consumptionUnit || '', conversionRatio: item.conversionRatio, currentQty: item.currentQty, minQty: item.minQty, maxQty: item.maxQty, costPerUnit: item.costPerUnit, barcode: item.barcode || '', location: item.location || '', inventoryCategoryId: item.inventoryCategoryId || '' });
    } else {
      setForm({ name: '', sku: '', category: '', unit: 'piece', purchaseUnit: '', consumptionUnit: '', conversionRatio: 1, currentQty: 0, minQty: 0, maxQty: 0, costPerUnit: 0, barcode: '', location: '', inventoryCategoryId: '' });
    }
    setError(null);
  }, [item, open]);

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const data = { name: form.name, sku: form.sku || null, category: form.category || null, unit: form.unit || 'piece', purchaseUnit: form.purchaseUnit || null, consumptionUnit: form.consumptionUnit || null, conversionRatio: form.conversionRatio || 1, currentQty: form.currentQty, minQty: form.minQty || 0, maxQty: form.maxQty || 0, costPerUnit: form.costPerUnit, barcode: form.barcode || null, location: form.location || null, inventoryCategoryId: form.inventoryCategoryId || null };
      if (item) { await api.inventory.items.update(item.id, { ...data, id: item.id, cafeId: item.cafeId, version: item.version }); }
      else { await api.inventory.items.create(data); }
      onSaved(); onClose();
    } catch (err) { setError(isApiError(err) ? err.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={item ? 'Edit Item' : 'Add Item'} size="lg">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2"><Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Item name" /></div>
        <Input label="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Optional" />
        <Input label="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Optional" icon={<Barcode className="h-4 w-4" />} />
        <Input label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Dairy" />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">Inventory Category</label>
          <select value={form.inventoryCategoryId} onChange={(e) => setForm({ ...form, inventoryCategoryId: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text-primary hover:border-copper-400 focus:border-copper-700 focus:outline-none focus:ring-2 focus:ring-copper-200 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text-primary">
            <option value="">None</option>
            {categories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>))}
          </select>
        </div>
        <Input label="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="piece, kg, L" />
        <Input label="Purchase Unit" value={form.purchaseUnit} onChange={(e) => setForm({ ...form, purchaseUnit: e.target.value })} placeholder="e.g. box" />
        <Input label="Consumption Unit" value={form.consumptionUnit} onChange={(e) => setForm({ ...form, consumptionUnit: e.target.value })} placeholder="e.g. piece" />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">Conversion Ratio</label>
          <input type="number" step="0.01" min="0.01" value={form.conversionRatio} onChange={(e) => setForm({ ...form, conversionRatio: parseFloat(e.target.value) || 1 })}
            className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary hover:border-copper-400 focus:border-copper-700 focus:outline-none focus:ring-2 focus:ring-copper-200 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text-primary" />
        </div>
        <Input label="Current Qty" type="number" step="0.01" value={form.currentQty} onChange={(e) => setForm({ ...form, currentQty: parseFloat(e.target.value) || 0 })} />
        <Input label="Min Qty" type="number" step="0.01" value={form.minQty} onChange={(e) => setForm({ ...form, minQty: parseFloat(e.target.value) || 0 })} />
        <Input label="Max Qty" type="number" step="0.01" value={form.maxQty} onChange={(e) => setForm({ ...form, maxQty: parseFloat(e.target.value) || 0 })} />
        <Input label="Cost per Unit (cents)" type="number" min="0" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: parseInt(e.target.value) || 0 })} />
        <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Shelf A3" icon={<Warehouse className="h-4 w-4" />} />
      </div>
      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} loading={saving}>{item ? 'Save Changes' : 'Create Item'}</Button>
      </div>
    </Modal>
  );
}

// ─── Adjust Stock Modal ──────────────────────────────────────

function AdjustStockModal({ open, item, onClose, onSaved }: {
  open: boolean; item?: InventoryItem; onClose: () => void; onSaved: () => void;
}) {
  const [movementType, setMovementType] = useState('IN');
  const [quantity, setQuantity] = useState(0);
  const [notes, setNotes] = useState('');
  const [costPerUnit, setCostPerUnit] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (item) { setQuantity(0); setMovementType('IN'); setNotes(''); setCostPerUnit(null); setError(null); } }, [item, open]);

  const handleSubmit = async () => {
    if (!item || quantity === 0) { setError('Quantity must not be zero'); return; }
    setSaving(true); setError(null);
    try {
      const delta = movementType === 'IN' || movementType === 'RETURN' ? quantity : -quantity;
      await api.inventory.items.adjust({ itemId: item.id, itemVersion: item.version, quantity: delta, movementType, notes: notes || null, costPerUnit: movementType === 'IN' ? costPerUnit : null });
      onSaved(); onClose();
    } catch (err) { setError(isApiError(err) ? err.message : 'Failed to adjust stock'); }
    finally { setSaving(false); }
  };

  const types = [
    { value: 'IN', label: 'Add Stock', desc: 'Receive new inventory' },
    { value: 'OUT', label: 'Remove Stock', desc: 'Use or sell inventory' },
    { value: 'ADJUSTMENT', label: 'Adjustment', desc: 'Correct count discrepancy' },
    { value: 'WASTE', label: 'Waste', desc: 'Damaged or expired' },
    { value: 'TRANSFER', label: 'Transfer', desc: 'Move to another location' },
    { value: 'RETURN', label: 'Return', desc: 'Return from customer/supplier' },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Adjust Stock" size="md">
      {item && (
        <div className="space-y-4">
          <div className="rounded-lg bg-surface-secondary p-3 dark:bg-dark-surface-secondary">
            <p className="text-sm font-medium text-text-primary">{item.name}</p>
            <p className="text-xs text-text-tertiary">Current: <strong className="tabular-nums">{item.currentQty}</strong> {item.unit}</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Movement Type</label>
            <div className="grid grid-cols-2 gap-2">
              {types.map((t) => (
                <button key={t.value} onClick={() => setMovementType(t.value)}
                  className={cn('rounded-lg border-2 p-3 text-left transition-all duration-150', movementType === t.value ? 'border-copper-500 bg-copper-50 dark:bg-copper-900/20' : 'border-border hover:border-copper-300')}>
                  <p className="text-sm font-medium text-text-primary">{t.label}</p>
                  <p className="text-xs text-text-tertiary">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>
          {movementType === 'IN' && (
            <Input label="Cost per Unit (cents)" type="number" min="0" value={costPerUnit ?? 0} onChange={(e) => setCostPerUnit(parseInt(e.target.value) || 0)} />
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Quantity</label>
            <div className="flex items-center gap-2">
              <button onClick={() => setQuantity(Math.max(0, quantity - 1))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border hover:bg-surface-hover">−</button>
              <input type="number" step="0.01" min="0" value={quantity} onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-center text-lg font-semibold text-text-primary hover:border-copper-400 focus:border-copper-700 focus:outline-none focus:ring-2 focus:ring-copper-200 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text-primary" />
              <button onClick={() => setQuantity(quantity + 1)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border hover:bg-surface-hover">+</button>
            </div>
          </div>
          <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for adjustment..." />
          <div className="rounded-lg bg-surface-secondary p-3 text-sm dark:bg-dark-surface-secondary">
            <span className="text-text-secondary">New quantity will be: </span>
            <strong className="text-text-primary tabular-nums">
              {movementType === 'IN' || movementType === 'RETURN' ? item.currentQty + quantity : item.currentQty - quantity}
            </strong>
            <span className="text-text-tertiary"> {item.unit}</span>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} loading={saving}>Apply</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Movements Modal ─────────────────────────────────────────

function MovementsModal({ open, item, onClose }: {
  open: boolean; item?: InventoryItem; onClose: () => void;
}) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [movementPage, setMovementPage] = useState(1);
  const [movementTotal, setMovementTotal] = useState(0);

  useEffect(() => {
    if (!open || !item) return;
    setLoading(true);
    api.inventory.items.movements(item.id, { page: movementPage, limit: 10 })
      .then((res) => { setMovements(res.items); setMovementTotal(res.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, item, movementPage]);

  return (
    <Modal open={open} onClose={onClose} title={`Stock Movements: ${item?.name || ''}`} size="lg">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper-600 border-t-transparent" />
        </div>
      ) : movements.length === 0 ? (
        <div className="py-12 text-center text-sm text-text-tertiary">No movements recorded</div>
      ) : (
        <div className="space-y-3">
          {movements.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <MovementBadge type={m.movementType} />
                <div>
                  <p className="text-sm text-text-primary tabular-nums">
                    {m.movementType === 'IN' || m.movementType === 'RETURN' ? '+' : ''}{m.quantity} {item?.unit}
                  </p>
                  <p className="text-xs text-text-tertiary">{m.previousQty} → {m.newQty}{m.notes && ` · ${m.notes}`}</p>
                </div>
              </div>
              <div className="text-right text-xs text-text-tertiary">
                <p>{new Date(m.createdAt).toLocaleDateString('ar-EG')}</p>
                <p>{new Date(m.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          ))}
          {movementTotal > 10 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button disabled={movementPage <= 1} onClick={() => setMovementPage((p) => p - 1)}
                className="rounded-lg px-3 py-1 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-30">Previous</button>
              <span className="text-xs text-text-tertiary">{movementPage}</span>
              <button disabled={movementPage * 10 >= movementTotal} onClick={() => setMovementPage((p) => p + 1)}
                className="rounded-lg px-3 py-1 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-30">Next</button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ─── Category Manager Modal ──────────────────────────────────

function CategoryManagerModal({ open, categories, onClose, onSaved }: {
  open: boolean; categories: InventoryCategory[]; onClose: () => void; onSaved: () => void;
}) {
  const [editing, setEditing] = useState<InventoryCategory | null>(null);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('');
  const [newColor, setNewColor] = useState('#8C6239');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try { await api.inventory.categories.create({ name: newName, icon: newIcon || undefined, color: newColor || undefined }); setNewName(''); setNewIcon(''); setNewColor('#8C6239'); onSaved(); }
    catch { /* ignore */ }
    setSaving(false);
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setSaving(true);
    try { await api.inventory.categories.update(editing.id, { name: editing.name, icon: editing.icon || undefined, color: editing.color || undefined, sortOrder: editing.sortOrder, version: editing.version }); setEditing(null); onSaved(); }
    catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async (cat: InventoryCategory) => {
    try { await api.inventory.categories.delete(cat.id, cat.version); onSaved(); }
    catch { /* ignore */ }
  };

  return (
    <Modal open={open} onClose={onClose} title="Inventory Categories" size="md">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <input value={newIcon} onChange={(e) => setNewIcon(e.target.value)} placeholder="icon" className="h-10 w-14 rounded-lg border border-border bg-surface px-2 text-center text-sm hover:border-copper-400 focus:border-copper-700 focus:outline-none focus:ring-2 focus:ring-copper-200 dark:border-dark-border dark:bg-dark-surface" />
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Category name"
            className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm hover:border-copper-400 focus:border-copper-700 focus:outline-none focus:ring-2 focus:ring-copper-200 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text-primary"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-10 w-10 rounded-lg border border-border" />
          <Button size="sm" onClick={handleCreate} loading={saving}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="max-h-64 space-y-1 overflow-auto scrollbar-thin">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-surface-hover dark:hover:bg-dark-surface-hover">
              {editing?.id === cat.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input value={editing.icon || ''} onChange={(e) => setEditing({ ...editing, icon: e.target.value || null })} className="h-8 w-12 rounded border border-border bg-surface px-1 text-center text-sm dark:border-dark-border dark:bg-dark-surface" />
                  <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-8 flex-1 rounded border border-border bg-surface px-2 text-sm dark:border-dark-border dark:bg-dark-surface dark:text-dark-text-primary" onKeyDown={(e) => e.key === 'Enter' && handleUpdate()} />
                  <Button size="sm" variant="primary" onClick={handleUpdate}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cat.icon}</span>
                    <span className="text-sm text-text-primary">{cat.name}</span>
                    <span className="text-xs text-text-tertiary">({cat.sortOrder})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(cat)} className="rounded p-1 text-text-tertiary hover:text-text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => handleDelete(cat)} className="rounded p-1 text-text-tertiary hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

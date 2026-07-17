'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Card, CardDescription } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonSummary, Skeleton } from '@/components/ui/Skeleton';
import { StaggerChildren } from '@/components/ui/PageTransition';
import { VirtualTable } from '@/components/ui/VirtualList';
import { useDebounce } from '@/hooks/useDebounce';
import type { Customer, NewCustomer, UpdateCustomer } from '@/types';
import { Users, Plus, Search, Pencil, Trash2 } from 'lucide-react';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState<Customer | null>(null);
  const [showDelete, setShowDelete] = useState<{ id: string; name: string; version: number } | null>(null);

  const fetchCustomers = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.customers.list(q ? { search: q } : undefined);
      setCustomers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  useEffect(() => {
    fetchCustomers(debouncedSearch || undefined);
  }, [debouncedSearch, fetchCustomers]);

  const summary = useMemo(() => {
    const total = customers.length;
    const totalSpent = customers.reduce((s, c) => s + c.totalSpent, 0);
    const topSpender = customers.reduce<Customer | null>((best, c) =>
      !best || c.totalSpent > best.totalSpent ? c : best, null);
    return { total, totalSpent, topSpender };
  }, [customers]);

  const renderRow = useCallback((customer: Customer) => (
    <div className="flex h-14 items-center border-b border-border px-4 text-sm hover:bg-surface-hover/50 transition-colors">
      <div className="flex-1 font-medium text-text-primary">{customer.name}</div>
      <div className="flex-1 text-text-secondary">{customer.phone || '—'}</div>
      <div className="flex-1 text-text-secondary">{customer.email || '—'}</div>
      <div className="w-20">
        <Badge variant="default">{customer.totalOrders}</Badge>
      </div>
      <div className="w-28 text-text-primary tabular-nums">
        EGP {customer.totalSpent.toLocaleString()}
      </div>
      <div className="w-28 text-text-secondary">
        {customer.lastVisit
          ? new Date(customer.lastVisit).toLocaleDateString('ar-EG')
          : '—'}
      </div>
      <div className="flex w-24 gap-1 justify-end">
        <Button size="sm" variant="ghost" onClick={() => setShowEdit(customer)} aria-label={`Edit ${customer.name}`}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowDelete({ id: customer.id, name: customer.name, version: customer.version })}
          aria-label={`Delete ${customer.name}`}
          className="text-red-500 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  ), []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Customers</h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            Manage your customer relationships and order history.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" />
          Add Customer
        </Button>
      </div>

      {/* Summary Cards */}
      {loading ? (
        <SkeletonSummary cards={3} />
      ) : (
        <StaggerChildren className="grid gap-4 sm:grid-cols-3">
          <Card className="animate-fade-in-up">
            <CardDescription>Total Customers</CardDescription>
            <Card className="mt-1 text-2xl font-semibold tabular-nums">{summary.total}</Card>
          </Card>
          <Card className="animate-fade-in-up stagger-1">
            <CardDescription>Total Spent</CardDescription>
            <Card className="mt-1 text-2xl font-semibold tabular-nums">
              EGP {summary.totalSpent.toLocaleString()}
            </Card>
          </Card>
          <Card className="animate-fade-in-up stagger-2">
            <CardDescription>Top Spender</CardDescription>
            <Card className="mt-1 text-lg font-semibold">
              {summary.topSpender ? summary.topSpender.name : '—'}
            </Card>
            {summary.topSpender && (
              <p className="text-xs text-text-secondary tabular-nums">
                EGP {summary.topSpender.totalSpent.toLocaleString()}
              </p>
            )}
          </Card>
        </StaggerChildren>
      )}

      {/* Search */}
      <div className="flex items-center gap-3 animate-fade-in-up stagger-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
            icon={<Search className="h-4 w-4" />}
          />
        </div>
        <p className="text-sm text-text-tertiary tabular-nums">
          {customers.length} customer{customers.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="animate-fade-in rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      {!error && (
        <div className="animate-fade-in-up stagger-4">
          <VirtualTable
            items={customers}
            rowHeight={56}
            renderRow={renderRow}
            loading={loading}
            header={
              <div className="flex h-11 items-center border-b border-border bg-surface-secondary px-4 text-xs font-medium uppercase text-text-tertiary">
                <div className="flex-1">Name</div>
                <div className="flex-1">Phone</div>
                <div className="flex-1">Email</div>
                <div className="w-20">Orders</div>
                <div className="w-28">Total Spent</div>
                <div className="w-28">Last Visit</div>
                <div className="w-24" />
              </div>
            }
            emptyState={
              <EmptyState
                icon="users"
                title="No customers yet"
                description={
                  debouncedSearch
                    ? 'Try a different search term'
                    : 'Add your first customer to get started.'
                }
                action={!debouncedSearch ? { label: 'Add Customer', onClick: () => setShowAdd(true) } : undefined}
              />
            }
          />
        </div>
      )}

      {/* Add Modal */}
      <CustomerFormModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={() => { setShowAdd(false); fetchCustomers(search || undefined); }}
      />

      {/* Edit Modal */}
      {showEdit && (
        <CustomerFormModal
          open={true}
          customer={showEdit}
          onClose={() => setShowEdit(null)}
          onSaved={() => { setShowEdit(null); fetchCustomers(search || undefined); }}
        />
      )}

      {/* Delete Confirmation */}
      <Modal open={!!showDelete} onClose={() => setShowDelete(null)} title="Delete Customer">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            Are you sure you want to delete <span className="font-medium text-text-primary">{showDelete?.name}</span>?
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!showDelete) return;
                try {
                  await api.customers.delete(showDelete.id, showDelete.version);
                  setShowDelete(null);
                  fetchCustomers(search || undefined);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Failed to delete');
                }
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Customer Form Modal ──────────────────────────────────────

function CustomerFormModal({
  open,
  customer,
  onClose,
  onSaved,
}: {
  open: boolean;
  customer?: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [address, setAddress] = useState(customer?.address || '');
  const [notes, setNotes] = useState(customer?.notes || '');
  const [tags, setTags] = useState(customer?.tags || '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isEdit = !!customer;

  const handleSubmit = async () => {
    if (!name.trim()) { setFormError('Name is required'); return; }
    setSaving(true);
    setFormError(null);
    try {
      if (isEdit) {
        await api.customers.update(customer.id, {
          id: customer.id, cafeId: customer.cafeId, version: customer.version,
          name: name.trim(), phone: phone || null, email: email || null,
          address: address || null, notes: notes || null, tags: tags || null,
        } as UpdateCustomer);
      } else {
        await api.customers.create({
          name: name.trim(), phone: phone || null, email: email || null,
          address: address || null, notes: notes || null, tags: tags || null,
        } as NewCustomer);
      }
      onSaved();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Customer' : 'Add Customer'}>
      <div className="flex flex-col gap-4">
        {formError && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{formError}</div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" />
          </div>
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+20 100 000 0000" />
          <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
          <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" />
          <Input label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="regular, vip, ..." />
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Notes</label>
            <textarea
              className="w-full min-h-[64px] resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary hover:border-copper-400 focus:border-copper-700 focus:outline-none focus:ring-2 focus:ring-copper-200"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={saving}>
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store';
import { useSocket } from '@/hooks/useSocket';
import { useInitialLoad } from '@/hooks/useOrders';
import api from '@/lib/api';
import { Order } from '@/types';
import { Search, Filter, ChevronDown } from 'lucide-react';

const STATUS_FILTERS = ['ALL', 'NEW', 'CONFIRMED', 'READY', 'PICKED_UP', 'DELIVERED', 'PAID', 'CLOSED', 'CANCELLED'];
const PAYMENT_FILTERS = ['ALL', 'UNPAID', 'PARTIAL_PAYMENT', 'PAID', 'REFUNDED'];

export default function OwnerOrdersPage() {
  useSocket('/owner');
  const { loading } = useInitialLoad('owner');
  const orders = useAppStore((s) => Object.values(s.orders));
  const orderIds = useAppStore((s) => s.orderIds);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const filtered = orders
    .filter((o) => statusFilter === 'ALL' || o.status === statusFilter)
    .filter((o) => paymentFilter === 'ALL' || o.paymentStatus === paymentFilter)
    .filter((o) => !search || o.code.toLowerCase().includes(search.toLowerCase()) || o.customer?.phone?.includes(search));

  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    await api.patch(`/orders/${orderId}/status`, { status: newStatus });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-violet-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by order code or phone..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
          />
        </div>

        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="appearance-none rounded-lg border border-gray-200 px-3 py-2 pr-8 text-sm focus:border-violet-400 focus:outline-none"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>

        <div className="relative">
          <select
            value={paymentFilter}
            onChange={(e) => { setPaymentFilter(e.target.value); setPage(1); }}
            className="appearance-none rounded-lg border border-gray-200 px-3 py-2 pr-8 text-sm focus:border-violet-400 focus:outline-none"
          >
            {PAYMENT_FILTERS.map((p) => (
              <option key={p} value={p}>{p === 'ALL' ? 'All Payments' : p.replace('_', ' ')}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>

        <span className="text-xs text-gray-400">{sorted.length} orders</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Driver</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((order) => (
              <tr key={order.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">#{order.code}</td>
                <td className="px-4 py-3 text-gray-600">{order.customer?.name || order.customer?.phone || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    order.status === 'NEW' ? 'bg-blue-100 text-blue-700' :
                    order.status === 'CONFIRMED' ? 'bg-amber-100 text-amber-700' :
                    order.status === 'READY' ? 'bg-green-100 text-green-700' :
                    order.status === 'PICKED_UP' ? 'bg-purple-100 text-purple-700' :
                    order.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700' :
                    order.status === 'PAID' ? 'bg-teal-100 text-teal-700' :
                    order.status === 'CLOSED' ? 'bg-gray-100 text-gray-700' :
                    'bg-red-100 text-red-700'
                  }`}>{order.status}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    order.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' :
                    order.paymentStatus === 'PARTIAL_PAYMENT' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{order.paymentStatus}</span>
                </td>
                <td className="px-4 py-3 font-medium text-gray-800">${Number(order.total).toFixed(2)}</td>
                <td className="px-4 py-3 text-gray-600">{order.driver?.name || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <select
                    value={order.status}
                    onChange={(e) => handleStatusChange(order.id, e.target.value)}
                    className="rounded border border-gray-200 px-2 py-1 text-xs focus:border-violet-400 focus:outline-none"
                  >
                    {['NEW', 'CONFIRMED', 'READY', 'PICKED_UP', 'DELIVERED', 'PAID', 'CLOSED', 'CANCELLED'].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">No orders found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-100 transition-colors"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-100 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import api from '@/lib/api';
import { Search, Phone } from 'lucide-react';

export default function OwnerCustomersPage() {
  useSocket('/owner');
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  useEffect(() => {
    api.get('/customers').then(({ data }) => {
      setCustomers(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => { setCustomers([]); setLoading(false); });
  }, []);

  const filtered = customers.filter((c) =>
    !search || c.phone?.includes(search) || c.name?.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-violet-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by name or phone..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
        </div>
        <span className="text-xs text-gray-400">{sorted.length} customers</span>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Total Orders</th>
              <th className="px-4 py-3">Total Spent</th>
              <th className="px-4 py-3">Unpaid</th>
              <th className="px-4 py-3">Last Order</th>
              <th className="px-4 py-3">Favorite</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">{c.name || '—'}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1 text-gray-600">
                    <Phone className="h-3 w-3" /> {c.phone}
                  </span>
                </td>
                <td className="px-4 py-3">{c.totalOrders ?? 0}</td>
                <td className="px-4 py-3 font-medium">${Number(c.totalSpent ?? 0).toFixed(2)}</td>
                <td className="px-4 py-3">
                  {Number(c.unpaidBalance ?? 0) > 0
                    ? <span className="text-red-600 font-medium">${Number(c.unpaidBalance).toFixed(2)}</span>
                    : <span className="text-gray-400">$0.00</span>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{c.favoriteDrink || '—'}</td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">No customers found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}
              className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-100 transition-colors">Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
              className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-100 transition-colors">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

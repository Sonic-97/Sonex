'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { useAppStore } from '@/store';
import api from '@/lib/api';
import { Search, DollarSign, CreditCard } from 'lucide-react';

export default function OwnerPaymentsPage() {
  useSocket('/owner');
  const [paymentLogs, setPaymentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/payments/logs').then(({ data }) => {
      setPaymentLogs(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => { setPaymentLogs([]); setLoading(false); });
  }, []);

  const filtered = paymentLogs.filter((l) =>
    !search || l.orderId?.toLowerCase().includes(search.toLowerCase()) || l.collectedBy?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
          <input type="text" placeholder="Search by order ID or collector..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
        </div>
        <span className="text-xs text-gray-400">{sorted.length} transactions</span>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-gray-500">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-medium uppercase">Total Collected</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-800">
            ${sorted.reduce((s, l) => s + Number(l.amount || 0), 0).toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-gray-500">
            <CreditCard className="h-4 w-4" />
            <span className="text-xs font-medium uppercase">Transactions</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-800">{sorted.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-gray-500">
            <span className="text-xs font-medium uppercase">Unique Collectors</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-800">
            {new Set(sorted.map((l) => l.collectedById).filter(Boolean)).size}
          </p>
        </div>
      </div>

      {/* Payment Log Table */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Status Change</th>
              <th className="px-4 py-3">Collected By</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 100).map((log) => (
              <tr key={log.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-gray-600">#{log.orderId?.slice(0, 8)}</td>
                <td className="px-4 py-3 font-medium text-gray-800">${Number(log.amount).toFixed(2)}</td>
                <td className="px-4 py-3 text-gray-600">{log.method || '—'}</td>
                <td className="px-4 py-3">
                  <span className="text-xs text-gray-500">{log.previousStatus} → {log.newStatus}</span>
                </td>
                <td className="px-4 py-3 text-gray-800">{log.collectedBy?.name || '—'}</td>
                <td className="px-4 py-3">
                  {log.collectedRole && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      log.collectedRole === 'BARISTA' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>{log.collectedRole}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{log.notes || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(log.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">No payment transactions found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

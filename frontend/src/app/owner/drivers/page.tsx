'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import api from '@/lib/api';
import { Search, Plus, DollarSign } from 'lucide-react';

export default function OwnerDriversPage() {
  useSocket('/owner');
  const [drivers, setDrivers] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });

  const loadData = async () => {
    const [d, s] = await Promise.all([
      api.get('/drivers'),
      api.get('/drivers/settlements/pending').catch(() => ({ data: [] })),
    ]);
    setDrivers(Array.isArray(d.data) ? d.data : []);
    setSettlements(Array.isArray(s.data) ? s.data : []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const filtered = drivers.filter((d) =>
    !search || d.name?.toLowerCase().includes(search.toLowerCase()) || d.phone?.includes(search)
  );

  const handleCreate = async () => {
    if (!form.name || !form.phone) return;
    await api.post('/drivers', form);
    setForm({ name: '', phone: '' });
    setShowForm(false);
    loadData();
  };

  const toggleActive = async (id: string, active: boolean) => {
    await api.patch(`/drivers/${id}`, { active: !active });
    setDrivers((prev) => prev.map((d) => d.id === id ? { ...d, active: !active } : d));
  };

  const approveSettlement = async (id: string) => {
    await api.patch(`/drivers/settlements/${id}/approve`, { approvedById: 'owner' });
    loadData();
  };

  const rejectSettlement = async (id: string) => {
    await api.patch(`/drivers/settlements/${id}/reject`, { reason: 'Rejected by owner' });
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-violet-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Drivers Table */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search drivers..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
          <Plus className="h-4 w-4" /> Add Driver
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <input type="text" placeholder="Name *" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
            <input type="text" placeholder="Phone *" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
            <button onClick={handleCreate}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
              Save
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Deliveries</th>
              <th className="px-4 py-3">Revenue</th>
              <th className="px-4 py-3">New Customers</th>
              <th className="px-4 py-3">Bonus</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">{d.name}</td>
                <td className="px-4 py-3 text-gray-600">{d.phone}</td>
                <td className="px-4 py-3">{d.totalDeliveries ?? 0}</td>
                <td className="px-4 py-3">${Number(d.totalRevenue ?? 0).toFixed(2)}</td>
                <td className="px-4 py-3">{d.newCustomersAcquired ?? 0}</td>
                <td className="px-4 py-3">
                  {d.bonusEligible
                    ? <span className="text-green-600 font-medium">Eligible</span>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${d.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {d.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(d.id, d.active)}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${d.active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                    {d.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">No drivers found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pending Settlements */}
      {settlements.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-gray-800 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-amber-500" />
            Pending Settlements
          </h2>
          <div className="overflow-hidden rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((st) => (
                  <tr key={st.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{st.driver?.name || st.driverId}</td>
                    <td className="px-4 py-3 font-medium">${Number(st.amount).toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-600">{st.notes || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(st.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => approveSettlement(st.id)}
                          className="rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-100 transition-colors">
                          Approve
                        </button>
                        <button onClick={() => rejectSettlement(st.id)}
                          className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors">
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

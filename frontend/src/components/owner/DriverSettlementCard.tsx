'use client';

import { useState, useEffect } from 'react';
import { fetchPendingSettlements, approveSettlement, rejectSettlement } from '@/lib/api';
import { CheckCircle, XCircle, DollarSign, Clock } from 'lucide-react';

interface Settlement {
  id: string;
  driverId: string;
  amount: number;
  status: string;
  notes?: string;
  createdAt: string;
  driver?: { id: string; name: string };
}

export function DriverSettlementCard() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPendingSettlements();
      setSettlements(data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      const userData = sessionStorage.getItem('sonic_user');
      const ownerId = userData ? (JSON.parse(userData).employeeId || '') : '';
      await approveSettlement(id, ownerId);
      setSettlements((prev) => prev.filter((s) => s.id !== id));
    } catch {
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) return;
    setActionLoading(id);
    try {
      await rejectSettlement(id, rejectReason);
      setSettlements((prev) => prev.filter((s) => s.id !== id));
      setRejectReason('');
      setRejectingId(null);
    } catch {
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="rounded-xl border bg-white p-5 shadow-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-emerald-600" />
          <h2 className="font-bold text-gray-800">Driver Settlements</h2>
        </div>
        <button onClick={load} className="text-xs text-gray-400 hover:text-gray-600">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-emerald-600" />
        </div>
      ) : settlements.length === 0 ? (
        <div className="rounded-lg bg-gray-50 py-6 text-center text-sm text-gray-400">
          No pending settlements
        </div>
      ) : (
        <div className="space-y-3">
          {settlements.map((s) => (
            <div key={s.id} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-gray-800">{s.driver?.name || 'Unknown Driver'}</p>
                  <p className="text-xs text-gray-400">
                    <Clock className="inline h-3 w-3 mr-1" />
                    {new Date(s.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="text-lg font-bold text-emerald-600">${Number(s.amount).toFixed(2)}</span>
              </div>
              {s.notes && <p className="mb-3 text-sm text-gray-500">{s.notes}</p>}

              {rejectingId === s.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => { setRejectingId(null); setRejectReason(''); }} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100">Cancel</button>
                    <button onClick={() => handleReject(s.id)} disabled={actionLoading === s.id} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50">
                      {actionLoading === s.id ? '...' : 'Confirm Reject'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => handleApprove(s.id)} disabled={actionLoading === s.id} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                    <CheckCircle className="h-3 w-3" /> Approve
                  </button>
                  <button onClick={() => setRejectingId(s.id)} className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                    <XCircle className="h-3 w-3" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

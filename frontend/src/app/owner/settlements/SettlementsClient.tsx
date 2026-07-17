'use client';

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import api from '@/lib/api';
import { Loader2, CheckCircle2, DollarSign } from 'lucide-react';

export default function SettlementsClient({ initialHistory }: { initialHistory: any[] }) {
  const [pendingShifts, setPendingShifts] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>(initialHistory);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedShift, setSelectedShift] = useState<any>(null);
  const [deliveredCash, setDeliveredCash] = useState<string>('');

  const fetchPending = async () => {
    try {
      const { data } = await api.get('/closing/shifts/pending');
      setPendingShifts(data);
    } catch (err) {
      console.error('Error fetching pending shifts:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const { data } = await api.get('/closing/shifts/history');
      setHistory(data);
    } catch (err) {
      console.error('Error fetching shift history:', err);
    }
  };

  useEffect(() => {
    fetchPending();
    fetchHistory();
  }, []);

  const openConfirmModal = (shift: any) => {
    setSelectedShift(shift);
    setDeliveredCash(Number(shift.expectedCash || shift.amount || 0).toString());
    setShowModal(true);
  };

  const handleConfirm = async () => {
    if (!selectedShift) return;
    setConfirmingId(selectedShift.id);
    try {
      await api.post(`/closing/shifts/${selectedShift.id}/confirm`, {
        deliveredCash: Number(deliveredCash),
      });
      
      // Remove from pending
      setPendingShifts(prev => prev.filter(s => s.id !== selectedShift.id));
      
      // Prepend to history
      setHistory(prev => [
        {
          ...selectedShift,
          status: 'CONFIRMED',
          deliveredCash: Number(deliveredCash),
          confirmedByOwner: new Date().toISOString(),
        },
        ...prev
      ]);
      
      setShowModal(false);
    } catch (err: any) {
      alert(err.response?.data?.message || 'حدث خطأ أثناء التأكيد');
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Pending Shifts Section */}
      {pendingShifts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm animate-in fade-in zoom-in-95">
          <h2 className="text-lg font-bold text-amber-900 mb-4 flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
            بانتظار التأكيد ({pendingShifts.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pendingShifts.map(shift => (
              <div key={shift.id} className="rounded-lg bg-white p-4 border border-amber-100 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="font-bold text-gray-900 text-lg mb-1">{shift.staff?.name}</div>
                  <div className="text-sm text-gray-500 mb-3">
                    بدأت: {format(new Date(shift.shiftStart || shift.createdAt), 'dd MMM, hh:mm a', { locale: ar })}
                  </div>
                  <div className="text-xl font-black text-emerald-600 mb-4">
                    {Number(shift.expectedCash || shift.amount || 0).toFixed(2)} ج.م
                  </div>
                </div>
                <button
                  onClick={() => openConfirmModal(shift)}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition-all active:scale-95"
                >
                  استلام وتأكيد
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History Section */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-bold text-gray-900">سجل التسليمات (السابقة)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="px-6 py-4 font-semibold text-gray-900">الموظف</th>
                <th className="px-6 py-4 font-semibold text-gray-900">المبلغ المستلم</th>
                <th className="px-6 py-4 font-semibold text-gray-900">وقت التأكيد</th>
                <th className="px-6 py-4 font-semibold text-gray-900">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map((handover) => (
                <tr key={handover.id} className="transition-colors hover:bg-gray-50/50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{handover.staff?.name || 'غير معروف'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                      {Number(handover.deliveredCash || handover.amount || handover.expectedCash || 0).toFixed(2)} ج.م
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                    {handover.confirmedByOwner 
                      ? format(new Date(handover.confirmedByOwner), 'dd MMMM yyyy, hh:mm a', { locale: ar })
                      : format(new Date(handover.createdAt), 'dd MMMM yyyy, hh:mm a', { locale: ar })
                    }
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
                      <div className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                      مؤكد
                    </span>
                  </td>
                </tr>
              ))}

              {history.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    لا يوجد سجلات لتسليم النقدية بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm Modal */}
      {showModal && selectedShift && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4">تأكيد استلام النقدية</h2>
            
            <div className="mb-4 bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="flex justify-between mb-2">
                <span className="text-gray-500">الموظف:</span>
                <span className="font-bold text-gray-900">{selectedShift.staff?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">المبلغ المتوقع بالنظام:</span>
                <span className="font-bold text-emerald-600">{Number(selectedShift.expectedCash || selectedShift.amount || 0).toFixed(2)} ج.م</span>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">المبلغ الفعلي المستلم</label>
              <div className="relative">
                <input 
                  type="number"
                  value={deliveredCash}
                  onChange={(e) => setDeliveredCash(e.target.value)}
                  className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                  <DollarSign className="h-5 w-5" />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                disabled={!!confirmingId}
                className="flex-1 rounded-xl bg-gray-100 hover:bg-gray-200 px-4 py-3 text-sm font-bold text-gray-700 transition-all"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirm}
                disabled={!!confirmingId || !deliveredCash}
                className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition-all"
              >
                {confirmingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> تأكيد الاستلام</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

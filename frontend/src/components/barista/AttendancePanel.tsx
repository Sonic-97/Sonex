'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, LogIn, LogOut, Loader2 } from 'lucide-react';
import { clockIn, clockOut, getActiveShift } from '@/lib/api';

interface AttendancePanelProps {
  staffId: string;
}

export function AttendancePanel({ staffId }: AttendancePanelProps) {
  const [activeShift, setActiveShift] = useState<{ id: string; clockIn: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchShift = useCallback(async () => {
    try {
      const shift = await getActiveShift(staffId);
      setActiveShift(shift || null);
    } catch {
      setActiveShift(null);
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => { fetchShift(); }, [fetchShift]);

  const handleClockIn = async () => {
    setActionLoading(true);
    try {
      const shift = await clockIn(staffId);
      setActiveShift(shift);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    setActionLoading(true);
    try {
      await clockOut(staffId);
      setActiveShift(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-500" />
          تسجيل الدوام
        </h3>
        {activeShift && (
          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-semibold">
            في الدوام
          </span>
        )}
      </div>

      {activeShift ? (
        <div className="space-y-3">
          <div className="text-xs text-gray-500">
            بداية الدوام: {new Date(activeShift.clockIn).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <button
            onClick={handleClockOut}
            disabled={actionLoading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-red-500 hover:bg-red-600 px-4 py-3 text-sm font-bold text-white transition-colors disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            ⏹ إنهاء الدوام
          </button>
        </div>
      ) : (
        <button
          onClick={handleClockIn}
          disabled={actionLoading}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-green-500 hover:bg-green-600 px-4 py-3 text-sm font-bold text-white transition-colors disabled:opacity-50"
        >
          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          ▶ بدء الدوام
        </button>
      )}
    </div>
  );
}

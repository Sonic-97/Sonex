'use client';

import { useState } from 'react';
import { Wifi, WifiOff, Power } from 'lucide-react';

interface OnlineToggleProps {
  currentStatus: string;
  onToggle: (status: 'ONLINE' | 'OFFLINE' | 'PAUSED') => void;
  loading?: boolean;
}

export default function OnlineToggle({ currentStatus, onToggle, loading }: OnlineToggleProps) {
  const isOnline = currentStatus === 'ONLINE';
  const isPaused = currentStatus === 'PAUSED';

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl p-6 border border-[#E8E1D9] shadow-sm text-center">
        <div className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center transition-colors ${isOnline ? 'bg-emerald-100' : isPaused ? 'bg-orange-100' : 'bg-gray-100'}`}>
          {isOnline ? <Wifi size={28} className="text-emerald-600" /> : <WifiOff size={28} className="text-gray-400" />}
        </div>
        <div className="text-lg font-bold mb-1">
          {isOnline ? 'متصل' : isPaused ? 'متوقف مؤقتاً' : 'غير متصل'}
        </div>
        <div className="text-xs text-gray-400">
          {isOnline ? 'أنت متصل وتستقبل طلبات التوصيل' : isPaused ? 'لن تستقبل طلبات جديدة' : 'قم بتشغيل الاتصال لاستقبال الطلبات'}
        </div>
      </div>

      <div className="flex gap-3">
        {!isOnline && !isPaused && (
          <button
            onClick={() => onToggle('ONLINE')}
            disabled={loading}
            className="flex-1 bg-emerald-600 text-white rounded-2xl p-4 font-bold text-sm hover:bg-emerald-700 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Power size={18} />
            تشغيل
          </button>
        )}
        {isOnline && (
          <button
            onClick={() => onToggle('PAUSED')}
            disabled={loading}
            className="flex-1 bg-orange-500 text-white rounded-2xl p-4 font-bold text-sm hover:bg-orange-600 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            إيقاف مؤقت
          </button>
        )}
        {isOnline && (
          <button
            onClick={() => onToggle('OFFLINE')}
            disabled={loading}
            className="flex-1 bg-red-600 text-white rounded-2xl p-4 font-bold text-sm hover:bg-red-700 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            قطع الاتصال
          </button>
        )}
        {(isPaused || (currentStatus !== 'ONLINE' && currentStatus !== 'OFFLINE' && currentStatus !== 'PAUSED')) && (
          <button
            onClick={() => onToggle('ONLINE')}
            disabled={loading}
            className="flex-1 bg-emerald-600 text-white rounded-2xl p-4 font-bold text-sm hover:bg-emerald-700 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            استئناف
          </button>
        )}
      </div>
    </div>
  );
}

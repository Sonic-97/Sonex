'use client';

import { useEffect, useState } from 'react';
import { Wifi, Pause, Play } from 'lucide-react';
import merchantApi from '@/lib/merchant-api';
import AvailabilityBadge from '@/components/merchant/AvailabilityBadge';

interface AvailabilityData {
  cafeId: string;
  status: string;
  queueLength: number;
  currentETA: number;
}

export default function MerchantAvailabilityPage() {
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await merchantApi.get('/merchant/availability');
        setAvailability(data);
      } catch {
        setError('فشل تحميل بيانات التوفر');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const updateAvailability = async (action: 'pause' | 'resume') => {
    setError('');
    setSuccessMsg('');
    try {
      const { data } = await merchantApi.put('/merchant/availability', { action });
      setAvailability(data);
      setSuccessMsg(action === 'pause' ? 'تم إيقاف الاستقبال مؤقتاً' : 'تم استئناف الاستقبال');
    } catch (err: any) {
      setError(err.response?.data?.message || 'فشل تحديث الحالة');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-gray-200 rounded-2xl" />
        <div className="h-32 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">حالة التوفر</h1>

      {successMsg && (
        <div className="bg-emerald-50 text-emerald-700 text-sm p-3 rounded-xl border border-emerald-200">{successMsg}</div>
      )}
      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-xl border border-red-200">{error}</div>
      )}

      {availability && (
        <>
          <div className="bg-white rounded-2xl p-6 border border-[#E8E1D9] shadow-sm text-center">
            <Wifi size={32} className="mx-auto mb-3 text-[#8c6239]" />
            <AvailabilityBadge
              status={availability.status}
              queueLength={availability.queueLength}
              currentETA={availability.currentETA}
            />
            <div className="mt-4 text-sm text-gray-400">
              العدد في الانتظار: {availability.queueLength} | الوقت التقديري: {availability.currentETA} د
            </div>
          </div>

          <div className="space-y-3">
            {(availability.status === 'OPEN' || availability.status === 'BUSY' || availability.status === 'VERY_BUSY') && (
              <button
                onClick={() => updateAvailability('pause')}
                className="w-full bg-orange-500 text-white rounded-2xl p-4 font-bold text-sm hover:bg-orange-600 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Pause size={18} />
                إيقاف مؤقت
              </button>
            )}
            {availability.status === 'PAUSED' && (
              <button
                onClick={() => updateAvailability('resume')}
                className="w-full bg-emerald-600 text-white rounded-2xl p-4 font-bold text-sm hover:bg-emerald-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Play size={18} />
                استئناف الاستقبال
              </button>
            )}
          </div>
        </>
      )}

      {!availability && !loading && (
        <div className="bg-white rounded-2xl p-6 border border-[#E8E1D9] text-center text-gray-400 text-sm">
          لا توجد معلومات عن التوفر
        </div>
      )}
    </div>
  );
}

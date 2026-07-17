'use client';

import { useEffect, useState } from 'react';
import driverApi from '@/lib/driver-api';
import OnlineToggle from '@/components/driver/OnlineToggle';
import { MapPin } from 'lucide-react';

export default function DriverStatusPage() {
  const [currentStatus, setCurrentStatus] = useState('OFFLINE');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [lastLocation, setLastLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await driverApi.get('/driver/profile');
        setCurrentStatus(data.status || 'OFFLINE');
      } catch {
        setError('فشل تحميل الحالة');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const handleToggle = async (status: 'ONLINE' | 'OFFLINE' | 'PAUSED') => {
    setUpdating(true);
    setError('');
    setSuccessMsg('');
    try {
      await driverApi.put('/driver/status', { status });
      setCurrentStatus(status);
      setSuccessMsg(status === 'ONLINE' ? 'أنت متصل الآن' : status === 'PAUSED' ? 'تم إيقاف الاستقبال مؤقتاً' : 'تم قطع الاتصال');
    } catch (err: any) {
      setError(err.response?.data?.message || 'فشل تحديث الحالة');
    } finally {
      setUpdating(false);
    }
  };

  const updateLocation = async () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLastLocation({ lat: latitude, lng: longitude });
        try {
          await driverApi.put('/driver/location', { latitude, longitude });
          setSuccessMsg('تم تحديث الموقع');
        } catch { setError('فشل تحديث الموقع'); }
      },
      () => setError('تعذر الحصول على الموقع'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-gray-200 rounded-2xl" />
        <div className="h-48 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">الحالة</h1>

      {successMsg && (
        <div className="bg-emerald-50 text-emerald-700 text-sm p-3 rounded-xl border border-emerald-200">{successMsg}</div>
      )}
      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-xl border border-red-200">{error}</div>
      )}

      <OnlineToggle currentStatus={currentStatus} onToggle={handleToggle} loading={updating} />

      <div className="bg-white rounded-2xl p-5 border border-[#E8E1D9] shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-gray-500">الموقع</span>
          <button
            onClick={updateLocation}
            className="text-xs bg-[#8c6239] text-white px-3 py-1.5 rounded-xl font-bold hover:bg-[#6f4d2d] transition-all"
          >
            تحديث
          </button>
        </div>
        {lastLocation ? (
          <div className="text-xs text-gray-400 font-mono">
            {lastLocation.lat.toFixed(6)}, {lastLocation.lng.toFixed(6)}
          </div>
        ) : (
          <div className="text-xs text-gray-400">لم يتم تحديد الموقع بعد</div>
        )}
      </div>
    </div>
  );
}

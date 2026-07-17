'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Wifi, Medal } from 'lucide-react';
import merchantApi from '@/lib/merchant-api';
import AvailabilityBadge from '@/components/merchant/AvailabilityBadge';

interface DashboardData {
  availability: { cafeId: string; status: string; queueLength: number; currentETA: number } | null;
  reputation: { trustScore: number } | null;
  badges: string[];
}

export default function MerchantDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetch = async () => {
      try {
        const [availRes, repRes] = await Promise.all([
          merchantApi.get('/merchant/availability').catch(() => ({ data: null })),
          merchantApi.get('/merchant/reputation').catch(() => ({ data: null })),
        ]);
        setData({
          availability: availRes.data,
          reputation: repRes.data,
          badges: repRes.data?.badges || [],
        });
      } catch {
        setError('فشل تحميل البيانات');
      } finally {
        setLoading(false);
      }
    };
    fetch();
    const iv = setInterval(fetch, 30000);
    return () => clearInterval(iv);
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-20 bg-gray-200 rounded-2xl" />
        <div className="h-32 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">لوحة التحكم</h1>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-xl border border-red-200">{error}</div>
      )}

      {data?.availability && (
        <div className="bg-white rounded-2xl p-5 border border-[#E8E1D9] shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-gray-500">حالة المتجر</span>
            <AvailabilityBadge
              status={data.availability.status}
              queueLength={data.availability.queueLength}
              currentETA={data.availability.currentETA}
            />
          </div>
          <button
            onClick={() => router.push('/merchant/availability')}
            className="w-full mt-2 text-center bg-gray-50 rounded-xl py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 transition-all"
          >
            إدارة التوفر
          </button>
        </div>
      )}

      {data?.reputation && (
        <div className="bg-white rounded-2xl p-5 border border-[#E8E1D9] shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <Medal size={20} className="text-[#8c6239]" />
            <span className="text-sm font-bold text-gray-500">السمعة</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-[#8c6239]">{data.reputation.trustScore}</span>
            <span className="text-sm text-gray-400">/ 100</span>
          </div>
          {data.badges.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {data.badges.map((b) => (
                <span key={b} className="text-xs bg-[#f4e9dd] text-[#8c6239] px-2 py-1 rounded-full font-bold">{b}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => router.push('/merchant/orders')}
          className="bg-white rounded-2xl p-5 border border-[#E8E1D9] shadow-sm hover:shadow-md transition-all text-center"
        >
          <ClipboardList size={24} className="mx-auto mb-2 text-[#8c6239]" />
          <span className="text-sm font-bold">الطلبات</span>
        </button>
        <button
          onClick={() => router.push('/merchant/availability')}
          className="bg-white rounded-2xl p-5 border border-[#E8E1D9] shadow-sm hover:shadow-md transition-all text-center"
        >
          <Wifi size={24} className="mx-auto mb-2 text-[#8c6239]" />
          <span className="text-sm font-bold">التوفر</span>
        </button>
      </div>
    </div>
  );
}

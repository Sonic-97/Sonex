'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, User, Navigation, MapPin } from 'lucide-react';
import driverApi from '@/lib/driver-api';
import AssignmentCard from '@/components/driver/AssignmentCard';
import LocationIndicator from '@/components/driver/LocationIndicator';

import { useSocket } from '@/hooks/useSocket';
import { useAudio } from '@/hooks/useAudio';

interface Assignment {
  assignmentId: string;
  merchantName: string;
  status: string;
  pickupSequence: number;
  estimatedReadyAt?: string;
}

interface Profile {
  name: string;
  status: string;
  vehicleType: string;
  activeAssignments: number;
  totalDeliveries: number;
  todayEarnings?: number;
}

export default function DriverHomePage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Connect to live Socket namespace for drivers
  useSocket('/driver');
  useAudio();

  const fetchData = useCallback(async () => {
    try {
      const [assignRes, profileRes] = await Promise.all([
        driverApi.get('/driver/assignments').catch(() => ({ data: [] })),
        driverApi.get('/driver/profile').catch(() => ({ data: null })),
      ]);
      setAssignments(Array.isArray(assignRes.data) ? assignRes.data : []);
      if (profileRes.data) setProfile(profileRes.data);
    } catch {
      setError('فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 10000); // 10s fallback interval
    return () => clearInterval(iv);
  }, [fetchData]);

  const handleLocation = useCallback(async (lat: number, lng: number) => {
    try {
      await driverApi.put('/driver/location', { latitude: lat, longitude: lng });
    } catch {
      /* silent */
    }
  }, []);

  const handleAssignmentClick = (id: string) => {
    router.push(`/driver/assignments/${id}`);
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-24 bg-gray-200 rounded-2xl" />
        <div className="h-20 bg-gray-200 rounded-2xl" />
        <div className="h-20 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">الرئيسية</h1>
        {profile?.status === 'ONLINE' && (
          <LocationIndicator onLocation={handleLocation} />
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-xl border border-red-200">{error}</div>
      )}

      {profile && (
        <div className="bg-white rounded-2xl p-5 border border-[#E8E1D9] shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <User size={20} className="text-[#8c6239]" />
            <span className="text-sm font-bold text-gray-500">الملف الشخصي</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-400">الاسم</span>
              <div className="font-bold">{profile.name}</div>
            </div>
            <div>
              <span className="text-gray-400">المركبة</span>
              <div className="font-bold">{profile.vehicleType}</div>
            </div>
            <div>
              <span className="text-gray-400">التوصيلات اليوم</span>
              <div className="font-bold">{profile.totalDeliveries}</div>
            </div>
            <div>
              <span className="text-gray-400">النشطة</span>
              <div className="font-bold">{profile.activeAssignments}</div>
            </div>
          </div>
          {profile.todayEarnings !== undefined && (
            <div className="mt-3 pt-3 border-t border-[#E8E1D9] flex items-center gap-2">
              <span className="text-gray-400 text-sm">أرباح اليوم</span>
              <span className="text-lg font-bold text-[#8c6239]">{profile.todayEarnings} ر.س</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <ClipboardList size={18} className="text-[#8c6239]" />
        <span className="text-sm font-bold text-gray-500">التوصيلات</span>
      </div>

      {assignments.length === 0 && (
        <div className="bg-white rounded-2xl p-8 border border-[#E8E1D9] text-center">
          <Navigation size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">لا توجد توصيلات حالياً</p>
          <p className="text-xs text-gray-300 mt-1">انتظر وصول طلب جديد</p>
        </div>
      )}

      <div className="space-y-2">
        {assignments.map((a) => (
          <AssignmentCard
            key={a.assignmentId}
            assignmentId={a.assignmentId}
            merchantName={a.merchantName}
            status={a.status}
            pickupSequence={a.pickupSequence}
            estimatedReadyAt={a.estimatedReadyAt}
            onClick={handleAssignmentClick}
          />
        ))}
      </div>
    </div>
  );
}

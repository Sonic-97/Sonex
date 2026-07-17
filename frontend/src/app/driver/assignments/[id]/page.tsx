'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, Package, Clock, Navigation } from 'lucide-react';
import driverApi from '@/lib/driver-api';
import StatusBadge from '@/components/driver/StatusBadge';
import AssignmentTimeline from '@/components/driver/AssignmentTimeline';
import ActionButtons from '@/components/driver/ActionButtons';
import LocationIndicator from '@/components/driver/LocationIndicator';

interface AssignmentDetail {
  assignmentId: string;
  merchantOrderId: string;
  customerOrderId: string;
  status: string;
  assignedAt: string;
  respondedAt: string | null;
  merchantName: string;
  merchantStatus: string;
  pickupSequence: number;
  estimatedReadyAt: string | null;
}

export default function DriverAssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      try {
        const { data } = await driverApi.get(`/driver/assignments/${id}`);
        setAssignment(data);
      } catch (err: any) {
        setError(err.response?.status === 404 ? 'التوصيل غير موجود' : 'فشل تحميل التوصيل');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

  const handleLocation = useCallback(async (lat: number, lng: number) => {
    try {
      await driverApi.put('/driver/location', { latitude: lat, longitude: lng });
    } catch { /* silent */ }
  }, []);

  const handleAction = async (action: string) => {
    setActionLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      await driverApi.post(`/driver/assignments/${id}/${action}`);
      setSuccessMsg('تم بنجاح');
      const { data } = await driverApi.get(`/driver/assignments/${id}`);
      setAssignment(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'فشل تنفيذ الإجراء');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-gray-200 rounded-2xl" />
        <div className="h-40 bg-gray-200 rounded-2xl" />
        <div className="h-20 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  if (error && !assignment) {
    return (
      <div className="text-center py-12">
        <Navigation size={40} className="mx-auto mb-3 text-red-400" />
        <p className="text-gray-600">{error}</p>
        <button onClick={() => router.push('/driver/home')} className="mt-4 text-[#8c6239] font-bold text-sm">العودة للرئيسية</button>
      </div>
    );
  }

  if (!assignment) return null;

  const currentStatus = assignment.status;

  const timelineSteps = [
    { label: 'طلب توصيل', time: new Date(assignment.assignedAt).toLocaleString('ar-EG'), active: currentStatus === 'PENDING', completed: ['ACCEPTED', 'PICKED_UP', 'DELIVERED'].includes(currentStatus) },
    { label: 'تم القبول', time: assignment.respondedAt ? new Date(assignment.respondedAt).toLocaleString('ar-EG') : undefined, active: currentStatus === 'ACCEPTED', completed: ['PICKED_UP', 'DELIVERED'].includes(currentStatus) },
    { label: 'تم الاستلام', time: undefined, active: currentStatus === 'PICKED_UP', completed: ['DELIVERED'].includes(currentStatus) },
    { label: 'تم التوصيل', time: undefined, active: currentStatus === 'DELIVERED', completed: currentStatus === 'DELIVERED' },
  ];

  return (
    <div className="space-y-5">
      <button onClick={() => router.push('/driver/home')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <ArrowRight size={16} />
        العودة
      </button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package size={20} className="text-[#8c6239]" />
          <h1 className="text-lg font-bold">تفاصيل التوصيل</h1>
        </div>
        <StatusBadge status={currentStatus} />
      </div>

      <div className="bg-white rounded-2xl p-5 border border-[#E8E1D9] shadow-sm">
        <div className="text-xs text-gray-400 font-mono mb-1">{assignment.assignmentId}</div>
        <p className="text-sm font-bold">{assignment.merchantName}</p>
        <p className="text-xs text-gray-400 mt-1">ترتيب التوصيل: {assignment.pickupSequence}</p>
        {assignment.estimatedReadyAt && (
          <p className="text-xs text-gray-400">متوقع الجهوزية: {new Date(assignment.estimatedReadyAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs">
        <LocationIndicator onLocation={handleLocation} />
      </div>

      {successMsg && (
        <div className="bg-emerald-50 text-emerald-700 text-sm p-3 rounded-xl border border-emerald-200">{successMsg}</div>
      )}
      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-xl border border-red-200">{error}</div>
      )}

      <div className="bg-white rounded-2xl p-5 border border-[#E8E1D9] shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-gray-400" />
          <span className="text-sm font-bold text-gray-500">تتبع التوصيل</span>
        </div>
        <AssignmentTimeline steps={timelineSteps} />
      </div>

      <div className="bg-white rounded-2xl p-5 border border-[#E8E1D9] shadow-sm">
        <ActionButtons status={currentStatus} assignmentId={id} onAction={handleAction} loading={actionLoading} />
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, Package, AlertTriangle, Clock } from 'lucide-react';
import merchantApi from '@/lib/merchant-api';
import StatusChip from '@/components/merchant/StatusChip';
import OrderTimeline from '@/components/merchant/OrderTimeline';
import ActionButtons from '@/components/merchant/ActionButtons';

interface MerchantMessage {
  messageType: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}

export default function MerchantOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<{ merchantOrderId: string; merchantId: string; messages: MerchantMessage[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      try {
        const { data } = await merchantApi.get(`/merchant/orders/${id}`);
        setOrder(data);
        localStorage.setItem(`merchant_order_${id}_time`, new Date().toISOString());
        addToRecent(data);
      } catch (err: any) {
        setError(err.response?.status === 404 ? 'الطلب غير موجود' : 'فشل تحميل الطلب');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

  const addToRecent = (data: any) => {
    try {
      const raw = localStorage.getItem('merchant_recent_orders');
      const recent = raw ? JSON.parse(raw) : [];
      const existing = recent.findIndex((r: any) => r.merchantOrderId === data.merchantOrderId);
      const entry = {
        merchantOrderId: data.merchantOrderId,
        customerOrderId: id,
        status: data.messages?.[data.messages.length - 1]?.messageType || 'CREATED',
        businessName: 'متجر',
        lastAccess: new Date().toISOString(),
      };
      if (existing >= 0) recent[existing] = entry;
      else recent.push(entry);
      if (recent.length > 20) recent.shift();
      localStorage.setItem('merchant_recent_orders', JSON.stringify(recent));
    } catch { /* ignore */ }
  };

  const handleAction = async (action: string) => {
    setActionLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const lastMsg = order?.messages?.[order.messages.length - 1];
      const body: Record<string, any> = {
        merchantOrderId: order?.merchantOrderId,
        customerOrderId: id,
      };
      if (action === 'reject') body.reason = 'غير متوفر';
      if (action === 'delay') body.extraMinutes = 10;
      if (action === 'out-of-stock') body.productName = 'منتج';

      await merchantApi.post(`/merchant/orders/${id}/${action}`, body);
      setSuccessMsg('تم بنجاح');

      const { data } = await merchantApi.get(`/merchant/orders/${id}`);
      setOrder(data);
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

  if (error && !order) {
    return (
      <div className="text-center py-12">
        <AlertTriangle size={40} className="mx-auto mb-3 text-red-400" />
        <p className="text-gray-600">{error}</p>
        <button onClick={() => router.push('/merchant/orders')} className="mt-4 text-[#8c6239] font-bold text-sm">العودة للطلبات</button>
      </div>
    );
  }

  if (!order) return null;

  const lastMsg = order.messages?.[order.messages.length - 1];
  const currentStatus = lastMsg?.messageType || 'CREATED';
  const statusLabel = currentStatus === 'NEW_ORDER' ? 'CREATED' : currentStatus;

  const timelineSteps = [
    { label: 'طلب جديد', time: order.messages?.find(m => m.messageType === 'NEW_ORDER')?.createdAt, active: currentStatus === 'NEW_ORDER', completed: ['ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP', 'COMPLETED'].includes(currentStatus) },
    { label: 'تم القبول', time: order.messages?.find(m => m.messageType === 'ORDER_ACCEPTED')?.createdAt, active: currentStatus === 'ORDER_ACCEPTED', completed: ['PREPARING', 'READY', 'PICKED_UP', 'COMPLETED'].includes(currentStatus) },
    { label: 'قيد التحضير', time: order.messages?.find(m => m.messageType === 'PREPARATION_STARTED')?.createdAt, active: currentStatus === 'PREPARATION_STARTED', completed: ['READY', 'PICKED_UP', 'COMPLETED'].includes(currentStatus) },
    { label: 'جاهز', time: order.messages?.find(m => m.messageType === 'READY_FOR_PICKUP')?.createdAt, active: currentStatus === 'READY_FOR_PICKUP', completed: ['PICKED_UP', 'COMPLETED'].includes(currentStatus) },
    { label: 'مكتمل', time: order.messages?.find(m => m.messageType === 'ORDER_COMPLETED')?.createdAt, active: currentStatus === 'ORDER_COMPLETED', completed: currentStatus === 'ORDER_COMPLETED' },
  ];

  return (
    <div className="space-y-5">
      <button onClick={() => router.push('/merchant/orders')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <ArrowRight size={16} />
        العودة
      </button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package size={20} className="text-[#8c6239]" />
          <h1 className="text-lg font-bold">تفاصيل الطلب</h1>
        </div>
        <StatusChip status={statusLabel} />
      </div>

      <div className="bg-white rounded-2xl p-5 border border-[#E8E1D9] shadow-sm">
        <div className="text-xs text-gray-400 font-mono mb-1">{order.merchantOrderId}</div>
        <p className="text-sm text-gray-500">معرف التاجر: {order.merchantId}</p>
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
          <span className="text-sm font-bold text-gray-500">تتبع الطلب</span>
        </div>
        <OrderTimeline steps={timelineSteps} />
      </div>

      <div className="bg-white rounded-2xl p-5 border border-[#E8E1D9] shadow-sm">
        <ActionButtons status={statusLabel} orderId={id} onAction={handleAction} loading={actionLoading} />
      </div>
    </div>
  );
}

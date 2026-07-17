'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, Package, Clock } from 'lucide-react';
import customerApi from '@/lib/customer-api';
import OrderTimeline from '@/components/customer/OrderTimeline';

interface OrderDetail {
  orderId: string;
  status: string;
  items: Array<{ productName: string; quantity: number; unitPrice: string; totalPrice: string }>;
  subtotal: string;
  deliveryFee: string;
  grandTotal: string;
  createdAt: string;
  merchantOrders: Array<{ merchantOrderId: string; cafeId: string; businessName: string; status: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  CREATED: 'جديد',
  ACCEPTED: 'مقبول',
  PREPARING: 'قيد التحضير',
  READY: 'جاهز',
  PICKED_UP: 'قيد التوصيل',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
};

export default function CustomerOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      try {
        const { data } = await customerApi.get(`/customer/orders/${id}`);
        setOrder(data);
      } catch (err: any) {
        setError(err.response?.status === 404 ? 'الطلب غير موجود' : 'فشل تحميل الطلب');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

  if (loading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-10 bg-gray-200 rounded-2xl" />
        <div className="h-40 bg-gray-200 rounded-2xl" />
        <div className="h-20 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="p-4 text-center py-12">
        <Package size={40} className="mx-auto mb-3 text-red-400" />
        <p className="text-gray-600">{error}</p>
        <button onClick={() => router.push('/customer/orders')} className="mt-4 text-[#8c6239] font-bold text-sm">العودة للطلبات</button>
      </div>
    );
  }

  if (!order) return null;

  const currentStatus = order.status;

  const timelineSteps = [
    { label: 'طلب جديد', time: new Date(order.createdAt).toLocaleString('ar-EG'), active: currentStatus === 'CREATED', completed: ['ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP', 'COMPLETED'].includes(currentStatus) },
    { label: 'تم القبول', active: ['ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP', 'COMPLETED'].includes(currentStatus), completed: ['PREPARING', 'READY', 'PICKED_UP', 'COMPLETED'].includes(currentStatus) },
    { label: 'قيد التحضير', active: currentStatus === 'PREPARING', completed: ['READY', 'PICKED_UP', 'COMPLETED'].includes(currentStatus) },
    { label: 'جاهز', active: currentStatus === 'READY', completed: ['PICKED_UP', 'COMPLETED'].includes(currentStatus) },
    { label: 'مكتمل', active: currentStatus === 'COMPLETED', completed: currentStatus === 'COMPLETED' },
  ];

  return (
    <div className="p-4 space-y-5">
      <button onClick={() => router.push('/customer/orders')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <ArrowRight size={16} />
        العودة
      </button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package size={20} className="text-[#8c6239]" />
          <h1 className="text-lg font-bold">تفاصيل الطلب</h1>
        </div>
        <span className={`inline-block px-3 py-1 rounded-full border text-sm font-bold ${
          currentStatus === 'COMPLETED' ? 'bg-green-100 text-green-800 border-green-200' :
          currentStatus === 'CANCELLED' ? 'bg-red-100 text-red-800 border-red-200' :
          'bg-amber-100 text-amber-800 border-amber-200'
        }`}>
          {STATUS_LABELS[currentStatus] || currentStatus}
        </span>
      </div>

      <div className="bg-white rounded-2xl p-5 border border-[#E8E1D9] shadow-sm">
        <div className="text-xs text-gray-400 font-mono mb-3">{order.orderId}</div>
        <div className="space-y-2">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-gray-800">{item.productName} × {item.quantity}</span>
              <span className="font-bold">{item.totalPrice}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 mt-3 pt-3 space-y-1 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>المجموع</span>
            <span>{order.subtotal}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>التوصيل</span>
            <span>{order.deliveryFee}</span>
          </div>
          <div className="flex justify-between font-bold text-base">
            <span>الإجمالي</span>
            <span className="text-[#8c6239]">{order.grandTotal}</span>
          </div>
        </div>
      </div>

      {order.merchantOrders?.map((mo) => (
        <div key={mo.merchantOrderId} className="bg-white rounded-2xl p-4 border border-[#E8E1D9] shadow-sm">
          <div className="text-sm font-bold mb-1">{mo.businessName}</div>
          <span className={`inline-block px-2.5 py-0.5 rounded-full border text-xs font-bold ${
            mo.status === 'COMPLETED' ? 'bg-green-100 text-green-800 border-green-200' :
            mo.status === 'CANCELLED' ? 'bg-red-100 text-red-800 border-red-200' :
            'bg-amber-100 text-amber-800 border-amber-200'
          }`}>
            {STATUS_LABELS[mo.status] || mo.status}
          </span>
        </div>
      ))}

      <div className="bg-white rounded-2xl p-5 border border-[#E8E1D9] shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-gray-400" />
          <span className="text-sm font-bold text-gray-500">تتبع الطلب</span>
        </div>
        <OrderTimeline steps={timelineSteps} />
      </div>
    </div>
  );
}

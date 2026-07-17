'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Package } from 'lucide-react';
import customerApi from '@/lib/customer-api';
import OrderCard from '@/components/customer/OrderCard';

interface Order {
  orderId: string;
  status: string;
  grandTotal: string;
  createdAt: string;
  merchantOrders?: Array<{ businessName: string }>;
}

export default function CustomerOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await customerApi.get('/customer/orders');
        setOrders(Array.isArray(data) ? data : data.orders || []);
      } catch {
        setError('فشل تحميل الطلبات');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  if (loading) {
    return (
      <div className="p-4 space-y-3 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-2xl" />
        <div className="h-20 bg-gray-200 rounded-2xl" />
        <div className="h-20 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">طلباتي</h1>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-xl border border-red-200">{error}</div>
      )}

      {orders.length === 0 && !error && (
        <div className="text-center py-12">
          <Package size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">لا توجد طلبات</p>
          <p className="text-xs text-gray-300 mt-1">ابدأ محادثة لطلب القهوة</p>
        </div>
      )}

      <div className="space-y-2">
        {orders.map((o) => (
          <OrderCard
            key={o.orderId}
            orderId={o.orderId}
            status={o.status}
            grandTotal={o.grandTotal}
            createdAt={o.createdAt}
            merchantName={o.merchantOrders?.[0]?.businessName}
            onClick={(id) => router.push(`/customer/orders/${id}`)}
          />
        ))}
      </div>
    </div>
  );
}

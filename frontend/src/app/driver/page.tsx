'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocket } from '@/hooks/useSocket';
import { RoleLayout } from '@/components/layouts/RoleLayout';
import { formatCurrency } from '@/lib/format';
import {
  Bike, Clock, User, MapPin, Loader2, CheckCircle,
  Package, CreditCard, ArrowRight,
} from 'lucide-react';

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  notes: string | null;
  product: { id: string; name: string; price: number };
}

interface Customer {
  id: string;
  name: string | null;
  phone: string;
}

interface Order {
  id: string;
  code: string;
  customerId: string;
  driverId: string | null;
  status: string;
  type: string;
  total: number;
  address: string | null;
  createdAt: string;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  customer: Customer;
  items: OrderItem[];
}

type DriverAction = 'accept' | 'pickup' | 'deliver' | 'collect';

export default function DriverDashboard() {
  useSocket('/driver');
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.employeeId) {
      api.get('/drivers').then(({ data }) => {
        const drivers = Array.isArray(data) ? data : [];
        const me = drivers.find((d: any) => d.id === user.employeeId || d.phone === user.phone);
        if (me) setDriverId(me.id);
      }).catch(() => {});
    }
  }, [user?.employeeId, user?.phone]);

  const fetchQueue = useCallback(async () => {
    try {
      const { data } = await api.get('/orders/driver/queue');
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const performAction = async (orderId: string, action: DriverAction) => {
    if (!driverId) return;
    const key = `${orderId}-${action}`;
    setActionId(key);
    try {
      switch (action) {
        case 'accept':
          await api.post(`/drivers/${driverId}/accept-order/${orderId}`);
          break;
        case 'pickup':
          await api.post(`/drivers/${driverId}/pickup-order/${orderId}`);
          break;
        case 'deliver':
          await api.post(`/drivers/${driverId}/complete/${orderId}`);
          break;
        case 'collect':
          await api.post(`/drivers/${driverId}/collect-payment/${orderId}`);
          break;
      }
      fetchQueue();
    } finally {
      setActionId(null);
    }
  };

  const isMyOrder = (order: Order) => order.driverId === driverId;

  const nextAction = (order: Order): { action: DriverAction; label: string; icon: any; color: string } | null => {
    if (!isMyOrder(order) && order.status === 'READY') {
      return { action: 'accept', label: 'استلام', icon: ArrowRight, color: 'bg-[#8C6239] hover:bg-[#6F4D2D]' };
    }
    if (isMyOrder(order) && order.status === 'READY') {
      return { action: 'pickup', label: 'تم الاستلام', icon: Package, color: 'bg-[#0F766E] hover:bg-[#0B5F59]' };
    }
    if (isMyOrder(order) && order.status === 'PICKED_UP') {
      return { action: 'deliver', label: 'تم التوصيل', icon: CheckCircle, color: 'bg-green-600 hover:bg-green-700' };
    }
    if (isMyOrder(order) && order.status === 'DELIVERED') {
      return { action: 'collect', label: 'تحصيل المبلغ', icon: CreditCard, color: 'bg-emerald-600 hover:bg-emerald-700' };
    }
    return null;
  };

  const statusBadge: Record<string, string> = {
    READY: 'bg-green-100 text-green-700',
    PICKED_UP: 'bg-blue-100 text-blue-700',
    DELIVERED: 'bg-gray-100 text-gray-700',
    PAID: 'bg-emerald-100 text-emerald-700',
  };

  const statusLabel: Record<string, string> = {
    READY: 'جاهز',
    PICKED_UP: 'تم الاستلام',
    DELIVERED: 'تم التوصيل',
    PAID: 'تم الدفع',
  };

  if (loading) {
    return (
      <RoleLayout role="driver" title="لوحة السائق">
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-emerald-600" />
        </div>
      </RoleLayout>
    );
  }

  const assignedOrders = orders.filter((o) => isMyOrder(o));
  const availableOrders = orders.filter((o) => !isMyOrder(o) && o.status === 'READY');

  return (
    <RoleLayout role="driver" title="لوحة السائق">
      <div className="mx-auto max-w-7xl space-y-6" dir="rtl">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-2xl font-bold text-indigo-700">{availableOrders.length}</p>
            <p className="text-xs text-gray-500">متاح</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-2xl font-bold text-blue-700">{assignedOrders.filter(o => o.status === 'READY').length}</p>
            <p className="text-xs text-gray-500">للاستلام</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-2xl font-bold text-green-700">{assignedOrders.filter(o => o.status === 'PICKED_UP').length}</p>
            <p className="text-xs text-gray-500">قيد التوصيل</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-2xl font-bold text-emerald-700">{assignedOrders.filter(o => o.status === 'DELIVERED').length}</p>
            <p className="text-xs text-gray-500">للتحصيل</p>
          </div>
        </div>

        {!driverId && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-700">
            لم يتم العثور على ملف السائق الخاص بك. تأكد من أن رقم هاتفك يطابق سائق مسجل.
          </div>
        )}

        {/* Available orders */}
        {availableOrders.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Bike className="h-4 w-4 text-indigo-600" /> طلبات متاحة
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {availableOrders.map((order) => (
                <OrderCard key={order.id} order={order} actionId={actionId} onAction={performAction} nextAction={nextAction(order)} statusBadge={statusBadge} statusLabel={statusLabel} />
              ))}
            </div>
          </section>
        )}

        {/* My orders in progress */}
        {assignedOrders.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-600" /> توصيلاتي
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {assignedOrders.map((order) => (
                <OrderCard key={order.id} order={order} actionId={actionId} onAction={performAction} nextAction={nextAction(order)} statusBadge={statusBadge} statusLabel={statusLabel} />
              ))}
            </div>
          </section>
        )}

        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Bike className="mb-4 h-16 w-16 text-gray-200" />
            <p className="text-lg font-medium text-gray-400">لا توجد طلبات متاحة</p>
            <p className="text-sm text-gray-300">في انتظار الطلبات الجديدة...</p>
          </div>
        )}
      </div>
    </RoleLayout>
  );
}

function OrderCard({
  order, actionId, onAction, nextAction, statusBadge, statusLabel,
}: {
  order: Order;
  actionId: string | null;
  onAction: (orderId: string, action: DriverAction) => void;
  nextAction: { action: DriverAction; label: string; icon: any; color: string } | null;
  statusBadge: Record<string, string>;
  statusLabel: Record<string, string>;
}) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-gray-800">{order.code}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge[order.status] || 'bg-gray-100 text-gray-600'}`}>
            {statusLabel[order.status] || order.status}
          </span>
        </div>
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {new Date(order.createdAt).toLocaleTimeString('ar-EG')}
        </span>
      </div>

      {/* Customer */}
      <div className="flex items-center gap-2 mb-3">
        <User className="h-4 w-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-800">{order.customer?.name || 'عميل'}</span>
        <span className="text-xs text-gray-400">{order.type === 'delivery' ? 'توصيل' : 'استلام'}</span>
      </div>

      {/* Address */}
      {order.address && (
        <div className="flex items-start gap-2 mb-3 text-xs text-gray-500">
          <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>{order.address}</span>
        </div>
      )}

      {/* Items */}
      <div className="mb-3 space-y-1">
        {order.items.slice(0, 4).map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span className="text-gray-700">{item.quantity}x {item.product?.name || 'منتج'}</span>
            <span className="text-gray-500">{formatCurrency(Number(item.unitPrice))}</span>
          </div>
        ))}
        {order.items.length > 4 && (
          <p className="text-xs text-gray-400">+{order.items.length - 4} عناصر أخرى</p>
        )}
      </div>

      {/* Total */}
      <div className="flex justify-between items-center border-t border-gray-100 pt-2 mb-3">
        <span className="text-xs text-gray-500">المجموع</span>
        <span className="font-bold text-gray-800">{formatCurrency(Number(order.total))}</span>
      </div>

      {/* Action button */}
      {nextAction && (
        <button onClick={() => onAction(order.id, nextAction.action)}
          disabled={actionId === `${order.id}-${nextAction.action}`}
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors ${nextAction.color} disabled:opacity-50`}>
          {actionId === `${order.id}-${nextAction.action}` ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <nextAction.icon className="h-4 w-4" />
          )}
          {nextAction.label}
        </button>
      )}
    </div>
  );
}

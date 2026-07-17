'use client';

import { useState, useEffect } from 'react';
import { Order, OrderStatus } from '@/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { updateOrderStatus } from '@/lib/api';
import { Clock, Coffee, Utensils, DollarSign } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const NEXT_ACTION: Record<OrderStatus, { label: string; next: OrderStatus; color: string } | null> = {
  NEW: { label: 'Confirm Order', next: 'CONFIRMED', color: 'bg-blue-600 hover:bg-blue-700' },
  CONFIRMED: { label: 'Preparing', next: 'PREPARING', color: 'bg-amber-600 hover:bg-amber-700' },
  PREPARING: { label: 'Mark Ready', next: 'READY', color: 'bg-green-600 hover:bg-green-700' },
  READY: null,
  PICKED_UP: null,
  DELIVERED: null,
  PAID: null,
  CLOSED: null,
  CANCELLED: null,
};

export function OrderCard({
  order,
  isNew,
  staffId,
}: {
  order: Order;
  isNew: boolean;
  staffId?: string;
}) {
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setStatus(order.status);
  }, [order.status]);

  const action = NEXT_ACTION[status];
  const canAct = action !== null;

  const handleAction = async () => {
    if (!canAct || loading) return;
    setLoading(true);
    try {
      await updateOrderStatus(order.id, action.next);
      setStatus(action.next);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!staffId) {
      alert('لم يتم التعرف على الموظف، يرجى تسجيل الدخول مرة أخرى');
      return;
    }
    setLoading(true);
    try {
      await axios.patch(`${API_URL}/orders/${order.id}/status`, {
        status: 'PAID',
        userId: staffId,
        role: 'BARISTA',
      });
      setStatus('PAID');
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleMarkNotPaid = async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      await axios.post(`${API_URL}/payments/collect`, {
        orderId: order.id,
        paymentStatus: 'UNPAID',
        amountPaid: 0,
        method: 'CASH',
        collectedById: staffId,
        collectedRole: 'BARISTA',
      });
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const isUnpaid = order.paymentStatus === 'UNPAID' || order.paymentStatus === 'PARTIAL_PAYMENT';
  const needsPayment = status === 'NEW' || status === 'CONFIRMED';

  return (
    <div
      className={`rounded-xl border-2 bg-white p-5 shadow-md transition-all duration-300 ${
        isNew ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-100'
      } ${isUnpaid ? 'border-amber-300' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-lg font-bold text-gray-800">
              #{order.code}
            </span>
            <StatusBadge status={status} />
            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              order.source === 'WHATSAPP' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
              order.source === 'DELIVERY' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
              'bg-gray-100 text-gray-800 border border-gray-200'
            }`}>
              {order.source || 'IN_CAFE'}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {order.customer?.name || order.customer?.phone || 'Walk-in'} · {order.type}
          </p>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold tabular-nums">
            ${Number(order.total).toFixed(2)}
          </span>
          <div className="flex items-center justify-end gap-1 text-xs">
            <span>{order.paymentStatus === 'PAID' ? '🟢' : order.paymentStatus === 'PARTIAL_PAYMENT' ? '🟡' : '🔴'}</span>
            <span className={
              order.paymentStatus === 'PAID' ? 'text-green-600' :
              order.paymentStatus === 'PARTIAL_PAYMENT' ? 'text-amber-600' : 'text-red-600'
            }>
              {order.paymentStatus === 'PAID' ? 'Paid' : order.paymentStatus === 'PARTIAL_PAYMENT' ? 'Partial' : 'Not Paid'}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 text-sm">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-xs font-bold text-gray-600">
              {item.quantity}
            </span>
            <span className="font-medium text-gray-800">{item.product?.name || 'Unknown'}</span>
            {item.notes && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                {item.notes}
              </span>
            )}
          </div>
        ))}
      </div>

      {order.address && (
        <p className="mb-3 text-xs text-gray-400">
          📍 {order.address}
        </p>
      )}

      <div className="space-y-2">
        {canAct && (
          <button
            onClick={handleAction}
            disabled={loading}
            className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all ${action!.color} disabled:opacity-50`}
          >
            {loading ? 'Updating...' : action!.label}
          </button>
        )}

        {/* Phase 3: Payment buttons — shown during NEW or CONFIRMED */}
        {needsPayment && (
          <div className="flex gap-2">
            <button
              onClick={handleMarkPaid}
              disabled={loading}
              className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
            >
              <DollarSign className="inline h-3 w-3 mr-1" />Paid
            </button>
            <button
              onClick={handleMarkNotPaid}
              disabled={loading}
              className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
            >
              Not Paid
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

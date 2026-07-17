'use client';

import { useState } from 'react';
import { Order } from '@/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { assignDriverToOrder, completeDriverDelivery, collectPayment } from '@/lib/api';
import { updateOrderStatus } from '@/lib/api';
import { MapPin, Package, DollarSign, Truck, CheckCircle } from 'lucide-react';

export function ReadyOrderCard({
  order,
  driverId,
}: {
  order: Order;
  driverId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [amountCollected, setAmountCollected] = useState(Number(order.total));

  const isPaid = order.paymentStatus === 'PAID';
  const isPartial = order.paymentStatus === 'PARTIAL_PAYMENT';
  const paymentIcon = isPaid ? '\u{1F7E2}' : isPartial ? '\u{1F7E1}' : '\u{1F534}';
  const paymentLabel = isPaid ? 'Paid' : isPartial ? 'Partial' : 'Not Paid';

  const status = order.status;

  const handlePickUp = async () => {
    setLoading(true);
    try {
      await assignDriverToOrder(driverId, order.id);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteDelivery = async () => {
    setLoading(true);
    try {
      await completeDriverDelivery(driverId, order.id);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaid = async () => {
    setLoading(true);
    try {
      await updateOrderStatus(order.id, 'PAID', driverId, 'DRIVER');
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleCollectPayment = async () => {
    setLoading(true);
    try {
      await collectPayment(order.id, {
        paymentStatus: 'PAID',
        amountPaid: amountCollected,
        collectedById: driverId,
        collectedRole: 'DRIVER',
      });
    } catch {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`rounded-xl border-2 bg-white p-5 shadow-md transition-all duration-300 ${
      status === 'READY' ? 'border-emerald-400 ring-2 ring-emerald-200' :
      status === 'PICKED_UP' ? 'border-blue-400 ring-2 ring-blue-200' :
      status === 'DELIVERED' ? 'border-amber-300' :
      'border-gray-100'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-lg font-bold text-gray-800">#{order.code}</span>
            <StatusBadge status={status} />
          </div>
          <p className="text-sm text-gray-500">{order.customer?.name || order.customer?.phone || 'Customer'}</p>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold tabular-nums">${Number(order.total).toFixed(2)}</span>
          <div className="flex items-center gap-1 text-xs">
            <span>{paymentIcon}</span>
            <span className={isPaid ? 'text-green-600' : isPartial ? 'text-amber-600' : 'text-red-600'}>{paymentLabel}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 text-sm">
            <Package className="h-4 w-4 text-gray-400" />
            <span className="font-medium text-gray-800">{item.quantity}x {item.product?.name}</span>
          </div>
        ))}
      </div>

      {order.address && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-gray-50 p-3">
          <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
          <p className="text-sm text-gray-600">{order.address}</p>
        </div>
      )}

      <div className="space-y-2">
        {/* Phase 7: Step 1 — Pick Up */}
        {status === 'READY' && (
          <button onClick={handlePickUp} disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-700 disabled:opacity-50">
            <Truck className="h-4 w-4" /> {loading ? '...' : 'Pick Up Order'}
          </button>
        )}

        {/* Phase 7: Step 2 — Complete Delivery */}
        {status === 'PICKED_UP' && (
          <button onClick={handleCompleteDelivery} disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-emerald-700 disabled:opacity-50">
            <CheckCircle className="h-4 w-4" /> {loading ? '...' : 'Complete Delivery'}
          </button>
        )}

        {/* Phase 3: Payment collection on delivered orders */}
        {status === 'DELIVERED' && !isPaid && (
          <div className="space-y-2">
            {!showPaymentForm ? (
              <button onClick={() => setShowPaymentForm(true)} className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-amber-700">
                <DollarSign className="inline h-4 w-4 mr-1" />Collect Payment
              </button>
            ) : (
              <div className="space-y-3 rounded-lg border bg-gray-50 p-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount Collected ($)</label>
                  <input type="number" value={amountCollected} onChange={(e) => setAmountCollected(Number(e.target.value))} max={Number(order.total)} min={0} step="0.01" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  <p className="mt-1 text-xs text-gray-400">
                    Total: ${Number(order.total).toFixed(2)}
                    {amountCollected < Number(order.total) && <span className="text-amber-600"> — ${(Number(order.total) - amountCollected).toFixed(2)} debt</span>}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowPaymentForm(false)} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
                  <button onClick={handleCollectPayment} disabled={loading} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                    {loading ? '...' : 'Confirm $' + amountCollected.toFixed(2)}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Already paid — show badge */}
        {isPaid && status === 'DELIVERED' && (
          <div className="rounded-lg bg-emerald-50 py-2 text-center text-sm font-medium text-emerald-700">
            Payment Collected
          </div>
        )}
      </div>
    </div>
  );
}

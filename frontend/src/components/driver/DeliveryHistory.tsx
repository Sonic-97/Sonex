'use client';

import { useAppStore } from '@/store';
import { ReadyOrderCard } from './ReadyOrderCard';
import { useAudio } from '@/hooks/useAudio';
import { PackageCheck, History, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';

export function DeliveryView({ driverId }: { driverId: string }) {
  const orders = useAppStore((s) => s.orders);
  const orderIds = useAppStore((s) => s.orderIds);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  useAudio();

  const readyOrders = orderIds
    .map((id) => orders[id])
    .filter((o) => o && (o.status === 'READY' || o.status === 'PICKED_UP'));

  const delivered = orderIds
    .map((id) => orders[id])
    .filter((o) => o && o.status === 'DELIVERED')
    .slice(0, 20);

  useEffect(() => {
    if (readyOrders.length > 0) {
      const ids = new Set(readyOrders.map((o) => o.id));
      setHighlightIds(ids);
      const timer = setTimeout(() => setHighlightIds(new Set()), 4000);
      return () => clearTimeout(timer);
    }
  }, [readyOrders.length]);

  return (
    <div className="space-y-8">
      {/* Active deliveries — READY or PICKED_UP */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Truck className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-bold text-gray-800">
            Active Deliveries ({readyOrders.length})
          </h2>
        </div>
        {readyOrders.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-12 text-center">
            <p className="text-lg font-medium text-gray-400">No active deliveries</p>
            <p className="text-sm text-gray-300">Waiting for orders to be ready...</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {readyOrders.map((order) => (
              <ReadyOrderCard
                key={order.id}
                order={order}
                driverId={driverId}
              />
            ))}
          </div>
        )}
      </section>

      {/* Delivery history */}
      {delivered.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <History className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-bold text-gray-800">
              Recent Deliveries ({delivered.length})
            </h2>
          </div>
          <div className="overflow-hidden rounded-xl border bg-white">
            <div className="divide-y">
              {delivered.map((order) => (
                <div key={order.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <PackageCheck className="h-4 w-4 text-emerald-500" />
                    <span className="font-mono font-bold text-gray-700">#{order.code}</span>
                    <span className="text-gray-500">{order.customer?.name || order.customer?.phone}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {order.address && (
                      <span className="hidden max-w-[200px] truncate text-gray-400 sm:inline">{order.address}</span>
                    )}
                    <span className="font-medium text-gray-600">${Number(order.total).toFixed(2)}</span>
                    <span className={`text-xs font-medium ${order.paymentStatus === 'PAID' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {order.paymentStatus === 'PAID' ? 'Paid' : 'Unpaid'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

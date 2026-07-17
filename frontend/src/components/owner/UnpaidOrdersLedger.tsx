'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store';
import { fetchUnpaidOrders } from '@/lib/api';
import { Order } from '@/types';
import { Phone, AlertTriangle } from 'lucide-react';

export function UnpaidOrdersLedger() {
  const [unpaidOrders, setUnpaidOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchUnpaidOrders()
      .then((data) => setUnpaidOrders(data as Order[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalOwed = unpaidOrders.reduce((s, o) => s + Number(o.remainingAmount || o.total), 0);
  const display = expanded ? unpaidOrders : unpaidOrders.slice(0, 10);

  if (loading) return null;
  if (unpaidOrders.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-red-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <h3 className="text-sm font-bold text-gray-800">Unpaid Delivery Orders</h3>
        </div>
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
          ${totalOwed.toFixed(2)} owed
        </span>
      </div>
      <div className="divide-y divide-gray-100">
        {display.map((order) => (
          <div key={order.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-gray-500">#{order.code}</span>
                <span className="font-medium text-gray-800 truncate">
                  {order.customer?.name || order.customer?.phone || 'Unknown'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span>{order.customer?.phone && <Phone className="inline h-3 w-3 mr-0.5" />}{order.customer?.phone}</span>
                <span className={
                  order.paymentStatus === 'PARTIAL_PAYMENT' ? 'text-amber-600' : 'text-red-600'
                }>
                  {order.paymentStatus === 'PARTIAL_PAYMENT' ? 'Partial' : 'Unpaid'}
                </span>
                {order.collectedRole && <span>Collected by: {order.collectedRole}</span>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-red-600">
                ${Number(order.remainingAmount || order.total).toFixed(2)}
              </p>
              <p className="text-[10px] text-gray-400">
                of ${Number(order.total).toFixed(2)}
              </p>
            </div>
          </div>
        ))}
      </div>
      {unpaidOrders.length > 10 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full border-t border-gray-100 px-4 py-2 text-center text-xs font-medium text-amber-600 hover:text-amber-700"
        >
          {expanded ? 'Show less' : `Show ${unpaidOrders.length - 10} more`}
        </button>
      )}
    </div>
  );
}
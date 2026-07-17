'use client';

import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/store';
import { CreditCard, Phone } from 'lucide-react';
import { useState } from 'react';

export function UnpaidOrdersCard() {
  const unpaidOrders = useAppStore((s) => s.unpaidOrders);
  const [expanded, setExpanded] = useState(false);

  const totalUnpaid = unpaidOrders.reduce((sum, o) => sum + Number(o.remainingBalance), 0);
  const display = expanded ? unpaidOrders : unpaidOrders.slice(0, 5);

  if (unpaidOrders.length === 0) {
    return (
      <Card title="Unpaid Orders" icon={<CreditCard className="h-5 w-5" />}>
        <p className="text-sm text-gray-400">All in-café orders are settled</p>
      </Card>
    );
  }

  return (
    <Card
      title="Unpaid Orders"
      value={`$${totalUnpaid.toFixed(2)}`}
      icon={<CreditCard className="h-5 w-5" />}
      subtitle={`${unpaidOrders.length} outstanding`}
    >
      <div className="space-y-2">
        {display.map((order) => (
          <div
            key={order.id}
            className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-800">{order.customerName}</p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{order.code}</span>
                {order.customerPhone && (
                  <span className="flex items-center gap-0.5">
                    <Phone className="h-3 w-3" />
                    {order.customerPhone}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-red-600">${Number(order.remainingBalance).toFixed(2)}</p>
              <p className="text-[10px] text-gray-400">
                {order.paymentStatus === 'PARTIALLY_PAID' ? 'Partial' : 'Unpaid'}
              </p>
            </div>
          </div>
        ))}
        {unpaidOrders.length > 5 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full text-center text-xs font-medium text-amber-600 hover:text-amber-700"
          >
            {expanded ? 'Show less' : `Show ${unpaidOrders.length - 5} more`}
          </button>
        )}
      </div>
    </Card>
  );
}

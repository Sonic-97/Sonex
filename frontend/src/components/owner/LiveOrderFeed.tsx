'use client';

import { useAppStore } from '@/store';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Clock } from 'lucide-react';
import { useEffect, useRef } from 'react';

export function LiveOrderFeed() {
  const orders = useAppStore((s) => s.orders);
  const orderIds = useAppStore((s) => s.orderIds);
  const feedEndRef = useRef<HTMLDivElement>(null);

  const feed = orderIds
    .map((id) => orders[id])
    .filter(Boolean)
    .slice(0, 20);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [orderIds.length]);

  if (feed.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-6 text-center text-sm text-gray-400">
        <Clock className="mx-auto mb-2 h-8 w-8 opacity-50" />
        Waiting for orders...
      </div>
    );
  }

  return (
    <div className="max-h-[600px] overflow-y-auto rounded-xl border bg-white">
      <div className="sticky top-0 border-b bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Live Order Feed
      </div>
      <div className="divide-y">
        {feed.map((order) => (
          <div
            key={order.id}
            className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-gray-50"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-mono text-sm font-bold text-gray-700">
                #{order.code}
              </span>
              <span className="truncate text-sm text-gray-500">
                {order.customer?.name || order.customer?.phone || 'Unknown'}
              </span>
              <span className="hidden text-xs text-gray-400 sm:inline">
                {order.type}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={order.status} />
              <span className="text-sm font-medium tabular-nums text-gray-600">
                ${Number(order.total).toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div ref={feedEndRef} />
    </div>
  );
}

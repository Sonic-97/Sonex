'use client';

import { useAppStore } from '@/store';
import { OrderCard } from './OrderCard';
import { useAudio } from '@/hooks/useAudio';
import { OrderStatus } from '@/types';
import { useEffect, useState } from 'react';
import { Coffee } from 'lucide-react';

const BATCH_STATUSES: OrderStatus[] = ['NEW', 'CONFIRMED', 'PREPARING'];

export function OrderQueue({ staffId }: { staffId?: string }) {
  const orders = useAppStore((s) => s.orders);
  const orderIds = useAppStore((s) => s.orderIds);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  useAudio();

  const queue = orderIds
    .map((id) => orders[id])
    .filter((o) => o && BATCH_STATUSES.includes(o.status))
    .sort((a, b) => {
      const priority: Record<string, number> = { NEW: 0, CONFIRMED: 1, ACCEPTED: 2, PREPARING: 3 };
      return (priority[a.status] ?? 99) - (priority[b.status] ?? 99);
    });

  // Track new orders for visual highlight
  useEffect(() => {
    const newIds = new Set(
      queue.filter((o) => o.status === 'NEW').map((o) => o.id)
    );
    if (newIds.size > 0) {
      setHighlightIds(newIds);
      const timer = setTimeout(() => setHighlightIds(new Set()), 3000);
      return () => clearTimeout(timer);
    }
  }, [queue.length]);

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Coffee className="mb-4 h-16 w-16 text-gray-200" />
        <p className="text-lg font-medium text-gray-400">No pending orders</p>
        <p className="text-sm text-gray-300">
          Waiting for new orders...
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {queue.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          isNew={highlightIds.has(order.id)}
          staffId={staffId}
        />
      ))}
    </div>
  );
}

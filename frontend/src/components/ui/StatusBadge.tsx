'use client';

import { OrderStatus } from '@/types';

const STATUS_STYLES: Record<OrderStatus, string> = {
  NEW: 'bg-blue-100 text-blue-700 border-blue-200',
  CONFIRMED: 'bg-teal-100 text-teal-700 border-teal-200',
  PREPARING: 'bg-amber-100 text-amber-700 border-amber-200',
  READY: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PICKED_UP: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  DELIVERED: 'bg-gray-100 text-gray-500 border-gray-200',
  PAID: 'bg-green-100 text-green-700 border-green-200',
  CLOSED: 'bg-gray-200 text-gray-600 border-gray-300',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] || STATUS_STYLES.NEW}`}
    >
      {status}
    </span>
  );
}

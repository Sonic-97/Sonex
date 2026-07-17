'use client';

import { useAppStore } from '@/store';
import { DollarSign } from 'lucide-react';

export function BaristaCashTotal({ staffId }: { staffId: string }) {
  const orders = useAppStore((s) => s.orders);
  const orderIds = useAppStore((s) => s.orderIds);

  const collected = orderIds
    .map((id) => orders[id])
    .filter((o) => o && o.collectedById === staffId && o.collectedRole === 'BARISTA')
    .reduce((sum, o) => sum + Number(o.amountPaid), 0);

  const today = new Date().toISOString().slice(0, 10);
  const todayCollected = orderIds
    .map((id) => orders[id])
    .filter((o) => {
      if (!o || o.collectedById !== staffId || o.collectedRole !== 'BARISTA') return false;
      const orderDate = o.paidAt ? o.paidAt.slice(0, 10) : o.createdAt.slice(0, 10);
      return orderDate === today;
    })
    .reduce((sum, o) => sum + Number(o.amountPaid), 0);

  return (
    <div className="flex items-center gap-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 p-4 text-white shadow-md">
      <div className="rounded-full bg-white/20 p-2.5">
        <DollarSign className="h-6 w-6" />
      </div>
      <div>
        <p className="text-xs font-medium text-emerald-100">Today&apos;s Collections</p>
        <p className="text-2xl font-bold">${todayCollected.toFixed(2)}</p>
        <p className="text-[10px] text-emerald-200">Total collected: ${collected.toFixed(2)}</p>
      </div>
    </div>
  );
}
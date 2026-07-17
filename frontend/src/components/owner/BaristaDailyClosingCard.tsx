'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store';
import { fetchBaristaClosing } from '@/lib/api';
import { BaristaDailyClosing } from '@/types';
import { Card } from '@/components/ui/Card';
import { UserCheck, DollarSign, ShoppingBag, CreditCard } from 'lucide-react';

export function BaristaDailyClosingCard() {
  const staff = useAppStore((s) => s.staff);
  const baristas = staff.filter((s) => s.role === 'barista');
  const [closings, setClosings] = useState<BaristaDailyClosing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const results = await Promise.all(
        baristas.map((b) => fetchBaristaClosing(b.id).catch(() => null)),
      );
      setClosings(results.filter(Boolean) as BaristaDailyClosing[]);
      setLoading(false);
    }
    if (baristas.length) load();
    else setLoading(false);
  }, [baristas]);

  if (loading || closings.length === 0) return null;

  return (
    <Card title="Barista Daily Closing" icon={<UserCheck className="h-5 w-5" />}>
      <div className="space-y-3">
        {closings.map((c) => {
          const barista = baristas.find((b) => b.id === c.baristaId);
          return (
            <div key={c.baristaId} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="mb-2 text-sm font-bold text-gray-800">{barista?.name || 'Barista'}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1 text-gray-500">
                  <ShoppingBag className="h-3 w-3" />
                  Orders: {c.combined.totalHandled}
                </div>
                <div className="flex items-center gap-1 text-gray-500">
                  <DollarSign className="h-3 w-3" />
                  Collected: ${c.combined.totalCashCollected.toFixed(2)}
                </div>
                <div className="flex items-center gap-1 text-gray-500">
                  <CreditCard className="h-3 w-3" />
                  Paid: {c.deliveryOrders.paidOrders + (c.cafeOrders.total > 0 ? 1 : 0)}
                </div>
                <div className="flex items-center gap-1 text-amber-600">
                  <CreditCard className="h-3 w-3" />
                  Unpaid: {c.deliveryOrders.unpaidOrders}
                </div>
              </div>
              {c.combined.totalOutstanding > 0 && (
                <p className="mt-1 text-xs font-medium text-red-500">
                  ${c.combined.totalOutstanding.toFixed(2)} outstanding
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store';
import { fetchDriverClosing } from '@/lib/api';
import { DriverDailyClosing } from '@/types';
import { Card } from '@/components/ui/Card';
import { Truck, DollarSign, CheckCircle, XCircle } from 'lucide-react';

export function DriverDailyClosingCard() {
  const drivers = useAppStore((s) => s.drivers);
  const [closings, setClosings] = useState<DriverDailyClosing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const results = await Promise.all(
        drivers.map((d) => fetchDriverClosing(d.id).catch(() => null)),
      );
      setClosings(results.filter(Boolean) as DriverDailyClosing[]);
      setLoading(false);
    }
    if (drivers.length) load();
    else setLoading(false);
  }, [drivers]);

  if (loading || closings.length === 0) return null;

  return (
    <Card title="Driver Daily Closing" icon={<Truck className="h-5 w-5" />}>
      <div className="space-y-3">
        {closings.map((c) => {
          const driver = drivers.find((d) => d.id === c.driverId);
          return (
            <div key={c.driverId} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="mb-2 text-sm font-bold text-gray-800">{driver?.name || 'Driver'}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1 text-gray-500">
                  <Truck className="h-3 w-3" />
                  Deliveries: {c.totalDeliveries}
                </div>
                <div className="flex items-center gap-1 text-gray-500">
                  <DollarSign className="h-3 w-3" />
                  Collected: ${c.cashCollected.toFixed(2)}
                </div>
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-3 w-3" />
                  Paid: {c.breakdown.fullyPaid}
                </div>
                <div className="flex items-center gap-1 text-red-600">
                  <XCircle className="h-3 w-3" />
                  Unpaid: {c.breakdown.unpaid}
                </div>
              </div>
              {c.uncollectedAmount > 0 && (
                <p className="mt-1 text-xs font-medium text-red-500">
                  ${c.uncollectedAmount.toFixed(2)} uncollected
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
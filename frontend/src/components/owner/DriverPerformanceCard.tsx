'use client';

import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/store';
import { Truck } from 'lucide-react';

export function DriverPerformanceCard() {
  const drivers = useAppStore((s) => s.drivers);
  const topDriver = useAppStore((s) => s.topFinancialDriver);

  const activeDrivers = drivers.filter((d) => d.active);

  const topEarner = topDriver
    ? `${topDriver.name} — ${topDriver.deliveries} deliveries`
    : null;

  return (
    <Card title="Driver Earnings" icon={<Truck className="h-5 w-5" />}>
      {topEarner ? (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-600">
            Top Driver
          </span>
          <p className="mt-0.5 font-medium text-amber-800">{topEarner}</p>
        </div>
      ) : (
        <p className="mb-3 text-sm text-gray-400">No driver data yet</p>
      )}

      {activeDrivers.length === 0 ? (
        <p className="text-sm text-gray-400">No active drivers</p>
      ) : (
        <div className="space-y-2">
          {activeDrivers.slice(0, 5).map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">{d.name}</span>
                {d.bonusEligible && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 uppercase">
                    Bonus
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-500">
                {d.totalDeliveries} deliveries
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 border-t pt-2 text-xs text-gray-400">
        {activeDrivers.length} active drivers
      </div>
    </Card>
  );
}

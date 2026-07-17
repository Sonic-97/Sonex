'use client';

import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/store';
import { Users } from 'lucide-react';

export function StaffPerformanceCard() {
  const staff = useAppStore((s) => s.staff);
  const topStaff = useAppStore((s) => s.topFinancialStaff);

  const baristas = staff.filter((s) => s.role === 'BARISTA' && s.active);

  const topEarner = topStaff
    ? `${topStaff.name} — $${topStaff.totalEarnings.toFixed(2)}`
    : null;

  return (
    <Card title="Staff Earnings" icon={<Users className="h-5 w-5" />}>
      {topEarner ? (
        <div className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-green-600">
            Top Earner
          </span>
          <p className="mt-0.5 font-medium text-green-800">{topEarner}</p>
        </div>
      ) : (
        <p className="mb-3 text-sm text-gray-400">No earnings data yet</p>
      )}

      <div className="space-y-2">
        {baristas.length === 0 ? (
          <p className="text-sm text-gray-400">No active baristas</p>
        ) : (
          baristas.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between text-sm"
            >
              <span className="font-medium text-gray-700">{s.name}</span>
              <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                {s.role}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 border-t pt-2 text-xs text-gray-400">
        {staff.filter((s) => s.active).length} active / {staff.length} total
      </div>
    </Card>
  );
}

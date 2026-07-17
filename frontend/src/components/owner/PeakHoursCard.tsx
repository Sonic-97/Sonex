'use client';

import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/store';
import { Clock, AlertTriangle } from 'lucide-react';

export function PeakHoursCard() {
  const dailySummary = useAppStore((s) => s.dailySummary);

  if (!dailySummary) {
    return (
      <Card title="ساعات الذروة" icon={<Clock className="h-5 w-5" />}>
        <p className="text-sm text-gray-400">لا توجد بيانات حتى الآن</p>
      </Card>
    );
  }

  const hour = dailySummary.peakHour;
  const period = hour >= 12 ? 'م' : 'ص';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

  return (
    <Card
      title="ساعات الذروة"
      icon={<Clock className="h-5 w-5" />}
    >
      <div className="space-y-3">
        <div>
          <p className="text-xs text-gray-500">ساعة الذروة اليوم</p>
          <p className="text-lg font-bold text-gray-800">
            {displayHour}:00 {period}
          </p>
          <p className="text-xs text-gray-400">
            {dailySummary.peakHourOrders} طلب خلال الذروة
          </p>
        </div>

        {dailySummary.topProduct && (
          <div className="rounded-lg bg-violet-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600">
              المنتج الأفضل
            </p>
            <p className="text-sm font-medium text-violet-800">
              {dailySummary.topProduct}
              <span className="ml-2 text-xs font-normal text-violet-500">
                ${dailySummary.topProductRevenue.toFixed(2)}
              </span>
            </p>
          </div>
        )}

        {dailySummary.underperformingStaff.length > 0 && (
          <div className="rounded-lg bg-amber-50 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              يحتاج انتباه
            </div>
            {dailySummary.underperformingStaff.slice(0, 2).map((s) => (
              <p key={s.name} className="text-xs text-amber-700">
                {s.name}: {s.orders} طلبات
              </p>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

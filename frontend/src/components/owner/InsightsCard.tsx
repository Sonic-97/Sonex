'use client';

import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/store';
import { Bell } from 'lucide-react';

const severityColors = {
  high: 'border-red-300 bg-red-50 text-red-700',
  medium: 'border-amber-300 bg-amber-50 text-amber-700',
  low: 'border-blue-300 bg-blue-50 text-blue-700',
};

const severityIcons = {
  high: '🔴',
  medium: '🟡',
  low: '🔵',
};

export function InsightsCard() {
  const alerts = useAppStore((s) => s.alerts);
  const dailySummary = useAppStore((s) => s.dailySummary);
  const health = useAppStore((s) => s.healthScore);

  if (!dailySummary) {
    return (
      <Card title="رؤى العمل" icon={<Bell className="h-5 w-5" />}>
        <p className="text-sm text-gray-400">لا توجد بيانات حتى الآن</p>
      </Card>
    );
  }

  return (
    <Card title="رؤى العمل" icon={<Bell className="h-5 w-5" />}>
      <div className="space-y-3">
        {alerts.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              تنبيهات ({alerts.length})
            </p>
            {alerts.slice(0, 3).map((alert, i) => (
              <div
                key={i}
                className={`rounded-lg border px-3 py-2 text-xs ${severityColors[alert.severity]}`}
              >
                <span className="mr-1">{severityIcons[alert.severity]}</span>
                {alert.message}
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <p>
            <span className="font-medium">ملخص: </span>
            {dailySummary.summary}
          </p>
        </div>

        {health && (
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
            <span className="text-gray-500">نقاط الصحة</span>
            <span className={`font-bold ${
              health.score >= 80 ? 'text-emerald-600' :
              health.score >= 60 ? 'text-blue-600' :
              health.score >= 40 ? 'text-amber-600' :
              'text-red-600'
            }`}>
              {health.score}/100 — {health.level}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-green-50 px-3 py-2 text-center">
            <p className="text-green-600 font-medium">{dailySummary.topStaffMember}</p>
            <p className="text-gray-500">أفضل موظف</p>
          </div>
          <div className="rounded-lg bg-blue-50 px-3 py-2 text-center">
            <p className="text-blue-600 font-medium">{dailySummary.topDriver}</p>
            <p className="text-gray-500">أفضل سائق</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

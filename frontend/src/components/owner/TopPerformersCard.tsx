'use client';

import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/store';
import { Trophy } from 'lucide-react';

export function TopPerformersCard() {
  const topPerformers = useAppStore((s) => s.topPerformers);
  const avgScore = useAppStore((s) => {
    const scores = s.staffPerformances.map((p) => p.overallScore);
    return scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;
  });

  return (
    <Card
      title="Top Performers"
      icon={<Trophy className="h-5 w-5 text-amber-500" />}
      subtitle={`Avg score: ${avgScore}/100`}
    >
      {topPerformers.length === 0 ? (
        <p className="text-sm text-gray-400">No performance data yet</p>
      ) : (
        <div className="space-y-3">
          {topPerformers.slice(0, 5).map((p, i) => (
            <div
              key={p.staffId}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  i === 0
                    ? 'bg-amber-100 text-amber-700'
                    : i === 1
                    ? 'bg-gray-100 text-gray-600'
                    : i === 2
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-gray-50 text-gray-400'
                }`}>
                  {i + 1}
                </span>
                <span className="truncate text-sm font-medium text-gray-700">
                  {p.staffName}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{p.ordersHandled} orders</span>
                <div className={`text-sm font-bold tabular-nums ${
                  p.overallScore >= 80
                    ? 'text-emerald-600'
                    : p.overallScore >= 60
                    ? 'text-blue-600'
                    : p.overallScore >= 40
                    ? 'text-amber-600'
                    : 'text-red-600'
                }`}>
                  {p.overallScore}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {topPerformers.length > 0 && (
        <div className="mt-3 border-t pt-2 text-xs text-gray-400">
          <div className="grid grid-cols-4 gap-1 text-center">
            <div><span className="font-medium text-emerald-600">{topPerformers[0]?.revenueScore ?? '-'}</span><br/>Revenue</div>
            <div><span className="font-medium text-blue-600">{topPerformers[0]?.efficiencyScore ?? '-'}</span><br/>Efficiency</div>
            <div><span className="font-medium text-violet-600">{topPerformers[0]?.speedScore ?? '-'}</span><br/>Speed</div>
            <div><span className="font-medium text-amber-600">{topPerformers[0]?.reliabilityScore ?? '-'}</span><br/>Reliability</div>
          </div>
        </div>
      )}
    </Card>
  );
}

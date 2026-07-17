'use client';

import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/store';
import { AlertTriangle } from 'lucide-react';

export function StaffScoreCard() {
  const underperformers = useAppStore((s) => s.underperformers);
  const dailyRanking = useAppStore((s) => s.dailyRanking);

  const hasIssues = underperformers.length > 0;
  const topThree = dailyRanking.slice(0, 3);

  return (
    <Card
      title="Staff Scoreboard"
      icon={<AlertTriangle className={`h-5 w-5 ${hasIssues ? 'text-red-500' : 'text-gray-400'}`} />}
      subtitle={`${dailyRanking.length} staff tracked`}
    >
      {topThree.length > 0 && (
        <div className="mb-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Today's Leaders
          </p>
          {topThree.map((s) => (
            <div key={s.staffId} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400">#{s.rank}</span>
                <span className="font-medium text-gray-700">{s.staffName}</span>
              </div>
              <span className={`text-xs font-bold tabular-nums ${
                s.overallScore >= 80 ? 'text-emerald-600' :
                s.overallScore >= 60 ? 'text-blue-600' :
                'text-amber-600'
              }`}>
                {s.overallScore}
              </span>
            </div>
          ))}
        </div>
      )}

      {hasIssues ? (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-500">
            Needs Attention ({underperformers.length})
          </p>
          {underperformers.slice(0, 3).map((u) => (
            <div
              key={u.staffId}
              className="rounded-lg border border-red-100 bg-red-50 px-3 py-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-red-700">{u.staffName}</span>
                <span className="text-sm font-bold text-red-600">{u.overallScore}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-red-500">{u.reason}</p>
              <div className="mt-1 flex gap-3 text-[10px] text-red-400">
                <span>{u.cancellationCount} cancelled</span>
                <span>{u.completionRate}% complete</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">All staff performing well today</p>
      )}
    </Card>
  );
}

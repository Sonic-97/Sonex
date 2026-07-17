'use client';

import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/store';
import { Lightbulb, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export function HealthScoreCard() {
  const health = useAppStore((s) => s.healthScore);

  if (!health) {
    return (
      <Card title="صحة العمل" icon={<Lightbulb className="h-5 w-5" />}>
        <p className="text-sm text-gray-400">جاري الحساب...</p>
      </Card>
    );
  }

  const colorMap = {
    excellent: 'text-emerald-600',
    good: 'text-blue-600',
    fair: 'text-amber-600',
    poor: 'text-orange-600',
    critical: 'text-red-600',
  };

  const bgMap = {
    excellent: 'bg-emerald-50 border-emerald-200',
    good: 'bg-blue-50 border-blue-200',
    fair: 'bg-amber-50 border-amber-200',
    poor: 'bg-orange-50 border-orange-200',
    critical: 'bg-red-50 border-red-200',
  };

  const TrendIcon = health.score >= 60 ? TrendingUp : health.score >= 40 ? Minus : TrendingDown;

  return (
    <Card
      title="صحة العمل"
      value={`${health.score}/100`}
      icon={<Lightbulb className={`h-5 w-5 ${colorMap[health.level]}`} />}
      subtitle={
        health.level === 'excellent' ? 'ممتاز' :
        health.level === 'good' ? 'جيد' :
        health.level === 'fair' ? 'مقبول' :
        health.level === 'poor' ? 'ضعيف' : 'حرج'
      }
    >
      <div className="mt-2 space-y-1.5">
        {[
          { label: 'استقرار الإيرادات', value: health.components.revenueStability },
          { label: 'هامش الربح', value: health.components.profitMargin },
          { label: 'احتفاظ العملاء', value: health.components.customerRetention },
          { label: 'أداء الموظفين', value: health.components.staffPerformance },
          { label: 'نسبة الديون', value: health.components.debtRatio, invert: true },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between text-xs">
            <span className="text-gray-500">{item.label}</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full transition-all ${
                    (item.invert ? 100 - item.value : item.value) >= 70
                      ? 'bg-emerald-400'
                      : (item.invert ? 100 - item.value : item.value) >= 40
                      ? 'bg-amber-400'
                      : 'bg-red-400'
                  }`}
                  style={{ width: `${item.invert ? 100 - item.value : item.value}%` }}
                />
              </div>
              <span className={`w-8 text-right font-medium tabular-nums ${
                item.invert && item.value > 50 ? 'text-red-500' : 'text-gray-600'
              }`}>
                {item.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

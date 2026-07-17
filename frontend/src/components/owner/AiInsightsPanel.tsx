'use client';

import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/store';
import { DecisionCard } from './DecisionCard';
import { Lightbulb, AlertTriangle, TrendingUp, Users } from 'lucide-react';

export function AiInsightsPanel() {
  const decisions = useAppStore((s) => s.decisions);

  const highRisk = decisions.filter((d) => d.severity === 'HIGH');
  const revenueDecisions = decisions.filter((d) => d.type === 'REVENUE' && d.severity !== 'HIGH');
  const staffDecisions = decisions.filter((d) => d.type === 'STAFF' && d.severity !== 'HIGH');
  const top3 = decisions.slice(0, 3);

  return (
    <div className="space-y-4">
      <Card
        title="رؤى الذكاء الاصطناعي"
        icon={<Lightbulb className="h-5 w-5 text-amber-500" />}
        subtitle={`تم إنشاء ${decisions.length} توصيات`}
      >
        {decisions.length === 0 ? (
          <p className="text-sm text-gray-400">لا توجد قرارات حتى الآن — ستظهر البيانات بعد معالجة الطلبات</p>
        ) : (
          <div className="space-y-2">
            {top3.map((d, i) => (
              <DecisionCard key={`${d.type}-${i}`} decision={d} />
            ))}
          </div>
        )}
      </Card>

      {highRisk.length > 0 && (
        <Card
          title="تنبيهات عالية الخطورة"
          icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
          subtitle={`${highRisk.length} تتطلب انتباه فوري`}
        >
          <div className="space-y-2">
            {highRisk.map((d, i) => (
              <DecisionCard key={`risk-${i}`} decision={d} />
            ))}
          </div>
        </Card>
      )}

      {revenueDecisions.length > 0 && (
        <Card
          title="فرص الإيرادات"
          icon={<TrendingUp className="h-5 w-5 text-emerald-500" />}
          subtitle="مرتبة حسب التأثير المتوقع"
        >
          <div className="space-y-2">
            {revenueDecisions.slice(0, 3).map((d, i) => (
              <DecisionCard key={`rev-${i}`} decision={d} />
            ))}
          </div>
        </Card>
      )}

      {staffDecisions.length > 0 && (
        <Card
          title="تحسين أداء الموظفين"
          icon={<Users className="h-5 w-5 text-blue-500" />}
          subtitle="نصائح الجدولة والأداء"
        >
          <div className="space-y-2">
            {staffDecisions.slice(0, 3).map((d, i) => (
              <DecisionCard key={`staff-${i}`} decision={d} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

'use client';

import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/store';
import { TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

export function ProfitCard() {
  const profit = useAppStore((s) => s.todayProfit);
  const revenue = useAppStore((s) => s.todayRevenue);

  const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0.0';

  return (
    <Card
      title="تقدير الربح"
      value={formatCurrency(profit)}
      icon={<TrendingUp className="h-5 w-5" />}
      subtitle={`${margin}% هامش`}
    />
  );
}

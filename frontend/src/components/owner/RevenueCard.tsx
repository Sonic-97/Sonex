'use client';

import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/store';
import { DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

export function RevenueCard() {
  const revenue = useAppStore((s) => s.todayRevenue);

  return (
    <Card
      title="إيرادات اليوم"
      value={formatCurrency(revenue)}
      icon={<DollarSign className="h-5 w-5" />}
      subtitle="التوصيلات المؤكدة فقط"
    />
  );
}

'use client';

import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/store';
import { ClipboardList } from 'lucide-react';

export function ActiveOrdersCard() {
  const pending = useAppStore((s) => s.pendingOrdersCount);
  const today = useAppStore((s) => s.todayOrders);

  return (
    <Card
      title="Active Orders"
      value={pending}
      icon={<ClipboardList className="h-5 w-5" />}
      subtitle={`${today} completed today`}
    />
  );
}

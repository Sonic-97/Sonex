'use client';

import { EmptyState } from '@/components/ui/EmptyState';

export default function OrdersPage() {
  return (
    <div className="animate-fade-in-up">
      <EmptyState
        icon="inbox"
        title="Orders"
        description="Orders module — coming soon."
      />
    </div>
  );
}

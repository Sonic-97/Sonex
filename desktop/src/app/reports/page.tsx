'use client';

import { EmptyState } from '@/components/ui/EmptyState';

export default function ReportsPage() {
  return (
    <div className="animate-fade-in-up">
      <EmptyState
        icon="file"
        title="Reports"
        description="Reports module coming soon."
      />
    </div>
  );
}

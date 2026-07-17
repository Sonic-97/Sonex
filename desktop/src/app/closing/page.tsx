'use client';

import { EmptyState } from '@/components/ui/EmptyState';

export default function ClosingPage() {
  return (
    <div className="animate-fade-in-up">
      <EmptyState
        icon="file"
        title="Daily Closing"
        description="Daily closing reports coming soon."
      />
    </div>
  );
}

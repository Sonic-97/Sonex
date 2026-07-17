'use client';

import { EmptyState } from '@/components/ui/EmptyState';

export default function ExpensesPage() {
  return (
    <div className="animate-fade-in-up">
      <EmptyState
        icon="inbox"
        title="Expenses"
        description="Expense tracking coming soon."
      />
    </div>
  );
}

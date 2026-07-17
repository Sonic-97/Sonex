'use client';

import { EmptyState } from '@/components/ui/EmptyState';

export default function EmployeesPage() {
  return (
    <div className="animate-fade-in-up">
      <EmptyState
        icon="users"
        title="Employees"
        description="Employee management coming soon."
      />
    </div>
  );
}

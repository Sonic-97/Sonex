'use client';

import { EmptyState } from '@/components/ui/EmptyState';
import { Package } from 'lucide-react';

export default function ProductsPage() {
  return (
    <div className="animate-fade-in-up">
      <EmptyState
        icon="inbox"
        title="Products"
        description="Product management coming soon."
      />
    </div>
  );
}

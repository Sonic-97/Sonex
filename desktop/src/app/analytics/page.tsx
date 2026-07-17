'use client';

import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { SkeletonSummary } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StaggerChildren } from '@/components/ui/PageTransition';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BarChart3 } from 'lucide-react';

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Analytics</h2>
        <p className="mt-0.5 text-sm text-text-secondary">Business intelligence and performance metrics.</p>
      </div>

      {loading ? (
        <SkeletonSummary cards={4} />
      ) : (
        <>
          <StaggerChildren className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card hover>
              <CardDescription>Total Revenue</CardDescription>
              <CardTitle className="mt-1 text-2xl tabular-nums">EGP 0</CardTitle>
            </Card>
            <Card hover>
              <CardDescription>Total Orders</CardDescription>
              <CardTitle className="mt-1 text-2xl tabular-nums">0</CardTitle>
            </Card>
            <Card hover>
              <CardDescription>Avg Order Value</CardDescription>
              <CardTitle className="mt-1 text-2xl tabular-nums">EGP 0</CardTitle>
            </Card>
            <Card hover>
              <CardDescription>Growth</CardDescription>
              <CardTitle className="mt-1 text-2xl tabular-nums">0%</CardTitle>
            </Card>
          </StaggerChildren>

          <EmptyState
            icon="file"
            title="Analytics data coming soon"
            description="Charts and detailed metrics will appear here."
          />
        </>
      )}
    </div>
  );
}

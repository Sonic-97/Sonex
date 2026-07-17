'use client';

import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SkeletonSummary } from '@/components/ui/Skeleton';
import { StaggerChildren } from '@/components/ui/PageTransition';
import { Spinner } from '@/components/ui/Spinner';
import { useCountUp } from '@/hooks/useCountUp';
import { useAppStore } from '@/store';
import { Wifi, WifiOff, Database, RefreshCw, Brain } from 'lucide-react';

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  loading = false,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  loading?: boolean;
}) {
  const animated = useCountUp(loading ? 0 : value, 800);

  return (
    <Card hover className="animate-fade-in-up">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <CardDescription>{label}</CardDescription>
          <CardTitle className="mt-0.5 text-2xl tabular-nums">
            {loading ? <Spinner size="sm" /> : animated}
          </CardTitle>
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { health, online, syncStatus } = useAppStore();
  const loading = !health;

  return (
    <div className="space-y-6">
      <StaggerChildren className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today's Revenue" value={0} icon={Database} color="bg-copper-100 text-copper-700 dark:bg-copper-900/30 dark:text-copper-400" loading={loading} />
        <StatCard label="Orders Today" value={0} icon={RefreshCw} color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" loading={loading} />
        <StatCard label="Active Employees" value={0} icon={Brain} color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" loading={loading} />
        <StatCard label="Low Stock Items" value={0} icon={Wifi} color="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" loading={loading} />
      </StaggerChildren>

      <Card className="animate-fade-in-up stagger-3">
        <CardTitle>System Status</CardTitle>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-surface-secondary px-4 py-2.5 dark:bg-dark-surface-secondary">
            <span className="text-sm text-text-secondary dark:text-dark-text-secondary">Backend</span>
            <Badge variant={health?.status === 'ok' ? 'success' : 'warning'} dot>
              {health?.status || 'disconnected'}
            </Badge>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-surface-secondary px-4 py-2.5 dark:bg-dark-surface-secondary">
            <span className="text-sm text-text-secondary dark:text-dark-text-secondary">Database</span>
            <Badge variant={health?.dbConnected ? 'success' : 'danger'} dot>
              {health?.dbConnected ? 'connected' : 'disconnected'}
            </Badge>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-surface-secondary px-4 py-2.5 dark:bg-dark-surface-secondary">
            <span className="text-sm text-text-secondary dark:text-dark-text-secondary">Network</span>
            <Badge variant={online ? 'success' : 'warning'} dot>
              <span className="flex items-center gap-1">
                {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {online ? 'online' : 'offline'}
              </span>
            </Badge>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-surface-secondary px-4 py-2.5 dark:bg-dark-surface-secondary">
            <span className="text-sm text-text-secondary dark:text-dark-text-secondary">Sync</span>
            <Badge variant={syncStatus === 'error' ? 'danger' : 'default'} dot>
              {syncStatus}
            </Badge>
          </div>
          {health && (
            <div className="flex items-center justify-between rounded-lg bg-surface-secondary px-4 py-2.5 dark:bg-dark-surface-secondary">
              <span className="text-sm text-text-secondary dark:text-dark-text-secondary">Version</span>
              <span className="text-sm font-medium text-text-primary dark:text-dark-text-primary font-mono">
                v{health.version}
              </span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { api, isApiError } from '@/lib/api';
import type {
  SyncStatus,
  SyncReport,
  SyncQueueEntry,
} from '@/types';
import {
  RefreshCw,
  Upload,
  Download,
  Wifi,
  WifiOff,
  Lock,
  Unlock,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
} from 'lucide-react';

export default function SyncPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [queue, setQueue] = useState<SyncQueueEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authCafeId, setAuthCafeId] = useState('');
  const [authOwnerCode, setAuthOwnerCode] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authResult, setAuthResult] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [s, r, q] = await Promise.all([
        api.sync.status().catch(() => null),
        api.sync.report().catch(() => null),
        api.sync.queue().catch(() => [] as SyncQueueEntry[]),
      ]);
      if (s) setStatus(s);
      if (r) setReport(r);
      if (q) setQueue(q);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await api.sync.trigger();
      await fetchAll();
    } catch (e) {
      setError(isApiError(e) ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleAuth = async () => {
    setAuthResult(null);
    try {
      const resp = await api.sync.authenticate(authCafeId, authOwnerCode, authPassword);
      setAuthResult(`Authenticated as ${resp.cafeName}`);
      await fetchAll();
    } catch (e) {
      setAuthResult(isApiError(e) ? e.message : 'Auth failed');
    }
  };

  const handleRetry = async () => {
    try {
      await api.sync.retryFailed();
      await fetchAll();
    } catch {
      // silent
    }
  };

  const sec = (d: number | undefined | null) => (d ?? 0).toFixed(1);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Sync Monitor</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Cloud synchronization status and controls.
          </p>
        </div>
        <Button onClick={handleSync} loading={syncing}>
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          Sync Now
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Status Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-text-tertiary">Connection</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">
                {status?.online ? 'Online' : 'Offline'}
              </p>
            </div>
            {status?.online
              ? <Wifi className="h-5 w-5 text-emerald-500" />
              : <WifiOff className="h-5 w-5 text-red-500" />
            }
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-text-tertiary">Auth</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">
                {status?.authenticated ? 'Authenticated' : 'Not Authenticated'}
              </p>
            </div>
            {status?.authenticated
              ? <Lock className="h-5 w-5 text-emerald-500" />
              : <Unlock className="h-5 w-5 text-amber-500" />
            }
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-text-tertiary">Encryption</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">
                {status?.encryptionEnabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
            {status?.encryptionEnabled
              ? <Lock className="h-5 w-5 text-emerald-500" />
              : <Lock className="h-5 w-5 text-text-tertiary" />
            }
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-text-tertiary">Last Sync</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">
                {status?.lastSyncAt
                  ? new Date(status.lastSyncAt).toLocaleTimeString()
                  : 'Never'
                }
              </p>
            </div>
            <Clock className="h-5 w-5 text-text-tertiary" />
          </div>
        </Card>
      </div>

      {/* Queue Stats */}
      <Card>
        <CardTitle>Queue Statistics</CardTitle>
        <CardDescription className="mt-1">
          Pending uploads and sync queue status.
        </CardDescription>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <Upload className="h-5 w-5 text-copper-500" />
            <div>
              <p className="text-xs text-text-tertiary">Pending</p>
              <p className="text-xl font-semibold text-text-primary">{report?.queueStats.pending ?? status?.pendingCount ?? 0}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <Download className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-xs text-text-tertiary">Completed</p>
              <p className="text-xl font-semibold text-text-primary">{report?.queueStats.completed ?? status?.completedCount ?? 0}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-xs text-text-tertiary">Failed</p>
              <p className="text-xl font-semibold text-text-primary">{report?.queueStats.failed ?? status?.failedCount ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <RefreshCw className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xs text-text-tertiary">Conflicts</p>
              <p className="text-xl font-semibold text-text-primary">{report?.queueStats.conflict ?? status?.conflictCount ?? 0}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <RefreshCw className="h-5 w-5 text-text-tertiary" />
            <div>
              <p className="text-xs text-text-tertiary">Total Retries</p>
              <p className="text-xl font-semibold text-text-primary">{report?.queueStats.totalRetries ?? 0}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <FileText className="h-5 w-5 text-text-tertiary" />
            <div>
              <p className="text-xs text-text-tertiary">Total Items</p>
              <p className="text-xl font-semibold text-text-primary">{report?.queueStats.total ?? 0}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Progress */}
      {report && report.progress.phase !== 'idle' && (
        <Card>
          <CardTitle>Current Progress</CardTitle>
          <CardDescription className="mt-1">
            Active sync cycle status.
          </CardDescription>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">Phase</span>
              <Badge variant="default">{report.progress.phase}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">Progress</span>
              <span className="font-medium text-text-primary">
                {report.progress.currentItem} / {report.progress.totalItems}
                {' '}({report.progress.percentage.toFixed(1)}%)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-hover">
              <div
                className="h-full rounded-full bg-copper-500 transition-all duration-300"
                style={{ width: `${Math.min(report.progress.percentage, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">
                <CheckCircle className="mr-1 inline h-3 w-3 text-emerald-500" />
                {report.progress.itemsSucceeded} succeeded
              </span>
              <span className="text-text-secondary">
                <XCircle className="mr-1 inline h-3 w-3 text-red-500" />
                {report.progress.itemsFailed} failed
              </span>
            </div>
            {report.progress.message && (
              <p className="text-xs text-text-tertiary">{report.progress.message}</p>
            )}
          </div>
        </Card>
      )}

      {/* Last Sync Details */}
      <Card>
        <CardTitle>Last Sync</CardTitle>
        <CardDescription className="mt-1">
          Details of the most recent synchronization.
        </CardDescription>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">Status</span>
            <Badge variant={report?.lastSync.success ? 'success' : 'danger'}>
              {report?.lastSync.success ? 'Success' : 'Failed'}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">Duration</span>
            <span className="font-medium text-text-primary">{sec(report?.lastSync.durationSeconds)}s</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">Items Synced</span>
            <span className="font-medium text-text-primary">{report?.lastSync.itemsSynced ?? 0}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">Version</span>
            <span className="font-medium text-text-primary">v{report?.lastSync.version ?? 0}</span>
          </div>
          {report?.lastSync.error && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">Error</span>
              <span className="font-medium text-red-500">{report.lastSync.error}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Failed Queue */}
      {queue.length > 0 && (
        <Card>
          <CardTitle>Failed Items</CardTitle>
          <CardDescription className="mt-1">
            Items that failed to sync. Retry or inspect errors.
          </CardDescription>
          <div className="mt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-tertiary">
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">ID</th>
                    <th className="pb-2 pr-4 font-medium">Operation</th>
                    <th className="pb-2 pr-4 font-medium">Retries</th>
                    <th className="pb-2 pr-4 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.slice(0, 20).map((item) => (
                    <tr key={item.id} className="border-b border-border text-text-secondary">
                      <td className="py-2 pr-4 font-mono text-xs">{item.entityType}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{item.entityId}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="warning">{item.operation}</Badge>
                      </td>
                      <td className="py-2 pr-4">{item.retryCount}</td>
                      <td className="py-2 pr-4 max-w-[200px] truncate text-red-500" title={item.lastError ?? ''}>
                        {item.lastError ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={handleRetry}>
                <RefreshCw className="h-4 w-4" />
                Retry Failed ({queue.length})
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Authenticate */}
      <Card>
        <CardTitle>Authentication</CardTitle>
        <CardDescription className="mt-1">
          Authenticate with the Sonex Cloud server.
        </CardDescription>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Input
            label="Cafe ID"
            placeholder="e.g. cafe-1"
            value={authCafeId}
            onChange={(e) => setAuthCafeId(e.target.value)}
          />
          <Input
            label="Owner Code"
            placeholder="owner code"
            value={authOwnerCode}
            onChange={(e) => setAuthOwnerCode(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            placeholder="password"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
          />
        </div>
        {authResult && (
          <p className={`mt-2 text-sm ${authResult.includes('Authenticated') ? 'text-emerald-600' : 'text-red-500'}`}>
            {authResult}
          </p>
        )}
        <div className="mt-4 flex justify-end">
          <Button onClick={handleAuth}>
            <Lock className="h-4 w-4" />
            Authenticate
          </Button>
        </div>
      </Card>

      {/* Entity Counts */}
      {report && report.entityCounts.length > 0 && (
        <Card>
          <CardTitle>Entity Counts</CardTitle>
          <CardDescription className="mt-1">
            Entities tracked by the sync engine.
          </CardDescription>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {report.entityCounts.map((ec) => (
              <div key={ec.entityType} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span className="text-text-secondary">{ec.entityType}</span>
                <span className="font-semibold text-text-primary">{ec.count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

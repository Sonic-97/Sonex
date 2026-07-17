'use client';

import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useSettings } from '@/hooks/useSettings';
import { useAppStore } from '@/store';
import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const { settings, changeThemeMode } = useSettings();
  const { health } = useAppStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border p-5 space-y-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
        <p className="mt-0.5 text-sm text-text-secondary">Configure your Sonex Desktop experience.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Theme</CardTitle>
          <CardDescription className="mt-1">Choose your preferred appearance.</CardDescription>
          <div className="mt-4 flex gap-2">
            {(['light', 'dark', 'system'] as const).map((mode) => (
              <Button
                key={mode}
                variant={settings.theme.mode === mode ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => changeThemeMode(mode)}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Button>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>Cafe</CardTitle>
          <CardDescription className="mt-1">Your cafe identity.</CardDescription>
          <div className="mt-4 space-y-3">
            <Input label="Cafe ID" value={settings.cafe.cafeId} disabled />
            <Input label="Cafe Name" value={settings.cafe.cafeName} disabled />
            <Input label="Branch" value={settings.cafe.branchName} disabled />
          </div>
        </Card>

        <Card>
          <CardTitle>Sync</CardTitle>
          <CardDescription className="mt-1">Cloud synchronization preferences.</CardDescription>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Auto Sync</span>
              <span className="text-sm font-medium text-text-primary">{settings.sync.autoSync ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Interval</span>
              <span className="text-sm font-medium text-text-primary tabular-nums">{settings.sync.syncIntervalSeconds}s</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Last Sync</span>
              <span className="text-sm font-medium text-text-primary">{settings.sync.lastSyncAt ? new Date(settings.sync.lastSyncAt).toLocaleString() : 'Never'}</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>Printer</CardTitle>
          <CardDescription className="mt-1">Receipt printer configuration.</CardDescription>
          <div className="mt-4 space-y-3">
            <Input label="Printer" value={settings.printer.receiptPrinter} disabled />
            <Input label="Paper Width" value={`${settings.printer.paperWidthMm}mm`} disabled />
          </div>
        </Card>

        {health && (
          <Card>
            <CardTitle>System</CardTitle>
            <CardDescription className="mt-1">Desktop backend status.</CardDescription>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Version</span>
                <span className="text-sm font-medium font-mono text-text-primary">v{health.version}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Uptime</span>
                <span className="text-sm font-medium tabular-nums text-text-primary">{Math.floor(health.uptimeSeconds / 60)}m</span>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

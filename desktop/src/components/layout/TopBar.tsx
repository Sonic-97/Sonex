'use client';
import React, { memo } from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import { useTheme } from '@/hooks/useTheme';
import { Menu, Sun, Moon, Monitor, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface TopBarProps { title: string; onMenuToggle: () => void; }

export function TopBar({ title, onMenuToggle }: TopBarProps) {
  const { resolved, setMode } = useTheme();
  const { online, syncStatus } = useAppStore();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur-md dark:border-dark-border dark:bg-dark-surface/80">
      <button
        onClick={onMenuToggle}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-copper-500 md:hidden"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-4 w-4" />
      </button>
      <h1 className="text-base font-semibold text-text-primary dark:text-dark-text-primary truncate">{title}</h1>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        {syncStatus === 'syncing' && (
          <Badge variant="info">
            <RefreshCw className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
            Syncing
          </Badge>
        )}
        <Badge variant={online ? 'success' : 'warning'} dot>
          <span className="flex items-center gap-1">
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? 'Online' : 'Offline'}
          </span>
        </Badge>
        <div className="flex items-center rounded-lg border border-border bg-surface-secondary p-0.5 dark:border-dark-border dark:bg-dark-surface-secondary">
          <button onClick={() => setMode('light')}
            className={cn('flex h-7 w-7 items-center justify-center rounded-md transition', resolved === 'light' ? 'bg-surface text-text-primary shadow-sm dark:bg-dark-surface dark:text-dark-text-primary' : 'text-text-tertiary hover:text-text-secondary')}
            aria-label="Light mode" aria-pressed={resolved === 'light'}>
            <Sun className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setMode('dark')}
            className={cn('flex h-7 w-7 items-center justify-center rounded-md transition', resolved === 'dark' ? 'bg-surface text-text-primary shadow-sm dark:bg-dark-surface dark:text-dark-text-primary' : 'text-text-tertiary hover:text-text-secondary')}
            aria-label="Dark mode" aria-pressed={resolved === 'dark'}>
            <Moon className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setMode('system')}
            className={cn('flex h-7 w-7 items-center justify-center rounded-md transition', resolved === 'light' || resolved === 'dark' ? 'text-text-tertiary hover:text-text-secondary' : 'bg-surface text-text-primary shadow-sm dark:bg-dark-surface dark:text-dark-text-primary')}
            aria-label="System theme" aria-pressed={resolved !== 'light' && resolved !== 'dark'}>
            <Monitor className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}

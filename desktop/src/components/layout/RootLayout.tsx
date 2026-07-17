'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useTheme } from '@/hooks/useTheme';
import { useAppStore } from '@/store';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { api } from '@/lib/api';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard', '/pos': 'POS', '/products': 'Products', '/inventory': 'Inventory',
  '/customers': 'Customers', '/orders': 'Orders', '/employees': 'Employees',
  '/reports': 'Reports', '/analytics': 'Analytics', '/expenses': 'Expenses',
  '/closing': 'Daily Closing', '/sync': 'Sync Monitor', '/ai': 'AI Assistant', '/settings': 'Settings',
};

const pageDescriptions: Record<string, string> = {
  '/': 'Your cafe operations at a glance',
  '/sync': 'Cloud synchronization status and controls',
  '/ai': 'Copilot, insights, anomaly detection, and NLP parsing',
};

export function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { open, closePalette, toggle } = useCommandPalette();
  const { resolved } = useTheme();
  const { setHealth, setOnline } = useAppStore();
  const prefersReduced = useReducedMotion();

  useKeyboard({
    'Ctrl+B': () => setSidebarCollapsed((v) => !v),
    'Cmd+B': () => setSidebarCollapsed((v) => !v),
    'Ctrl+K': toggle,
    'Cmd+K': toggle,
  });

  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      try {
        const health = await api.health();
        if (mounted) setHealth(health);
      } catch {
        if (mounted) setHealth(null);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, [setHealth]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline, { passive: true });
    window.addEventListener('offline', handleOffline, { passive: true });
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);

  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), []);

  const title = pageTitles[pathname] || 'Sonex';
  const description = pageDescriptions[pathname];

  return (
    <div className={`flex h-screen ${resolved === 'dark' ? 'dark' : ''}`}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={title} onMenuToggle={toggleSidebar} />
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>
            <div
              className={`mx-auto max-w-[1440px] p-6 ${
                prefersReduced ? '' : 'animate-fade-in-up'
              }`}
            >
              {description && (
                <p className="mb-6 text-sm text-text-secondary">{description}</p>
              )}
              {children}
            </div>
          </ErrorBoundary>
        </main>
      </div>
      <CommandPalette open={open} onClose={closePalette} />
    </div>
  );
}

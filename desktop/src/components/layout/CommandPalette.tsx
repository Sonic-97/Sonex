'use client';
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Search, LayoutDashboard, ShoppingCart, Package, Box, Users, ClipboardList, BarChart3, TrendingUp, CreditCard, DollarSign, Settings, Command, Brain, RefreshCw } from 'lucide-react';
import { Kbd } from '@/components/ui/Kbd';

interface CommandItem {
  id: string; label: string; description?: string;
  icon: React.ComponentType<{ className?: string }>; href: string; shortcut?: string;
}

const commands: CommandItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/', shortcut: '⌘1' },
  { id: 'pos', label: 'POS', icon: ShoppingCart, href: '/pos', shortcut: '⌘2' },
  { id: 'products', label: 'Products', icon: Package, href: '/products', shortcut: '⌘3' },
  { id: 'inventory', label: 'Inventory', icon: Box, href: '/inventory', shortcut: '⌘4' },
  { id: 'customers', label: 'Customers', icon: Users, href: '/customers', shortcut: '⌘5' },
  { id: 'orders', label: 'Orders', icon: ClipboardList, href: '/orders', shortcut: '⌘6' },
  { id: 'employees', label: 'Employees', icon: BarChart3, href: '/employees', shortcut: '⌘7' },
  { id: 'reports', label: 'Reports', icon: TrendingUp, href: '/reports', shortcut: '⌘8' },
  { id: 'analytics', label: 'Analytics', icon: CreditCard, href: '/analytics', shortcut: '⌘9' },
  { id: 'expenses', label: 'Expenses', icon: DollarSign, href: '/expenses', shortcut: '⌘0' },
  { id: 'sync', label: 'Sync Monitor', icon: RefreshCw, href: '/sync', shortcut: '⌘S' },
  { id: 'ai', label: 'AI Assistant', icon: Brain, href: '/ai', shortcut: '⌘A' },
  { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
];

interface CommandPaletteProps { open: boolean; onClose: () => void; }

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = query.trim()
    ? commands.filter((cmd) =>
        cmd.label.toLowerCase().includes(query.toLowerCase()) ||
        cmd.id.includes(query.toLowerCase())
      )
    : commands;

  const navigate = useCallback(
    (href: string) => { router.push(href); onClose(); setQuery(''); },
    [router, onClose]
  );

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 50); setQuery(''); setSelectedIndex(0); }
  }, [open]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && filtered[selectedIndex]) { navigate(filtered[selectedIndex].href); }
      if (e.key === 'Escape') { onClose(); }
    };
    window.addEventListener('keydown', handler, { passive: false });
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, selectedIndex, navigate, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh] backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="w-full max-w-[560px] rounded-xl border border-border bg-surface shadow-modal animate-scale-in-spring overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages and actions..."
            className="h-12 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
            aria-label="Search command"
          />
          <Kbd>ESC</Kbd>
        </div>
        <div ref={listRef} className="max-h-[280px] overflow-y-auto p-2 scrollbar-thin" role="listbox" aria-label="Commands">
          {filtered.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => navigate(item.href)}
                className={cn(
                  'flex h-10 w-full items-center gap-3 rounded-lg px-2 text-sm transition-all duration-100',
                  index === selectedIndex
                    ? 'bg-copper-50 text-copper-800 dark:bg-copper-900/20 dark:text-copper-300'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary dark:text-dark-text-secondary dark:hover:bg-dark-surface-hover dark:hover:text-dark-text-primary'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 text-left truncate">{item.label}</span>
                {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="flex h-20 items-center justify-center text-sm text-text-tertiary">No results found</div>
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-text-tertiary">
          <span className="flex items-center gap-1.5"><Command className="h-3 w-3" /><Kbd>K</Kbd> Open</span>
          <span className="flex items-center gap-1.5"><Kbd>↑↓</Kbd> Navigate</span>
          <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> Open page</span>
        </div>
      </div>
    </div>
  );
}

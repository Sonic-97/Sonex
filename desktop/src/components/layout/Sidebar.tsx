'use client';
import React, { memo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Box,
  Users,
  ClipboardList,
  BarChart3,
  TrendingUp,
  CreditCard,
  DollarSign,
  Settings,
  RefreshCw,
  Brain,
  X,
} from 'lucide-react';
import { Kbd } from '@/components/ui/Kbd';
import type { NavItem } from '@/types';

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', shortcut: '1', href: '/' },
  { id: 'pos', label: 'POS', icon: 'ShoppingCart', shortcut: '2', href: '/pos' },
  { id: 'products', label: 'Products', icon: 'Package', shortcut: '3', href: '/products' },
  { id: 'inventory', label: 'Inventory', icon: 'Box', shortcut: '4', href: '/inventory' },
  { id: 'customers', label: 'Customers', icon: 'Users', shortcut: '5', href: '/customers' },
  { id: 'orders', label: 'Orders', icon: 'ClipboardList', shortcut: '6', href: '/orders' },
  { id: 'employees', label: 'Employees', icon: 'BarChart3', shortcut: '7', href: '/employees' },
  { id: 'reports', label: 'Reports', icon: 'TrendingUp', shortcut: '8', href: '/reports' },
  { id: 'analytics', label: 'Analytics', icon: 'CreditCard', shortcut: '9', href: '/analytics' },
  { id: 'expenses', label: 'Expenses', icon: 'DollarSign', shortcut: '0', href: '/expenses' },
  { id: 'sync', label: 'Sync', icon: 'RefreshCw', shortcut: 'S', href: '/sync' },
  { id: 'ai', label: 'AI', icon: 'Brain', shortcut: 'A', href: '/ai' },
];

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, ShoppingCart, Package, Box, Users,
  ClipboardList, BarChart3, TrendingUp, CreditCard, DollarSign,
  RefreshCw, Brain,
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const NavLink = memo(function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = iconMap[item.icon];
  if (!Icon) return null;

  return (
    <Link
      key={item.id}
      href={item.href}
      className={cn(
        'flex h-9 items-center gap-3 rounded-lg px-2 text-sm font-medium transition-all duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        active
          ? 'bg-copper-50 text-copper-800 dark:bg-copper-900/20 dark:text-copper-300'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary dark:text-dark-text-secondary dark:hover:bg-dark-surface-hover dark:hover:text-dark-text-primary'
      )}
      aria-current={active ? 'page' : undefined}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          <Kbd>{item.shortcut === '0' ? '0' : `⌘${item.shortcut}`}</Kbd>
        </>
      )}
    </Link>
  );
});

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {!collapsed && (
        <div
          className="fixed inset-0 z-20 bg-black/20 md:hidden animate-fade-in"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-30 flex flex-col border-l border-border bg-surface transition-all duration-200 ease-out md:static md:z-0',
          'dark:bg-dark-surface dark:border-dark-border',
          collapsed ? 'w-0 border-l-0 md:w-[56px]' : 'w-[240px]'
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-14 shrink-0 items-center border-b border-border px-4 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-copper-700 text-sm font-bold text-white">
              S
            </div>
            {!collapsed && (
              <div>
                <div className="text-sm font-semibold text-text-primary dark:text-dark-text-primary">
                  Sonex
                </div>
                <div className="text-[11px] text-text-tertiary dark:text-dark-text-tertiary">
                  Desktop Edition
                </div>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 scrollbar-thin">
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              item={item}
              active={pathname === item.href}
              collapsed={collapsed}
            />
          ))}
        </nav>

        <div className="border-t border-border p-2 dark:border-dark-border">
          <Link
            href="/settings"
            className={cn(
              'flex h-9 items-center gap-3 rounded-lg px-2 text-sm font-medium transition-all duration-150 ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper-500',
              pathname === '/settings'
                ? 'bg-copper-50 text-copper-800 dark:bg-copper-900/20 dark:text-copper-300'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary dark:text-dark-text-secondary dark:hover:bg-dark-surface-hover dark:hover:text-dark-text-primary'
            )}
          >
            <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span>Settings</span>}
          </Link>
        </div>
      </aside>
    </>
  );
}

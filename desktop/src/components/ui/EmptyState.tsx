'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Inbox, Search, Package, Users, FileText, AlertCircle } from 'lucide-react';

const icons = { inbox: Inbox, search: Search, package: Package, users: Users, file: FileText, alert: AlertCircle };

interface EmptyStateProps {
  icon?: keyof typeof icons;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ icon = 'inbox', title, description, action, className }: EmptyStateProps) {
  const Icon = icons[icon];

  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-secondary/50 px-6 py-16 text-center', className)}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-tertiary">
        <Icon className="h-8 w-8 text-text-tertiary" />
      </div>
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-text-secondary">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} className="mt-6">
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function EmptyRow({ colSpan, message = 'No data' }: { colSpan: number; message?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-16 text-center">
        <div className="flex flex-col items-center gap-2">
          <Inbox className="h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">{message}</p>
        </div>
      </td>
    </tr>
  );
}

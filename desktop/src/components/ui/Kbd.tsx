'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-surface-secondary px-1.5 text-[11px] font-medium text-text-tertiary',
        'font-mono leading-none',
        className
      )}
    >
      {children}
    </kbd>
  );
}

'use client';
import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
  hover?: boolean;
  glass?: boolean;
}

export function Card({ children, className, padding = 'md', hover = false, glass = false }: CardProps) {
  const paddings = { sm: 'p-3', md: 'p-5', lg: 'p-8' };

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface shadow-sm transition-all duration-200 ease-out',
        paddings[padding],
        hover && 'cursor-pointer card-hover',
        glass && 'glass',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mb-4 flex items-center justify-between', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn('text-base font-semibold text-text-primary', className)}>{children}</h3>;
}

export function CardDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-sm text-text-secondary', className)}>{children}</p>;
}

'use client';
import React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium rounded-lg ' +
    'transition-all duration-150 ease-out ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-copper-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
    'active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ' +
    'select-none';

  const variants = {
    primary:
      'bg-copper-700 text-white shadow-sm ' +
      'hover:bg-copper-800 hover:shadow-md ' +
      'dark:bg-copper-600 dark:hover:bg-copper-500',
    secondary:
      'bg-surface-secondary text-text-primary border border-border ' +
      'hover:bg-surface-hover hover:border-copper-300 ' +
      'dark:bg-dark-surface-secondary dark:border-dark-border dark:text-dark-text-primary dark:hover:bg-dark-surface-hover',
    ghost:
      'text-text-secondary ' +
      'hover:bg-surface-hover hover:text-text-primary ' +
      'dark:text-dark-text-secondary dark:hover:bg-dark-surface-hover dark:hover:text-dark-text-primary',
    danger:
      'bg-red-50 text-red-700 border border-red-200 ' +
      'hover:bg-red-100 hover:border-red-300 ' +
      'dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/30',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <svg
          className="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}

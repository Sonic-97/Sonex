'use client';
import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export function Input({ label, error, icon, className, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-text-secondary dark:text-dark-text-secondary"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={cn(
            'h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text-primary transition-all duration-150 ease-out',
            'placeholder:text-text-tertiary',
            'hover:border-copper-400',
            'focus:border-copper-700 focus:outline-none focus:ring-2 focus:ring-copper-200',
            'dark:border-dark-border dark:bg-dark-surface dark:text-dark-text-primary dark:placeholder:text-dark-text-tertiary',
            'dark:hover:border-copper-600 dark:focus:border-copper-500 dark:focus:ring-copper-800',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border',
            icon && 'pr-10',
            error && 'border-red-400 focus:border-red-500 focus:ring-red-200 dark:border-red-600',
            className
          )}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
      </div>
      {error && (
        <p id={`${inputId}-error`} className="text-xs text-red-500 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

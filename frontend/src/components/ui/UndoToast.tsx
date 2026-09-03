'use client';

/**
 * @file UndoToast.tsx
 * @description Floating non-blocking 5-second Undo Banner enforcing UX-DOC-001:
 * 1. Replaces disruptive confirmation popups during fast POS operations.
 * 2. Provides a 5-second window to restore deleted items with a single tap.
 * 3. Animated GPU-accelerated progress bar indicator.
 */

import React, { useEffect, useState } from 'react';
import { Button } from './Button';

export interface UndoToastProps {
  id: string;
  message: string;
  durationMs?: number;
  onUndo: (id: string) => void;
  onDismiss?: (id: string) => void;
}

export const UndoToast: React.FC<UndoToastProps> = ({
  id,
  message,
  durationMs = 5000,
  onUndo,
  onDismiss,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      if (onDismiss) onDismiss(id);
    }, durationMs);

    return () => clearTimeout(timer);
  }, [id, durationMs, onDismiss]);

  if (!isVisible) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-md bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-slate-700 flex items-center justify-between gap-4 animate-in slide-in-from-bottom duration-200 transform-gpu will-change-transform"
      role="alert"
    >
      <div className="flex-1 flex flex-col gap-1">
        <span className="text-sm font-semibold text-slate-100">{message}</span>
        {/* Animated Progress Bar */}
        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all ease-linear"
            style={{
              animation: `shrinkProgress ${durationMs}ms linear forwards`,
            }}
          />
        </div>
      </div>

      <Button
        variant="success"
        size="sm"
        soundType="success"
        onClick={() => {
          setIsVisible(false);
          onUndo(id);
        }}
        className="shrink-0 font-extrabold uppercase tracking-wide"
      >
        تراجع (Undo)
      </Button>

      <style jsx>{`
        @keyframes shrinkProgress {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  );
};

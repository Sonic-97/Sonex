'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store';
import { SystemNotification } from '@/types';
import { X } from 'lucide-react';

interface Toast extends SystemNotification {
  visible: boolean;
}

export function NotificationToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const unsub = useAppStore.subscribe((state, prev) => {
      if (state.notifications.length > prev.notifications.length) {
        const latest = state.notifications[0];
        if (latest && !toasts.find((t) => t.id === latest.id)) {
          const toast: Toast = { ...latest, visible: true };
          setToasts((prev) => [toast, ...prev].slice(0, 3));
          setTimeout(() => removeToast(latest.id), 5000);
        }
      }
    });
    return () => unsub();
  }, [toasts, removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-lg animate-in slide-in-from-right"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{toast.title}</p>
            <p className="text-xs text-gray-500 truncate">{toast.message}</p>
          </div>
          <button onClick={() => removeToast(toast.id)} className="flex-shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

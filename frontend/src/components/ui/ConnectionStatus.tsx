'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export function ConnectionStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = async () => {
      setIsOnline(true);
      setSyncing(true);
      try {
        const { syncPendingActions } = await import('@/lib/offline-sync');
        await syncPendingActions();
      } catch {}
      setSyncing(false);
    };

    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(async () => {
      try {
        const { getPendingCount } = await import('@/lib/offline-sync');
        const count = await getPendingCount();
        setPendingCount(count);
      } catch {}
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const { syncPendingActions } = await import('@/lib/offline-sync');
      await syncPendingActions();
      setPendingCount(0);
    } catch {}
    setSyncing(false);
  }, []);

  if (isOnline && pendingCount === 0) return null;

  return (
    <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium shadow-lg transition-all animate-in ${
      isOnline ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'
    }`}>
      {isOnline ? (
        <>
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'Syncing...' : `${pendingCount} pending actions`}</span>
          {!syncing && pendingCount > 0 && (
            <button onClick={handleSyncNow} className="ml-1 rounded-md bg-amber-100 px-2 py-0.5 text-amber-700 hover:bg-amber-200 transition-colors">
              Sync Now
            </button>
          )}
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          <span>You're offline — some features may be unavailable</span>
        </>
      )}
    </div>
  );
}

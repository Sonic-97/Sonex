import { create } from 'zustand';
import type { HealthStatus, SyncQueueItem } from '@/types';

interface AppState {
  health: HealthStatus | null;
  syncQueue: SyncQueueItem[];
  syncStatus: 'idle' | 'syncing' | 'error';
  online: boolean;

  setHealth: (health: HealthStatus | null) => void;
  setSyncQueue: (queue: SyncQueueItem[]) => void;
  setSyncStatus: (status: 'idle' | 'syncing' | 'error') => void;
  setOnline: (online: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  health: null,
  syncQueue: [],
  syncStatus: 'idle',
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,

  setHealth: (health) => set({ health }),
  setSyncQueue: (syncQueue) => set({ syncQueue }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setOnline: (online) => set({ online }),
}));

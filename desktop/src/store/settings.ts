import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings } from '@/types';

interface SettingsState {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  updateCafe: (partial: Partial<AppSettings['cafe']>) => void;
  updateSync: (partial: Partial<AppSettings['sync']>) => void;
  updateTheme: (partial: Partial<AppSettings['theme']>) => void;
  updatePrinter: (partial: Partial<AppSettings['printer']>) => void;
  setLanguage: (lang: string) => void;
  resetSettings: () => void;
}

const defaultSettings: AppSettings = {
  theme: {
    mode: 'system',
    accentColor: '#8C6239',
  },
  cafe: {
    cafeId: '',
    cafeName: '',
    branchId: '',
    branchName: '',
  },
  sync: {
    autoSync: true,
    syncIntervalSeconds: 30,
    lastSyncAt: null,
  },
  printer: {
    receiptPrinter: 'default',
    paperWidthMm: 80,
  },
  language: 'ar',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      updateSettings: (partial) =>
        set((state) => ({
          settings: { ...state.settings, ...partial },
        })),
      updateCafe: (partial) =>
        set((state) => ({
          settings: {
            ...state.settings,
            cafe: { ...state.settings.cafe, ...partial },
          },
        })),
      updateSync: (partial) =>
        set((state) => ({
          settings: {
            ...state.settings,
            sync: { ...state.settings.sync, ...partial },
          },
        })),
      updateTheme: (partial) =>
        set((state) => ({
          settings: {
            ...state.settings,
            theme: { ...state.settings.theme, ...partial },
          },
        })),
      updatePrinter: (partial) =>
        set((state) => ({
          settings: {
            ...state.settings,
            printer: { ...state.settings.printer, ...partial },
          },
        })),
      setLanguage: (language) =>
        set((state) => ({
          settings: { ...state.settings, language },
        })),
      resetSettings: () => set({ settings: defaultSettings }),
    }),
    {
      name: 'sonex-settings',
    }
  )
);

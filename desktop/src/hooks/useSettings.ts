'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useAppStore } from '@/store';
import { useSettingsStore } from '@/store/settings';
import { useThemeStore } from '@/store/theme';

export function useSettings() {
  const { settings, updateSettings, updateCafe, updateSync, updateTheme, updatePrinter, setLanguage, resetSettings } =
    useSettingsStore();
  const { setMode } = useThemeStore();

  useEffect(() => {
    if (settings.theme.mode) {
      setMode(settings.theme.mode as 'light' | 'dark' | 'system');
    }
  }, [settings.theme.mode, setMode]);

  const syncToBackend = async (key: string, value: string) => {
    try {
      await api.settings.set(key, value);
    } catch {
      // offline — setting is persisted locally via Zustand persist
    }
  };

  const changeThemeMode = (mode: string) => {
    updateTheme({ mode: mode as 'light' | 'dark' | 'system' });
    setMode(mode as 'light' | 'dark' | 'system');
    syncToBackend('theme_mode', mode);
  };

  return {
    settings,
    updateSettings,
    updateCafe,
    updateSync,
    updateTheme,
    updatePrinter,
    setLanguage,
    resetSettings,
    changeThemeMode,
    syncToBackend,
  };
}

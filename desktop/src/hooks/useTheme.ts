'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/store/theme';

export function useTheme() {
  const { mode, resolved, accentColor, setMode, setAccentColor } = useThemeStore();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent-color', accentColor);
  }, [accentColor]);

  return {
    mode,
    resolved,
    accentColor,
    isDark: resolved === 'dark',
    setMode,
    setAccentColor,
    toggle: () => setMode(resolved === 'dark' ? 'light' : 'dark'),
  };
}

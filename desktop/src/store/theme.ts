import { create } from 'zustand';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  accentColor: string;
  setMode: (mode: ThemeMode) => void;
  setAccentColor: (color: string) => void;
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return getSystemTheme();
  return mode;
}

function applyTheme(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export const useThemeStore = create<ThemeState>((set) => {
  const initial = resolveMode('system');
  applyTheme(initial);

  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const state = useThemeStore.getState();
      if (state.mode === 'system') {
        const resolved = getSystemTheme();
        applyTheme(resolved);
        set({ resolved });
      }
    });
  }

  return {
    mode: 'system',
    resolved: initial,
    accentColor: '#8C6239',
    setMode: (mode) => {
      const resolved = resolveMode(mode);
      applyTheme(resolved);
      set({ mode, resolved });
    },
    setAccentColor: (accentColor) => set({ accentColor }),
  };
});

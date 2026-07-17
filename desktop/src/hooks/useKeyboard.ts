'use client';

import { useEffect, useCallback } from 'react';

type KeyMap = Record<string, () => void>;

export function useKeyboard(keyMap: KeyMap, enabled = true) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const key = [
        e.metaKey ? 'Cmd' : '',
        e.ctrlKey ? 'Ctrl' : '',
        e.shiftKey ? 'Shift' : '',
        e.altKey ? 'Alt' : '',
        e.key.toUpperCase(),
      ]
        .filter(Boolean)
        .join('+');

      const action = keyMap[key];
      if (action) {
        e.preventDefault();
        e.stopPropagation();
        action();
      }
    },
    [keyMap, enabled]
  );

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}

'use client';

import { useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '@/store';

type SoundName = 'new_order' | 'order_ready';

const SOUND_FILES: Record<SoundName, string> = {
  new_order: '/sounds/new_order.wav',
  order_ready: '/sounds/order_ready.wav',
};

export function useAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayedRef = useRef<Record<string, number>>({});
  const audioAlert = useAppStore((s) => s.lastAudioAlert);

  const play = useCallback((sound: SoundName) => {
    const now = Date.now();
    const last = lastPlayedRef.current[sound] || 0;
    if (now - last < 2000) return;

    try {
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      audioRef.current.src = SOUND_FILES[sound];
      audioRef.current.volume = 0.7;
      audioRef.current.play().catch(() => {});
      lastPlayedRef.current[sound] = now;
    } catch {
    }
  }, []);

  useEffect(() => {
    if (!audioAlert) return;

    if (audioAlert.target === 'barista' && audioAlert.sound === 'new_order.mp3') {
      play('new_order');
    }
    if (audioAlert.target === 'driver' && audioAlert.sound === 'order_ready.mp3') {
      play('order_ready');
    }
  }, [audioAlert, play]);

  return { play };
}

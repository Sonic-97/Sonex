'use client';

/**
 * @file Button.tsx
 * @description Standardized Sonex UI Button enforcing UX-DOC-001 guidelines:
 * 1. Strict minimum 48px x 48px tap targets to eliminate fat-finger errors.
 * 2. Integrated Web Audio API sound feedback (auditory click synthesis).
 * 3. Haptic vibration triggers (`navigator.vibrate`) for mobile/tablet environments.
 * 4. GPU-accelerated 60fps animations (`transform`, `opacity` only).
 */

import React, { useCallback } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'kds';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  soundType?: 'click' | 'success' | 'error' | 'bump';
  enableHaptic?: boolean;
  children: React.ReactNode;
}

/**
 * Synthesizes short audio feedback using Web Audio API (Zero external assets).
 */
const playAudioFeedback = (type: 'click' | 'success' | 'error' | 'bump' = 'click') => {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'click') {
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === 'success') {
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.05); // E5
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.setValueAtTime(150, now + 0.06);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'bump') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.setValueAtTime(1200, now + 0.04);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    }
  } catch (e) {
    // Ignore audio context errors silently
  }
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  soundType = 'click',
  enableHaptic = true,
  className = '',
  onClick,
  disabled,
  children,
  ...props
}) => {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;

      // Haptic Feedback
      if (enableHaptic && typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(15);
        } catch (err) {
          // Ignore haptic errors
        }
      }

      // Audio Feedback
      playAudioFeedback(soundType);

      if (onClick) {
        onClick(e);
      }
    },
    [disabled, enableHaptic, soundType, onClick],
  );

  // Variant class mappings
  const variantClasses: Record<ButtonVariant, string> = {
    primary: 'bg-amber-700 hover:bg-amber-800 text-white font-bold shadow-md active:bg-amber-900 border-b-2 border-amber-900',
    secondary: 'bg-slate-700 hover:bg-slate-800 text-white font-medium active:bg-slate-900',
    danger: 'bg-red-600 hover:bg-red-700 text-white font-bold active:bg-red-800 border-b-2 border-red-900',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold active:bg-emerald-800 border-b-2 border-emerald-900',
    outline: 'border-2 border-slate-400 hover:border-slate-600 text-slate-800 bg-white active:bg-slate-100 font-semibold',
    ghost: 'hover:bg-slate-200 text-slate-700 active:bg-slate-300 font-medium',
  };

  // Size class mappings (Enforcing 48px minimum touch target)
  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'min-h-[48px] min-w-[48px] px-3 py-2 text-sm',
    md: 'min-h-[52px] min-w-[52px] px-4 py-3 text-base',
    lg: 'min-h-[60px] min-w-[60px] px-6 py-4 text-lg font-bold',
    kds: 'min-h-[64px] min-w-[80px] px-6 py-4 text-xl font-black uppercase tracking-wider',
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center rounded-xl transition-all duration-150 ease-out
        select-none touch-manipulation focus:outline-none focus:ring-4 focus:ring-amber-500/40
        active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100
        will-change-transform transform-gpu
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
};

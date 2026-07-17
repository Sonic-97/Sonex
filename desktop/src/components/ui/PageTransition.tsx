'use client';

import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'fade-in-up' | 'fade-in' | 'scale-in' | 'scale-in-spring';
  duration?: 'fast' | 'normal' | 'slow';
}

export function PageTransition({
  children,
  className,
  variant = 'fade-in-up',
  duration = 'normal',
}: PageTransitionProps) {
  const [mounted, setMounted] = useState(false);
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const durations = { fast: 'duration-100', normal: 'duration-200', slow: 'duration-300' };

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  const animClasses = {
    'fade-in-up': 'animate-fade-in-up',
    'fade-in': 'animate-fade-in',
    'scale-in': 'animate-scale-in',
    'scale-in-spring': 'animate-scale-in-spring',
  };

  return (
    <div
      ref={ref}
      className={cn(
        mounted ? animClasses[variant] : 'opacity-0',
        durations[duration],
        className
      )}
    >
      {children}
    </div>
  );
}

interface StaggerChildrenProps {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  baseDelay?: number;
}

export function StaggerChildren({ children, className, stagger = 50, baseDelay = 0 }: StaggerChildrenProps) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={className}>
      {Array.isArray(children)
        ? children.map((child, i) => (
            <div
              key={i}
              className="animate-fade-in-up"
              style={{
                animationDelay: `${baseDelay + i * stagger}ms`,
                animationFillMode: 'backwards',
              }}
            >
              {child}
            </div>
          ))
        : children}
    </div>
  );
}

interface AnimatePresenceProps {
  show: boolean;
  children: React.ReactNode;
  className?: string;
}

export function AnimatePresence({ show, children, className }: AnimatePresenceProps) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return show ? <div className={className}>{children}</div> : null;
  }

  if (!show) return null;

  return (
    <div className={cn('animate-scale-in', className)}>
      {children}
    </div>
  );
}

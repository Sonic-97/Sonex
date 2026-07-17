'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

interface UseInViewportOptions {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}

export function useInViewport<T extends HTMLElement = HTMLDivElement>(
  options: UseInViewportOptions = {}
): [RefObject<T | null>, boolean] {
  const { threshold = 0, rootMargin = '0px', once = false } = options;
  const ref = useRef<T | null>(null);
  const [inViewport, setInViewport] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInViewport(true);
          if (once) {
            observer.unobserve(el);
          }
        } else if (!once) {
          setInViewport(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return [ref, inViewport];
}

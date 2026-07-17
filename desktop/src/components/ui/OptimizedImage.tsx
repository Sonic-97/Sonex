'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  width?: number;
  height?: number;
  loading?: 'lazy' | 'eager';
}

export function OptimizedImage({
  src,
  alt,
  className,
  containerClassName,
  width,
  height,
  loading = 'lazy',
}: OptimizedImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => {
    setError(true);
    setLoaded(true);
  }, []);

  return (
    <div
      className={cn('relative overflow-hidden', containerClassName)}
      style={{ width, height }}
    >
      {!loaded && (
        <div className="absolute inset-0 skeleton" />
      )}
      {error ? (
        <div className="flex h-full w-full items-center justify-center bg-surface-secondary text-text-tertiary text-xs">
          {alt?.[0]?.toUpperCase() || '?'}
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
            className
          )}
        />
      )}
    </div>
  );
}

'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface VirtualListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  itemHeight: number;
  overscan?: number;
  className?: string;
  containerClassName?: string;
  emptyState?: React.ReactNode;
  loading?: boolean;
}

export function VirtualList<T>({
  items,
  renderItem,
  itemHeight,
  overscan = 5,
  className,
  containerClassName,
  emptyState,
  loading,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    observer.observe(container);
    setContainerHeight(container.clientHeight);

    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  const { visibleStart, visibleEnd, totalHeight, offsetY } = useMemo(() => {
    const totalHeight = items.length * itemHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(items.length, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan);
    const offsetY = startIndex * itemHeight;

    return { visibleStart: startIndex, visibleEnd: endIndex, totalHeight, offsetY };
  }, [items.length, itemHeight, scrollTop, containerHeight, overscan]);

  const visibleItems = useMemo(
    () => items.slice(visibleStart, visibleEnd),
    [items, visibleStart, visibleEnd]
  );

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-20', className)}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper-600 border-t-transparent" />
      </div>
    );
  }

  if (items.length === 0 && emptyState) {
    return <div className={className}>{emptyState}</div>;
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn('overflow-auto will-change-scroll-position', containerClassName)}
      style={{ contain: 'strict' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{ transform: `translateY(${offsetY}px)`, willChange: 'transform' }}
        >
          {visibleItems.map((item, i) => (
            <div
              key={visibleStart + i}
              style={{ height: itemHeight }}
              className="will-change-contents"
            >
              {renderItem(item, visibleStart + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface VirtualTableProps<T> {
  items: T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  header: React.ReactNode;
  className?: string;
  emptyState?: React.ReactNode;
  loading?: boolean;
}

export function VirtualTable<T>({
  items,
  rowHeight,
  renderRow,
  header,
  className,
  emptyState,
  loading,
}: VirtualTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    observer.observe(container);
    setContainerHeight(container.clientHeight);

    return () => observer.disconnect();
  }, []);

  // Recalculate on items change
  useEffect(() => {
    if (containerRef.current) {
      setContainerHeight(containerRef.current.clientHeight);
    }
  }, [items.length]);

  const handleScroll = useCallback(() => {
    setScrollTop(containerRef.current?.scrollTop ?? 0);
  }, []);

  const headerHeight = 44;

  const { visibleStart, visibleEnd, totalHeight, offsetY } = useMemo(() => {
    const totalHeight = items.length * rowHeight;
    const startIndex = Math.max(0, Math.floor((scrollTop - headerHeight) / rowHeight) - 5);
    const endIndex = Math.min(items.length, Math.ceil((scrollTop - headerHeight + containerHeight) / rowHeight) + 5);
    const offsetY = startIndex * rowHeight;

    return { visibleStart: startIndex, visibleEnd: endIndex, totalHeight, offsetY };
  }, [items.length, rowHeight, scrollTop, containerHeight, headerHeight]);

  const visibleItems = useMemo(
    () => items.slice(visibleStart, visibleEnd),
    [items, visibleStart, visibleEnd]
  );

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-20', className)}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper-600 border-t-transparent" />
      </div>
    );
  }

  if (items.length === 0 && emptyState) {
    return <div className={className}>{emptyState}</div>;
  }

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border', className)}>
      <div ref={headerRef} className="sticky top-0 z-10">
        {header}
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-auto"
        style={{ height: '100%', contain: 'strict' }}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div
            style={{ transform: `translateY(${offsetY + headerHeight}px)`, willChange: 'transform' }}
          >
            {visibleItems.map((item, i) => (
              <div
                key={visibleStart + i}
                style={{ height: rowHeight }}
                className="will-change-contents"
              >
                {renderRow(item, visibleStart + i)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

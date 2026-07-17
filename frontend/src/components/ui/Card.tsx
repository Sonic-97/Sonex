'use client';

export function Card({
  title,
  value,
  subtitle,
  icon,
  trend,
  highlight,
  children,
  className = '',
}: {
  title: string;
  value?: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: number; positive: boolean };
  highlight?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-[#E2E0DA] bg-white p-5 shadow-[0_8px_24px_rgba(33,24,22,0.07)] transition-all duration-300 ${
        highlight ? 'animate-pulse-scale ring-2 ring-[#D4A373]' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          {value !== undefined && (
            <p className="text-2xl font-bold tracking-tight">{value}</p>
          )}
          {subtitle && (
            <p className="text-xs text-gray-400">{subtitle}</p>
          )}
          {trend && (
            <p
              className={`text-xs font-medium ${
                trend.positive ? 'text-emerald-600' : 'text-red-500'
              }`}
            >
              {trend.positive ? '↑' : '↓'} {Math.abs(trend.value).toFixed(1)}%
            </p>
          )}
        </div>
        {icon && (
          <div className="rounded-md bg-[#F4E9DD] p-2 text-[#8C6239]">{icon}</div>
        )}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

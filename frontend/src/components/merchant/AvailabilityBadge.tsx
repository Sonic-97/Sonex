'use client';

interface AvailabilityBadgeProps {
  status: string;
  queueLength?: number;
  currentETA?: number;
}

const BADGE_STYLES: Record<string, string> = {
  OPEN: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  BUSY: 'bg-amber-100 text-amber-800 border-amber-300',
  VERY_BUSY: 'bg-red-100 text-red-800 border-red-300',
  PAUSED: 'bg-orange-100 text-orange-800 border-orange-300',
  CLOSED: 'bg-gray-100 text-gray-800 border-gray-300',
  OFFLINE: 'bg-red-100 text-red-800 border-red-300',
};

const BADGE_LABELS: Record<string, string> = {
  OPEN: 'مفتوح',
  BUSY: 'مشغول',
  VERY_BUSY: 'مشغول جداً',
  PAUSED: 'متوقف مؤقتاً',
  CLOSED: 'مغلق',
  OFFLINE: 'غير متصل',
};

export default function AvailabilityBadge({ status, queueLength, currentETA }: AvailabilityBadgeProps) {
  const style = BADGE_STYLES[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  const label = BADGE_LABELS[status] || status;

  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border font-bold text-sm ${style}`}>
      <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
      <span>{label}</span>
      {queueLength !== undefined && (
        <span className="text-xs opacity-75">({queueLength} في الانتظار)</span>
      )}
      {currentETA !== undefined && (
        <span className="text-xs opacity-75">~{currentETA} د</span>
      )}
    </div>
  );
}

'use client';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  ACCEPTED: 'bg-blue-100 text-blue-800 border-blue-200',
  PICKED_UP: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  DELIVERED: 'bg-green-100 text-green-800 border-green-200',
  EXPIRED: 'bg-red-100 text-red-800 border-red-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
  CANCELLED: 'bg-gray-100 text-gray-800 border-gray-200',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'معلق',
  ACCEPTED: 'مقبول',
  PICKED_UP: 'تم الاستلام',
  DELIVERED: 'تم التوصيل',
  EXPIRED: 'منتهي',
  REJECTED: 'مرفوض',
  CANCELLED: 'ملغي',
};

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  const label = STATUS_LABELS[status] || status;
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <span className={`inline-block px-3 py-1 rounded-full border font-bold ${style} ${textSize}`}>
      {label}
    </span>
  );
}

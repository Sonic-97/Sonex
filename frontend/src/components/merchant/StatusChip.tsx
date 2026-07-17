'use client';

interface StatusChipProps {
  status: string;
  size?: 'sm' | 'md';
}

const STATUS_STYLES: Record<string, string> = {
  CREATED: 'bg-amber-100 text-amber-800 border-amber-200',
  ACCEPTED: 'bg-blue-100 text-blue-800 border-blue-200',
  PREPARING: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  READY: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  PICKED_UP: 'bg-teal-100 text-teal-800 border-teal-200',
  COMPLETED: 'bg-green-100 text-green-800 border-green-200',
  CANCELLED: 'bg-red-100 text-red-800 border-red-200',
  DELAYED: 'bg-orange-100 text-orange-800 border-orange-200',
};

const STATUS_LABELS: Record<string, string> = {
  CREATED: 'جديد',
  ACCEPTED: 'مقبول',
  PREPARING: 'قيد التحضير',
  READY: 'جاهز',
  PICKED_UP: 'تم الاستلام',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
  DELAYED: 'متأخر',
};

export default function StatusChip({ status, size = 'md' }: StatusChipProps) {
  const style = STATUS_STYLES[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  const label = STATUS_LABELS[status] || status;
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <span className={`inline-block px-3 py-1 rounded-full border font-bold ${style} ${textSize}`}>
      {label}
    </span>
  );
}

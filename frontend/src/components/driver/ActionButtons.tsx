'use client';

interface ActionButtonsProps {
  status: string;
  assignmentId: string;
  onAction: (action: string) => void;
  loading?: boolean;
}

const ACTIONS_BY_STATUS: Record<string, Array<{ action: string; label: string; variant: 'primary' | 'danger' | 'success' | 'outline' }>> = {
  PENDING: [
    { action: 'accept', label: 'قبول', variant: 'primary' },
    { action: 'reject', label: 'رفض', variant: 'danger' },
  ],
  ACCEPTED: [
    { action: 'picked-up', label: 'تم الاستلام', variant: 'primary' },
  ],
  PICKED_UP: [
    { action: 'delivered', label: 'تم التوصيل', variant: 'success' },
  ],
  DELIVERED: [],
  EXPIRED: [],
  REJECTED: [],
  CANCELLED: [],
};

const VARIANT_STYLES: Record<string, string> = {
  primary: 'bg-[#8c6239] text-white hover:bg-[#6f4d2d]',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  outline: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
};

export default function ActionButtons({ status, assignmentId, onAction, loading }: ActionButtonsProps) {
  const actions = ACTIONS_BY_STATUS[status] || [];

  if (actions.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap">
      {actions.map(({ action, label, variant }) => (
        <button
          key={action}
          onClick={() => onAction(action)}
          disabled={loading}
          className={`flex-1 min-w-[120px] rounded-xl px-5 py-3 text-sm font-bold transition-all active:scale-95 disabled:opacity-50 ${VARIANT_STYLES[variant]}`}
        >
          {loading ? '...' : label}
        </button>
      ))}
    </div>
  );
}

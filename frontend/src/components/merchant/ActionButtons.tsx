'use client';

interface ActionButtonsProps {
  status: string;
  orderId: string;
  onAction: (action: string) => void;
  loading?: boolean;
}

const ACTIONS_BY_STATUS: Record<string, Array<{ action: string; label: string; variant: 'primary' | 'danger' | 'warning' | 'outline' }>> = {
  CREATED: [
    { action: 'accept', label: 'قبول', variant: 'primary' },
    { action: 'reject', label: 'رفض', variant: 'danger' },
  ],
  ACCEPTED: [
    { action: 'preparing', label: 'بدء التحضير', variant: 'primary' },
  ],
  PREPARING: [
    { action: 'ready', label: 'جاهز للاستلام', variant: 'primary' },
    { action: 'delay', label: 'تأخير', variant: 'warning' },
  ],
  READY: [],
  PICKED_UP: [],
  COMPLETED: [],
  CANCELLED: [],
};

const VARIANT_STYLES: Record<string, string> = {
  primary: 'bg-[#8c6239] text-white hover:bg-[#6f4d2d]',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  warning: 'bg-orange-500 text-white hover:bg-orange-600',
  outline: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
};

export default function ActionButtons({ status, orderId, onAction, loading }: ActionButtonsProps) {
  const actions = ACTIONS_BY_STATUS[status] || [];

  if (actions.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap">
      {actions.map(({ action, label, variant }) => (
        <button
          key={action}
          onClick={() => onAction(action)}
          disabled={loading}
          className={`rounded-xl px-5 py-2.5 text-sm font-bold transition-all active:scale-95 disabled:opacity-50 ${VARIANT_STYLES[variant]}`}
        >
          {loading ? '...' : label}
        </button>
      ))}
    </div>
  );
}

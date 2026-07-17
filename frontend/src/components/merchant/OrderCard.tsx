'use client';

import StatusChip from './StatusChip';

interface OrderCardProps {
  orderId: string;
  merchantOrderId: string;
  status: string;
  businessName?: string;
  messageCount?: number;
  onClick: (id: string) => void;
}

export default function OrderCard({ orderId, merchantOrderId, status, businessName, messageCount, onClick }: OrderCardProps) {
  const lastAccess = typeof window !== 'undefined'
    ? localStorage.getItem(`merchant_order_${merchantOrderId}_time`)
    : null;
  const timeAgo = lastAccess ? formatTimeAgo(new Date(lastAccess)) : '';

  return (
    <button
      onClick={() => onClick(merchantOrderId)}
      className="w-full text-right bg-white rounded-2xl p-4 border border-[#E8E1D9] shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-sm text-gray-500">{businessName || 'طلب'}</span>
        <StatusChip status={status} size="sm" />
      </div>
      <div className="text-xs text-gray-400 font-mono">{merchantOrderId.slice(0, 12)}...</div>
      {messageCount !== undefined && (
        <div className="text-xs text-gray-400 mt-1">{messageCount} رسالة</div>
      )}
      {timeAgo && <div className="text-xs text-gray-300 mt-1">{timeAgo}</div>}
    </button>
  );
}

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return `منذ ${Math.floor(hours / 24)} ي`;
}

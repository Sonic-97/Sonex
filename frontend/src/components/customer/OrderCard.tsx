'use client';

import { Package } from 'lucide-react';

interface OrderCardProps {
  orderId: string;
  status: string;
  grandTotal: string;
  createdAt: string;
  merchantName?: string;
  onClick: (id: string) => void;
}

const STATUS_STYLES: Record<string, string> = {
  CREATED: 'bg-amber-100 text-amber-800 border-amber-200',
  ACCEPTED: 'bg-blue-100 text-blue-800 border-blue-200',
  PREPARING: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  READY: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  PICKED_UP: 'bg-teal-100 text-teal-800 border-teal-200',
  COMPLETED: 'bg-green-100 text-green-800 border-green-200',
  CANCELLED: 'bg-red-100 text-red-800 border-red-200',
};

const STATUS_LABELS: Record<string, string> = {
  CREATED: 'جديد',
  ACCEPTED: 'مقبول',
  PREPARING: 'قيد التحضير',
  READY: 'جاهز',
  PICKED_UP: 'قيد التوصيل',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
};

export default function OrderCard({ orderId, status, grandTotal, createdAt, merchantName, onClick }: OrderCardProps) {
  const style = STATUS_STYLES[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  const label = STATUS_LABELS[status] || status;
  const date = new Date(createdAt).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });

  return (
    <button
      onClick={() => onClick(orderId)}
      className="w-full text-right bg-white rounded-2xl p-4 border border-[#E8E1D9] shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-[#8c6239]" />
          <span className="text-sm font-bold text-gray-800">{merchantName || 'طلب'}</span>
        </div>
        <span className={`inline-block px-2.5 py-0.5 rounded-full border text-xs font-bold ${style}`}>{label}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{date}</span>
        <span className="font-bold text-gray-600">{grandTotal}</span>
      </div>
      <div className="text-xs text-gray-300 font-mono mt-1">{orderId.slice(0, 12)}...</div>
    </button>
  );
}

'use client';

import StatusBadge from './StatusBadge';

interface AssignmentCardProps {
  assignmentId: string;
  merchantName: string;
  status: string;
  pickupSequence: number;
  estimatedReadyAt?: string;
  onClick: (id: string) => void;
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

export default function AssignmentCard({ assignmentId, merchantName, status, pickupSequence, estimatedReadyAt, onClick }: AssignmentCardProps) {
  return (
    <button
      onClick={() => onClick(assignmentId)}
      className="w-full text-right bg-white rounded-2xl p-4 border border-[#E8E1D9] shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-sm text-gray-800">{merchantName}</span>
        <StatusBadge status={status} size="sm" />
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span>ترتيب التوصيل: {pickupSequence}</span>
        {estimatedReadyAt && <span>متوقع: {formatTime(estimatedReadyAt)}</span>}
      </div>
      <div className="text-xs text-gray-300 font-mono mt-1">{assignmentId.slice(0, 12)}...</div>
    </button>
  );
}

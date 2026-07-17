'use client';

import { Decision } from '@/types';

const severityColors = {
  HIGH: 'border-l-red-500 bg-red-50',
  MEDIUM: 'border-l-amber-500 bg-amber-50',
  LOW: 'border-l-blue-500 bg-blue-50',
};

const severityBadge = {
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-blue-100 text-blue-700',
};

const typeIcons: Record<string, string> = {
  REVENUE: '$',
  STAFF: '👤',
  PRODUCT: '📦',
  CUSTOMER: '🤝',
  OPERATION: '⚙',
};

export function DecisionCard({ decision }: { decision: Decision }) {
  return (
    <div className={`rounded-lg border-l-4 p-3 ${severityColors[decision.severity]}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-sm">{typeIcons[decision.type]}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${severityBadge[decision.severity]}`}>
          {decision.severity === 'HIGH' ? 'عالي' : decision.severity === 'MEDIUM' ? 'متوسط' : 'منخفض'}
        </span>
        <span className="text-[10px] font-medium text-gray-400">
          {decision.type === 'REVENUE' ? 'إيرادات' : decision.type === 'STAFF' ? 'موظفين' : decision.type === 'PRODUCT' ? 'منتج' : decision.type === 'CUSTOMER' ? 'عميل' : 'عمليات'}
        </span>
        <span className="ml-auto text-[10px] font-bold tabular-nums text-gray-500">
          {Math.round(decision.confidence * 100)}%
        </span>
      </div>
      <h4 className="text-sm font-semibold text-gray-800">{decision.title}</h4>
      <p className="mt-0.5 text-xs text-gray-600">{decision.explanation}</p>
      <div className="mt-2 rounded bg-white/60 p-2">
        <p className="text-[11px] font-medium text-gray-700">
          <span className="font-semibold">إجراء:</span> {decision.suggestedAction}
        </p>
        <p className="mt-0.5 text-[11px] text-emerald-700">
          <span className="font-semibold">التأثير:</span> {decision.expectedImpact}
        </p>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {decision.dataSource.map((src) => (
          <span key={src} className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-500">
            {src.split('.').pop()}
          </span>
        ))}
      </div>
    </div>
  );
}

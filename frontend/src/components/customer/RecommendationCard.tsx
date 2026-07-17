'use client';

import { Star } from 'lucide-react';

interface RecommendationCardProps {
  name: string;
  reason: string;
  priority: number;
  onClick?: () => void;
}

export default function RecommendationCard({ name, reason, priority, onClick }: RecommendationCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-right bg-white rounded-2xl p-4 border border-[#E8E1D9] shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${priority === 1 ? 'text-amber-400' : 'text-gray-300'}`}>
          <Star size={18} fill={priority === 1 ? 'currentColor' : 'none'} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold text-gray-800">{name}</div>
          <div className="text-xs text-gray-400 mt-1">{reason}</div>
        </div>
      </div>
    </button>
  );
}

'use client';

import { HelpCircle } from 'lucide-react';

interface ClarificationCardProps {
  title: string;
  question: string;
  options?: string[];
  onSelect?: (option: string) => void;
}

export default function ClarificationCard({ title, question, options, onSelect }: ClarificationCardProps) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <HelpCircle size={16} className="text-amber-600" />
        <span className="text-xs font-bold text-amber-700">{title}</span>
      </div>
      <p className="text-sm text-amber-900 mb-3">{question}</p>
      {options && options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => onSelect?.(opt)}
              className="bg-white border border-amber-300 rounded-xl px-4 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100 transition-all active:scale-95"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

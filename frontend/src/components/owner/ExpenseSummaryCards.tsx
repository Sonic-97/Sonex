'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { TrendingUp, DollarSign, Calendar } from 'lucide-react';

export function ExpenseSummaryCards() {
  const [summary, setSummary] = useState({ daily: 0, weekly: 0, monthly: 0 });

  useEffect(() => {
    Promise.all([
      api.get('/expenses/daily').then(r => r.data).catch(() => ({ totalExpenses: 0 })),
      api.get('/expenses/weekly').then(r => r.data).catch(() => ({ totalExpenses: 0 })),
      api.get('/expenses/monthly').then(r => r.data).catch(() => ({ totalExpenses: 0 })),
    ]).then(([daily, weekly, monthly]) => {
      setSummary({
        daily: Number(daily.totalExpenses),
        weekly: Number(weekly.totalExpenses),
        monthly: Number(monthly.totalExpenses),
      });
    });
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border bg-white p-4 flex items-center gap-3">
        <div className="rounded-lg bg-blue-50 p-2.5"><Calendar className="h-5 w-5 text-blue-600" /></div>
        <div>
          <p className="text-xs text-gray-500">مصروفات اليوم</p>
          <p className="text-lg font-bold text-gray-800">{formatCurrency(summary.daily)}</p>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-4 flex items-center gap-3">
        <div className="rounded-lg bg-indigo-50 p-2.5"><TrendingUp className="h-5 w-5 text-indigo-600" /></div>
        <div>
          <p className="text-xs text-gray-500">مصروفات الأسبوع</p>
          <p className="text-lg font-bold text-gray-800">{formatCurrency(summary.weekly)}</p>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-4 flex items-center gap-3">
        <div className="rounded-lg bg-emerald-50 p-2.5"><DollarSign className="h-5 w-5 text-emerald-600" /></div>
        <div>
          <p className="text-xs text-gray-500">مصروفات الشهر</p>
          <p className="text-lg font-bold text-gray-800">{formatCurrency(summary.monthly)}</p>
        </div>
      </div>
    </div>
  );
}

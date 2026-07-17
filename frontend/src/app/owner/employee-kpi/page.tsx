'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { fetchEmployeeKpi } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { TrendingUp, ArrowUpDown, Search } from 'lucide-react';

interface EmployeeKpiEntry {
  employeeId: string;
  employeeName: string;
  totalOrders: number;
  paidOrders: number;
  revenue: number;
  kpiScore: number;
}

type SortKey = 'kpiScore' | 'totalOrders' | 'paidOrders' | 'revenue' | 'employeeName';

export default function EmployeeKpiPage() {
  const { user } = useAuth();
  const [kpiData, setKpiData] = useState<EmployeeKpiEntry[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('kpiScore');
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEmployeeKpi(dateFrom || undefined, dateTo || undefined);
      setKpiData(data);
    } catch {
      setKpiData([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'employeeName');
    }
  };

  const sorted = [...kpiData]
    .filter(e => e.employeeName.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      if (sortKey === 'employeeName') return dir * a.employeeName.localeCompare(b.employeeName);
      return dir * ((a[sortKey] as number) - (b[sortKey] as number));
    });

  const columns: { key: SortKey; label: string }[] = [
    { key: 'employeeName', label: 'الموظف' },
    { key: 'totalOrders', label: 'إجمالي الطلبات' },
    { key: 'paidOrders', label: 'المدفوعة' },
    { key: 'revenue', label: 'الإيرادات' },
    { key: 'kpiScore', label: 'نقطة الأداء' },
  ];

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6 flex items-center gap-3">
        <TrendingUp className="h-6 w-6 text-violet-600" />
        <h1 className="text-2xl font-bold text-gray-800">تقرير أداء الموظفين</h1>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="بحث بالاسم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border py-2 pr-9 text-sm"
          />
        </div>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <button
          onClick={loadData}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          تحديث
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400">جاري التحميل...</div>
      ) : sorted.length === 0 ? (
        <div className="py-12 text-center text-gray-400">لا توجد بيانات للموظفين</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                {columns.map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => toggleSort(key)}
                    className="cursor-pointer px-4 py-3 text-right text-xs font-bold text-gray-500 hover:text-gray-700"
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, i) => (
                <tr key={entry.employeeId} className={`border-b last:border-0 hover:bg-gray-50 ${i < 3 ? 'bg-amber-50/50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <span className="inline-flex items-center gap-2">
                      {i < 3 && (
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                          i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-gray-400' : 'bg-amber-700'
                        }`}>
                          {i + 1}
                        </span>
                      )}
                      {entry.employeeName}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{entry.totalOrders}</td>
                  <td className="px-4 py-3 text-gray-600">{entry.paidOrders}</td>
                  <td className="px-4 py-3 font-mono font-medium text-emerald-600">{formatCurrency(entry.revenue)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-gray-200">
                        <div
                          className={`h-2 rounded-full ${
                            entry.kpiScore >= 80 ? 'bg-emerald-500' : entry.kpiScore >= 50 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(entry.kpiScore, 100)}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs font-bold text-gray-700">{entry.kpiScore}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

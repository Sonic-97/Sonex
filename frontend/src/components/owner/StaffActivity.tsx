'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/store';
import { Users, Clock, Coffee, TrendingUp } from 'lucide-react';

export function StaffActivity() {
  const staff = useAppStore((s) => s.staff);
  const staffPerformances = useAppStore((s) => s.staffPerformances);
  const topPerformers = useAppStore((s) => s.topPerformers);
  const orders = useAppStore((s) => s.orders);
  const orderIds = useAppStore((s) => s.orderIds);

  const activeStaff = staff.filter((s) => s.role !== 'OWNER' && s.active !== false).length;
  const totalNonOwner = staff.filter((s) => s.role !== 'OWNER').length;

  const summary = useMemo(() => {
    const baristas = staff.filter((s) => s.role === 'BARISTA');
    const drivers = staff.filter((s) => s.role === 'DRIVER');
    const allOrders = orderIds.map((id) => orders[id]).filter(Boolean);

    const totalOrders = allOrders.length;
    const processedOrders = allOrders.filter(
      (o) => ['DELIVERED', 'PAID', 'CLOSED', 'CONFIRMED'].includes(o.status)
    ).length;

    // Calculate average processing time from staff performances
    const perfScores = staffPerformances.length;
    const avgScore =
      perfScores > 0
        ? staffPerformances.reduce((s, p) => s + (p.overallScore || 0), 0) / perfScores
        : 0;

    return {
      baristaCount: baristas.length,
      driverCount: drivers.length,
      totalOrders,
      processedOrders,
      avgScore,
      perfScores,
    };
  }, [staff, staffPerformances, orders, orderIds]);

  const topStaff = useMemo(() => {
    if (topPerformers.length === 0) return [];
    return topPerformers.slice(0, 3).map((p: any) => ({
      name: p.name || p.staffName || 'موظف',
      score: p.overallScore || p.score || 0,
      orders: p.ordersHandled || p.totalOrders || 0,
    }));
  }, [topPerformers]);

  const statCards = [
    {
      label: 'فريق العمل',
      value: `${activeStaff}`,
      sub: `${totalNonOwner} إجمالي`,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'طلبات اليوم',
      value: summary.processedOrders.toString(),
      sub: `${summary.totalOrders} إجمالي`,
      icon: Coffee,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: 'معدل الأداء',
      value: summary.avgScore > 0 ? `${summary.avgScore.toFixed(1)}%` : '--',
      sub: `${summary.perfScores} موظف مقيم`,
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
  ];

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-gray-800">نشاط الموظفين</h3>
        </div>
        <span className="text-[10px] text-gray-400">
          {activeStaff} نشط حالياً
        </span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-gray-100" dir="ltr">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="px-3 py-4 text-center" dir="rtl">
              <div className={`mx-auto mb-2 h-8 w-8 rounded-lg ${s.bg} flex items-center justify-center`}>
                <Icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className="text-lg font-black text-gray-900 font-mono">{s.value}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
              {s.sub && <p className="text-[9px] text-gray-400">{s.sub}</p>}
            </div>
          );
        })}
      </div>

      {/* Top performers mini-list */}
      {topStaff.length > 0 && (
        <div className="border-t border-gray-100 px-5 py-3">
          <p className="text-[10px] font-bold text-gray-500 mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" />
            أفضل الأداء اليوم
          </p>
          <div className="space-y-2">
            {topStaff.map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${
                      i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-gray-400' : 'bg-amber-700'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="truncate font-medium text-gray-700">{p.name}</span>
                </div>
                <div className="flex items-center gap-3 text-left shrink-0">
                  <span className="text-gray-500">{p.orders} طلبات</span>
                  <span className="font-black text-gray-800">{p.score.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time indicator */}
      <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center gap-1.5 text-[10px] text-gray-400">
        <Clock className="h-3 w-3" />
        <span>آخر تحديث: {new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}

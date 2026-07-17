'use client';

import { useAppStore } from '@/store';
import { useMemo, useRef, useEffect } from 'react';
import { Clock, Bell, ArrowUpDown } from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  NEW: { label: 'جديد', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  CONFIRMED: { label: 'مؤكد', color: 'text-teal-600', bg: 'bg-teal-50 border-teal-200' },
  PREPARING: { label: 'قيد التحضير', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  READY: { label: 'جاهز', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  PICKED_UP: { label: 'تم الاستلام', color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-200' },
  DELIVERED: { label: 'تم التوصيل', color: 'text-gray-600', bg: 'bg-gray-100 border-gray-200' },
  PAID: { label: 'مدفوع', color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
  CLOSED: { label: 'مغلق', color: 'text-gray-500', bg: 'bg-gray-100 border-gray-300' },
  CANCELLED: { label: 'ملغي', color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
};

export function LiveOrdersFeed() {
  const orders = useAppStore((s) => s.orders);
  const orderIds = useAppStore((s) => s.orderIds);
  const feedEndRef = useRef<HTMLDivElement>(null);

  const feed = useMemo(
    () => orderIds.map((id) => orders[id]).filter(Boolean).slice(0, 25),
    [orderIds, orders],
  );

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed.length]);

  if (feed.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center">
        <Bell className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <p className="text-sm font-medium text-gray-500">لا توجد طلبات حية حالياً</p>
        <p className="mt-1 text-xs text-gray-400">ستظهر الطلبات الجديدة هنا فور وصولها</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="sticky top-0 z-10 border-b bg-gradient-to-l from-gray-50 to-white px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
          </span>
          <h3 className="text-sm font-bold text-gray-800">الطلبات الحية</h3>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 border border-blue-100">
            {feed.length}
          </span>
        </div>
        <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
      </div>

      <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
        {feed.map((order, idx) => {
          const st = STATUS_MAP[order.status] || STATUS_MAP.NEW;
          const items = order.items?.slice(0, 3) || [];
          const extra = (order.items?.length || 0) - 3;

          return (
            <div
              key={order.id}
              className={`px-5 py-3.5 transition-colors hover:bg-gray-50/80 ${
                idx === 0 ? 'animate-slideDown' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-gray-700">
                      #{order.code}
                    </span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${st.bg} ${st.color}`}>
                      {st.label}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {(order.type || (order as any).orderType) === 'DINE_IN' ? 'داخلي' : (order.type || (order as any).orderType) === 'TAKEAWAY' ? 'سفري' : 'توصيل'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {(order as any).customerName || order.customer?.name || 'زبون'}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                    {items.map((i: any) => (
                      <span key={i.id || i.productId}>
                        {i.product?.name || i.name} ×{i.quantity}
                      </span>
                    ))}
                    {extra > 0 && <span className="text-gray-400">+{extra}</span>}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <p className="text-sm font-black text-gray-800 font-mono">
                    {Number(order.total).toFixed(2)} <span className="text-[10px] font-normal text-gray-400">EGP</span>
                  </p>
                  <p className="mt-0.5 text-[10px] text-gray-400">
                    {new Date(order.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              {(order.remainingAmount || (order as any).remainingBalance) > 0 && (
                <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1">
                  <span className="text-[10px] font-bold text-amber-700">متبقي:</span>
                  <span className="text-[10px] font-black text-amber-700 font-mono">
                    {Number(order.remainingAmount || (order as any).remainingBalance || 0).toFixed(2)} EGP
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div ref={feedEndRef} />
    </div>
  );
}

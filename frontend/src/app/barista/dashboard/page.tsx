'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Clock, Coffee, Play, CheckCircle2, Truck, XCircle, Phone, User, ShoppingBag, CreditCard, Smartphone } from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { useAppStore } from '@/store';
import { fetchWhatsAppOrders, updateOrderStatus, cancelOrder } from '@/lib/api';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

interface DashboardOrder {
  id: string;
  code: string;
  customerName: string;
  customerPhone: string;
  status: string;
  createdAt: string;
  items: { id: string; name: string; quantity: number; notes?: string }[];
  paymentStatus: string;
  total: number;
  specialNotes?: string;
}

const STATUS_CONFIG: Record<string, { bg: string; border: string; text: string; dot: string; label: string }> = {
  NEW: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-400', label: 'جديد' },
  PREPARING: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500', label: 'قيد التحضير' },
  READY: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'جاهز' },
  DELIVERED: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500', label: 'تم التسليم' },
  CANCELLED: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500', label: 'ملغي' },
};

const PAYMENT_LABELS: Record<string, string> = {
  UNPAID: 'غير مدفوع',
  PAID: 'مدفوع',
  PARTIAL_PAYMENT: 'مدفوع جزئياً',
};

const PAYMENT_COLORS: Record<string, string> = {
  UNPAID: 'text-rose-600 bg-rose-50',
  PAID: 'text-emerald-600 bg-emerald-50',
  PARTIAL_PAYMENT: 'text-amber-600 bg-amber-50',
};

function formatTime(iso: string) {
  try {
    return format(new Date(iso), 'hh:mm a', { locale: ar });
  } catch { return iso; }
}

export default function BaristaDashboard() {
  useSocket('/barista');

  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  // Fetch orders on mount
  useEffect(() => {
    fetchWhatsAppOrders()
      .then((data) => {
        const mapped = (Array.isArray(data) ? data : []).map(mapOrder);
        setOrders(mapped);
        if (mapped.length > 0) setSelectedOrderId(mapped[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Subscribe to store order events
  useEffect(() => {
    const unsub = useAppStore.subscribe((state) => {
      const storeOrders = state.orders;
      if (!storeOrders || Object.keys(storeOrders).length === 0) return;
      setOrders((prev) => {
        const map = new Map(prev.map((o) => [o.id, o]));
        for (const order of Object.values(storeOrders) as any[]) {
          if (order.sourceType === 'WHATSAPP_ORDER' || order.sourceType === 'TELEGRAM_ORDER' || order.source === 'TELEGRAM' || order.type === 'WHATSAPP') {
            map.set(order.id, {
              id: order.id,
              code: order.code || order.id.slice(0, 8),
              customerName: order.customer?.name || 'عميل',
              customerPhone: order.customer?.phone || '',
              status: order.status || 'NEW',
              createdAt: order.createdAt || new Date().toISOString(),
              items: (order.items || []).map((i: any) => ({
                id: i.id || i.productId,
                name: i.product?.name || i.productName || 'منتج',
                quantity: i.quantity || 1,
                notes: i.notes || undefined,
              })),
              paymentStatus: order.paymentStatus || 'UNPAID',
              total: order.total || 0,
              specialNotes: order.items?.[0]?.notes || undefined,
            });
          }
        }
        return [...map.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      });
    });
    return () => unsub();
  }, []);

  const visibleOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        o.status !== 'DELIVERED' &&
        o.status !== 'CANCELLED' &&
        (o.code.includes(searchQuery) || o.customerName.includes(searchQuery))
    );
  }, [orders, searchQuery]);

  const selectedOrder = useMemo(() => orders.find((o) => o.id === selectedOrderId), [orders, selectedOrderId]);

  const handleUpdateStatus = useCallback(async (newStatus: string) => {
    if (!selectedOrder) return;
    try {
      await updateOrderStatus(selectedOrder.id, newStatus);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: newStatus } : o)));
      if (newStatus === 'DELIVERED' || newStatus === 'CANCELLED') {
        const nextOrder = visibleOrders.find((o) => o.id !== selectedOrder.id);
        if (nextOrder) setSelectedOrderId(nextOrder.id);
      }
    } catch { alert('فشل تحديث حالة الطلب'); }
  }, [selectedOrder, visibleOrders]);

  const handleCancel = useCallback(async () => {
    if (!selectedOrder) return;
    try {
      await cancelOrder(selectedOrder.id);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: 'CANCELLED' } : o)));
      const nextOrder = visibleOrders.find((o) => o.id !== selectedOrder.id);
      if (nextOrder) setSelectedOrderId(nextOrder.id);
    } catch { alert('فشل إلغاء الطلب'); }
  }, [selectedOrder, visibleOrders]);

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans overflow-hidden" dir="rtl">
      {/* LEFT PANEL */}
      <div className="w-[340px] lg:w-[380px] flex flex-col shrink-0 border-l border-slate-200 bg-white shadow-xl z-10">
        <div className="p-4 md:p-5 border-b border-slate-100 shrink-0">
          <h2 className="text-xl font-black mb-4 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-green-500" />
            <span>طلبات واتساب</span>
          </h2>
          <div className="relative">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text" placeholder="ابحث..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100 border-none rounded-2xl py-3.5 pr-10 pl-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading ? (
            <div className="text-center py-10 text-slate-400 font-bold text-sm">جاري التحميل...</div>
          ) : visibleOrders.length === 0 ? (
            <div className="text-center py-10 text-slate-400 font-bold text-sm">لا توجد طلبات نشطة</div>
          ) : (
            visibleOrders.map((order) => {
              const isSelected = selectedOrderId === order.id;
              const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.NEW;
              return (
                <button key={order.id} onClick={() => setSelectedOrderId(order.id)}
                  className={`w-full text-right p-4 rounded-2xl border transition-all ${
                    isSelected ? 'bg-indigo-50 border-indigo-500 shadow-lg scale-[1.02]' : 'bg-white border-slate-200 hover:border-indigo-300'
                  }`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-black text-lg">{order.code}</span>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${st.bg} ${st.text} ${st.border} flex items-center gap-1.5`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot} animate-pulse`} />
                      {st.label}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-600 mb-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> {order.customerName}
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500 font-medium">
                    <span>{order.items.length} أصناف</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatTime(order.createdAt)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* CENTER PANEL */}
      <div className="flex-1 flex flex-col bg-slate-50/50">
        {selectedOrder ? (
          <div className="flex-1 flex flex-col h-full">
            <div className="p-6 md:p-8 flex justify-between items-start bg-white border-b border-slate-200 shadow-sm shrink-0">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-4xl font-black text-green-600 font-mono">{selectedOrder.code}</h1>
                  <span className={`px-3 py-1.5 rounded-xl text-sm font-black border ${STATUS_CONFIG[selectedOrder.status]?.bg || 'bg-amber-50'} ${STATUS_CONFIG[selectedOrder.status]?.text || 'text-amber-700'} ${STATUS_CONFIG[selectedOrder.status]?.border || 'border-amber-200'}`}>
                    {STATUS_CONFIG[selectedOrder.status]?.label || 'جديد'}
                  </span>
                  <span className={`px-3 py-1.5 rounded-xl text-xs font-black ${PAYMENT_COLORS[selectedOrder.paymentStatus] || 'text-rose-600 bg-rose-50'}`}>
                    {PAYMENT_LABELS[selectedOrder.paymentStatus] || 'غير مدفوع'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
                    <User className="w-5 h-5 text-indigo-500" /> {selectedOrder.customerName}
                  </h2>
                  <span className="text-slate-400 font-bold flex items-center gap-1">
                    <Phone className="w-4 h-4" /> {selectedOrder.customerPhone}
                  </span>
                </div>
                <div className="text-slate-500 font-bold mt-1 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> {formatTime(selectedOrder.createdAt)}
                </div>
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-slate-500">الإجمالي</div>
                <div className="text-3xl font-black text-slate-800">{Number(selectedOrder.total).toFixed(0)} ج</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8">
              <h3 className="text-lg font-black text-slate-400 mb-6 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5" /> محتويات الطلب
              </h3>
              <div className="space-y-4">
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex items-start gap-5">
                    <div className="w-14 h-14 shrink-0 rounded-2xl bg-green-50 flex items-center justify-center text-green-600 font-black text-xl border border-green-100">
                      x{item.quantity}
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-slate-800">{item.name}</h4>
                      {item.notes && (
                        <p className="mt-2 text-rose-600 font-bold bg-rose-50 border border-rose-200 rounded-xl px-3 py-1.5 inline-block text-sm">
                          {item.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {selectedOrder.specialNotes && (
                <div className="mt-8 bg-amber-50 border border-amber-200 rounded-3xl p-6">
                  <h3 className="text-amber-800 font-black mb-2">ملاحظات إضافية:</h3>
                  <p className="text-amber-900 font-bold text-lg">{selectedOrder.specialNotes}</p>
                </div>
              )}
            </div>

            <div className="p-6 bg-white border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] shrink-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button onClick={() => handleUpdateStatus('PREPARING')}
                  disabled={selectedOrder.status !== 'NEW'}
                  className="py-5 px-4 rounded-3xl font-black text-sm md:text-base flex flex-col items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20">
                  <Play className="w-8 h-8" /> بدء التحضير
                </button>
                <button onClick={() => handleUpdateStatus('READY')}
                  disabled={selectedOrder.status !== 'PREPARING'}
                  className="py-5 px-4 rounded-3xl font-black text-sm md:text-base flex flex-col items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 className="w-8 h-8" /> الطلب جاهز
                </button>
                <button onClick={() => handleUpdateStatus('DELIVERED')}
                  disabled={selectedOrder.status !== 'READY'}
                  className="py-5 px-4 rounded-3xl font-black text-sm md:text-base flex flex-col items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20">
                  <Truck className="w-8 h-8" /> تم التسليم
                </button>
                <button onClick={handleCancel}
                  disabled={selectedOrder.status === 'DELIVERED' || selectedOrder.status === 'CANCELLED'}
                  className="py-5 px-4 rounded-3xl font-black text-sm md:text-base flex flex-col items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 bg-slate-200 hover:bg-rose-500 text-slate-600 hover:text-white">
                  <XCircle className="w-8 h-8" /> إلغاء الطلب
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <Smartphone className="w-24 h-24 mb-6 opacity-50" />
            <h2 className="text-2xl font-black">لا توجد طلبات</h2>
            <p className="font-bold mt-2">انتظر طلبات واتساب جديدة</p>
          </div>
        )}
      </div>
    </div>
  );
}

function mapOrder(raw: any): DashboardOrder {
  return {
    id: raw.id,
    code: raw.code || raw.id.slice(0, 8),
    customerName: raw.customer?.name || raw.customerName || 'عميل',
    customerPhone: raw.customer?.phone || raw.customerPhone || '',
    status: raw.status || 'NEW',
    createdAt: raw.createdAt || new Date().toISOString(),
    items: (raw.items || []).map((i: any) => ({
      id: i.id || i.productId,
      name: i.product?.name || i.productName || 'منتج',
      quantity: i.quantity || 1,
      notes: i.notes || i.product?.options || undefined,
    })),
    paymentStatus: raw.paymentStatus || 'UNPAID',
    total: raw.total || 0,
    specialNotes: raw.items?.[0]?.notes || undefined,
  };
}

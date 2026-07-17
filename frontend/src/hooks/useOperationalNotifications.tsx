'use client';

import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/store';
import api from '@/lib/api';

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = 900;
    oscillator.type = 'sine';
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.4);
  } catch {}
}

function showNotif(icon: string, title: string, message: string) {
  toast.custom(
    (t) => (
      <div
        className={[
          'flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-lg',
          t.visible ? 'animate-in slide-in-from-right' : 'animate-out slide-out-to-right',
        ].join(' ')}
        style={{ minWidth: 280, maxWidth: 360 }}
      >
        <span className="text-lg shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 truncate">{title}</p>
          <p className="text-xs text-gray-500 line-clamp-2">{message}</p>
        </div>
        <button
          onClick={() => toast.dismiss(t.id)}
          className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
        >
          {'\u2715'}
        </button>
      </div>
    ),
    { duration: 5000, position: 'bottom-right' },
  );
}

export default function useOperationalNotifications() {
  const prevPSRef = useRef(0);
  const prevWhatsAppKeysRef = useRef<Set<string>>(new Set());
  const notifiedDelayedRef = useRef<Set<string>>(new Set());
  const prevLowStockRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  // WhatsApp new order notifications
  useEffect(() => {
    const unsub = useAppStore.subscribe((state) => {
      const waOrders = Object.values(state.orders).filter(
        (o: any) => o.status === 'NEW' && (o.sourceType === 'WHATSAPP_ORDER' || o.type === 'WHATSAPP'),
      );
      const currentKeys = new Set(waOrders.map((o: any) => o.id));
      const newKeys = [...currentKeys].filter((k) => !prevWhatsAppKeysRef.current.has(k));
      if (initializedRef.current) {
        for (const id of newKeys) {
          const order: any = waOrders.find((o: any) => o.id === id);
          playNotificationSound();
          showNotif(
            '🔔',
            'طلب واتساب جديد',
            `طلب #${order?.code || id.slice(0, 8)} من ${(order?.customer?.name) || order?.customerName || 'عميل'}`,
          );
        }
      }
      prevWhatsAppKeysRef.current = currentKeys;
      initializedRef.current = true;
    });
    return () => unsub();
  }, []);

  // PlayStation session ended (poll)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get('/playstation/sessions/active');
        const count = Array.isArray(data) ? data.length : 0;
        if (prevPSRef.current > 0 && count < prevPSRef.current) {
          const ended = prevPSRef.current - count;
          playNotificationSound();
          showNotif('🔔', 'انتهت جلسة بلاي ستيشن', `${ended} جلسة ${ended > 1 ? 'انتهت' : 'انتهت'}`);
        }
        prevPSRef.current = count;
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Delayed order notification
  useEffect(() => {
    const THRESHOLD = 10 * 60 * 1000;
    const interval = setInterval(() => {
      const state = useAppStore.getState();
      const storeOrders = Object.values(state.orders);
      const activeOrders = [
        ...storeOrders.filter((o: any) => o.status === 'NEW' || o.status === 'PREPARING'),
        ...state.inCafeOrders.filter((o: any) => o.status === 'NEW' || o.status === 'PREPARING' || o.status === 'READY'),
      ];
      for (const order of activeOrders) {
        const elapsed = Date.now() - new Date((order as any).createdAt).getTime();
        if (elapsed > THRESHOLD && !notifiedDelayedRef.current.has((order as any).id)) {
          notifiedDelayedRef.current.add((order as any).id);
          playNotificationSound();
          showNotif(
            '⚠',
            'طلب متأخر',
            `طلب ${(order as any).code || (order as any).id.slice(0, 8)} — ${(order as any).customer?.name || (order as any).customerName || 'عميل'} يتجاوز ١٠ دقائق`,
          );
        }
      }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Low stock notification
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get('/inventory/low-stock');
        const items: any[] = Array.isArray(data) ? data : [];
        const currentNames = new Set(items.map((i) => i.itemName || i.name || ''));
        const newNames = [...currentNames].filter((n) => !prevLowStockRef.current.has(n));
        if (newNames.length > 0) {
          playNotificationSound();
          showNotif('🔔', 'مخزون منخفض', `${newNames.join('، ')} — المخزون أوشك على النفاد`);
        }
        prevLowStockRef.current = currentNames;
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, []);
}

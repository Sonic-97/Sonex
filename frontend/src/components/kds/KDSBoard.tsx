'use client';

/**
 * @file KDSBoard.tsx
 * @description Real-Time Kitchen Display System — UX-DOC-001 Compliant.
 * Receives live orders from backend via useKDSSocket (/ws/kds/orders).
 * Features:
 * - GPU-accelerated entrance animations for new ticket cards
 * - Web Audio API chime on new order arrival
 * - High-contrast dark mode for kitchen/barista environments
 * - Color-coded tickets: Yellow=NEW | Blue=IN PROGRESS | Green=COMPLETED
 * - 64px+ touch targets for gloved/wet hands
 * - Zero cross-tenant data leakage (enforced in useKDSSocket)
 * - Automatic reconnect with exponential backoff
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useKDSSocket, KDSOrderPayload } from '@/hooks/useKDSSocket';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TicketStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED';

export interface KDSTicketItem {
  name: string;
  nameAr?: string;
  quantity: number;
  notes?: string;
}

export interface KDSTicket {
  id: string;
  orderCode: string;
  channel: string;
  status: TicketStatus;
  items: KDSTicketItem[];
  arrivedAt: number; // timestamp for elapsed time
  isNew?: boolean;   // triggers entrance animation
}

// ─── Audio Chime (Web Audio API Synth — no file dependency) ──────────────────

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.6, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);

    setTimeout(() => ctx.close(), 600);
  } catch {
    // AudioContext not available in SSR or blocked — silent fallback
  }
}

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TicketStatus, {
  bg: string; border: string; badge: string; label: string;
}> = {
  NEW: {
    bg: 'bg-amber-950/80',
    border: 'border-amber-500',
    badge: 'bg-amber-500 text-slate-950',
    label: 'جديد (NEW)',
  },
  IN_PROGRESS: {
    bg: 'bg-blue-950/80',
    border: 'border-blue-500',
    badge: 'bg-blue-600 text-white',
    label: 'قيد التحضير',
  },
  COMPLETED: {
    bg: 'bg-emerald-950/80',
    border: 'border-emerald-500',
    badge: 'bg-emerald-600 text-white',
    label: '✅ مكتمل (READY)',
  },
};

// ─── Channel Label ────────────────────────────────────────────────────────────

function channelLabel(channel: string): string {
  const map: Record<string, string> = {
    IN_CAFE: '🪑 داخل المحل',
    DINE_IN: '🪑 طاولة',
    TAKEAWAY: '🛍️ تيك أواي',
    DELIVERY: '🚴 ديليفري',
    WHATSAPP: '📱 واتساب',
  };
  return map[channel] ?? channel;
}

// ─── Elapsed Time ─────────────────────────────────────────────────────────────

function useElapsedMinutes(arrivedAt: number): number {
  const [mins, setMins] = useState(0);
  useEffect(() => {
    setMins(Math.floor((Date.now() - arrivedAt) / 60000));
    const id = setInterval(() => setMins(Math.floor((Date.now() - arrivedAt) / 60000)), 30000);
    return () => clearInterval(id);
  }, [arrivedAt]);
  return mins;
}

// ─── Ticket Card ─────────────────────────────────────────────────────────────

const TicketCard: React.FC<{
  ticket: KDSTicket;
  onBump: (id: string) => void;
}> = ({ ticket, onBump }) => {
  const config = STATUS_CONFIG[ticket.status];
  const elapsed = useElapsedMinutes(ticket.arrivedAt);

  return (
    <div
      className={`
        rounded-3xl p-6 border-4 flex flex-col justify-between gap-5 shadow-2xl
        transition-all duration-300 transform-gpu
        ${config.bg} ${config.border}
        ${ticket.isNew ? 'animate-kds-enter' : ''}
      `}
    >
      {/* Header */}
      <div className="flex justify-between items-start border-b border-white/10 pb-4">
        <div>
          <div className="text-3xl font-black text-white">{ticket.orderCode}</div>
          <div className="text-sm font-semibold text-slate-300 mt-1">
            {channelLabel(ticket.channel)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase ${config.badge}`}>
            {config.label}
          </span>
          <span className={`text-xs font-mono ${elapsed >= 10 ? 'text-red-400 font-bold' : 'text-slate-400'}`}>
            ⏱️ منذ {elapsed} دقيقة{elapsed >= 10 ? ' ⚠️' : ''}
          </span>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-3 my-1">
        {ticket.items.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-2">لا توجد تفاصيل صنف</div>
        ) : (
          ticket.items.map((item, idx) => (
            <div
              key={idx}
              className="bg-black/40 rounded-2xl p-4 border border-white/10 flex items-start justify-between"
            >
              <div>
                <div className="text-xl font-bold text-white leading-tight">
                  {item.nameAr || item.name}
                </div>
                {item.nameAr && (
                  <div className="text-xs text-slate-400">{item.name}</div>
                )}
                {item.notes && (
                  <div className="mt-1 text-xs text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md inline-block">
                    {item.notes}
                  </div>
                )}
              </div>
              <div className="text-2xl font-black text-amber-400 bg-amber-500/10 px-3 py-1 rounded-xl ml-3 shrink-0">
                ×{item.quantity}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Action Button */}
      <div className="pt-1">
        {ticket.status === 'NEW' && (
          <button
            onClick={() => onBump(ticket.id)}
            className="
              w-full py-5 rounded-2xl font-black text-2xl shadow-xl
              bg-amber-500 hover:bg-amber-400 active:scale-95
              text-slate-950 border-2 border-amber-400
              transition-all duration-150
            "
          >
            ▶️ بدء التحضير
          </button>
        )}
        {ticket.status === 'IN_PROGRESS' && (
          <button
            onClick={() => onBump(ticket.id)}
            className="
              w-full py-5 rounded-2xl font-black text-2xl shadow-xl
              bg-emerald-500 hover:bg-emerald-400 active:scale-95
              text-white border-2 border-emerald-400
              transition-all duration-150
            "
          >
            ✅ جاهز للتسليم
          </button>
        )}
        {ticket.status === 'COMPLETED' && (
          <div className="bg-emerald-900/60 text-emerald-300 font-black text-center py-4 rounded-2xl text-lg border border-emerald-500/40">
            🎉 مكتمل ومسلم
          </div>
        )}
      </div>
    </div>
  );
};

// ─── KDSBoard Component ───────────────────────────────────────────────────────

interface KDSBoardProps {
  tenantId?: string;
  branchId?: string;
}

export const KDSBoard: React.FC<KDSBoardProps> = ({
  tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'default-tenant',
  branchId = process.env.NEXT_PUBLIC_BRANCH_ID || 'default-branch',
}) => {
  const [tickets, setTickets] = useState<KDSTicket[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [orderCount, setOrderCount] = useState(0);
  const animTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Handler for incoming real-time orders
  const handleOrderCreated = useCallback((payload: KDSOrderPayload) => {
    const newTicket: KDSTicket = {
      id: payload.orderId,
      orderCode: payload.code,
      channel: payload.channel,
      status: 'NEW',
      items: (payload.items || []).map((i) => ({
        name: i.name,
        quantity: i.quantity,
        notes: i.notes,
      })),
      arrivedAt: Date.now(),
      isNew: true,
    };

    // Play audio chime on arrival
    playChime();

    setTickets((prev) => {
      // Idempotency: skip duplicate order IDs
      if (prev.some((t) => t.id === newTicket.id)) return prev;
      return [newTicket, ...prev];
    });

    setOrderCount((c) => c + 1);

    // Remove "isNew" flag after animation completes (600ms)
    const timer = setTimeout(() => {
      setTickets((prev) =>
        prev.map((t) => (t.id === newTicket.id ? { ...t, isNew: false } : t)),
      );
      animTimers.current.delete(newTicket.id);
    }, 600);
    animTimers.current.set(newTicket.id, timer);
  }, []);

  // Connect to /ws/kds/orders namespace
  useKDSSocket({ tenantId, branchId, onOrderCreated: handleOrderCreated });

  // Cleanup animation timers on unmount
  useEffect(() => {
    return () => {
      animTimers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const handleBump = useCallback((ticketId: string) => {
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id !== ticketId) return t;
        if (t.status === 'NEW') return { ...t, status: 'IN_PROGRESS' };
        if (t.status === 'IN_PROGRESS') return { ...t, status: 'COMPLETED' };
        return t;
      }),
    );
  }, []);

  const handleClearCompleted = useCallback(() => {
    setTickets((prev) => prev.filter((t) => t.status !== 'COMPLETED'));
  }, []);

  const completedCount = tickets.filter((t) => t.status === 'COMPLETED').length;
  const activeCount = tickets.filter((t) => t.status !== 'COMPLETED').length;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-6 flex flex-col gap-6 select-none font-sans">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-3">
            🖥️ شاشة المطبخ والبارستا (KDS)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            عرض لحظي للطلبات — متصل بـ Sonex Backend
          </p>
        </div>

        {/* Status Bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${
            isConnected
              ? 'bg-emerald-950 text-emerald-400 border-emerald-700'
              : 'bg-red-950 text-red-400 border-red-700 animate-pulse'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {isConnected ? 'متصل (Live)' : 'جاري الاتصال...'}
          </span>

          <span className="text-xs font-mono bg-slate-800 text-slate-300 px-3 py-1.5 rounded-full border border-slate-700">
            🧾 {activeCount} طلب نشط
          </span>

          {completedCount > 0 && (
            <button
              onClick={handleClearCompleted}
              className="text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full border border-slate-600 transition-colors"
            >
              🗑️ مسح المكتمل ({completedCount})
            </button>
          )}
        </div>
      </div>

      {/* ── Empty State ── */}
      {tickets.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="text-6xl">⏳</div>
          <h2 className="text-xl font-bold text-slate-400">في انتظار الطلبات...</h2>
          <p className="text-sm text-slate-600 max-w-xs">
            ستظهر الطلبات هنا فور وصولها من البارستا والمطبخ عبر الاتصال اللحظي.
          </p>
        </div>
      )}

      {/* ── Tickets Grid ── */}
      {tickets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} onBump={handleBump} />
          ))}
        </div>
      )}

      {/* ── Footer Stats ── */}
      <div className="border-t border-slate-800 pt-3 flex gap-4 text-xs text-slate-600 font-mono">
        <span>إجمالي الطلبات اليوم: {orderCount}</span>
        <span>|</span>
        <span>Tenant: {tenantId.substring(0, 8)}...</span>
      </div>
    </div>
  );
};

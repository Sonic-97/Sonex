'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  Edit,
  Trash2,
  Clock,
  Coins,
  Settings,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
  Coffee,
  ArrowRightLeft,
  Crown,
  Gamepad2,
  CheckCircle2,
} from 'lucide-react';
import api from '@/lib/api';

export interface Device {
  id: string;
  name: string;
  deviceType?: string; // 'PS5' | 'PS4' | 'VIP_ROOM' | 'BILLIARDS' | 'PING_PONG'
  hourlyRate?: number | string | null;
  multiHourlyRate?: number | string | null;
  notes?: string | null;
  active: boolean;
}

export interface Session {
  id: string;
  customerName: string;
  sessionType: string;
  startTime: string;
  serverTime?: string;
  billableStartTime?: string | null;
  isPaused?: boolean;
  totalPauseMinutes?: number;
  ordersTotal?: number;
  ordersCount?: number;
  targetDurationMinutes?: number | null;
  targetRemainingMinutes?: number | null;
}

export interface Pricing {
  singlePlayerHourlyPrice: number;
  twoPlayersHourlyPrice: number;
  threePlayersHourlyPrice: number;
  fourPlayersHourlyPrice: number;
}

interface PlayStationCardProps {
  device: Device;
  activeSession: Session | null;
  pricing: Pricing;
  role: 'owner' | 'barista';
  onOpenSession: (deviceId: string) => void;
  onCloseSession: (session: Session, duration: number, cost: number) => void;
  onAddOrder?: (session: Session, device: Device) => void;
  onPauseSession?: (sessionId: string) => void;
  onResumeSession?: (sessionId: string) => void;
  onTransferSession?: (session: Session, device: Device) => void;
  onEditDevice?: (device: Device) => void;
  onToggleDevice?: (device: Device) => void;
  onDeleteDevice?: (deviceId: string) => void;
}

const SYNC_INTERVAL_MS = 30000;

export function PlayStationCard({
  device,
  activeSession,
  pricing,
  role,
  onOpenSession,
  onCloseSession,
  onAddOrder,
  onPauseSession,
  onResumeSession,
  onTransferSession,
  onEditDevice,
  onToggleDevice,
  onDeleteDevice,
}: PlayStationCardProps) {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [billableMinutes, setBillableMinutes] = useState(0);
  const [billableSeconds, setBillableSeconds] = useState(0);
  const [currentCost, setCurrentCost] = useState(0);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [isFreePhase, setIsFreePhase] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [lastSyncAgo, setLastSyncAgo] = useState(0);
  const [isOffline, setIsOffline] = useState(false);

  const clockSkewRef = useRef(0);
  const startTimeRef = useRef<number>(0);
  const billableStartRef = useRef<number>(0);
  const lastSyncRef = useRef<number>(0);
  const syncTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const storageKey = activeSession ? `ps_timer_${activeSession.id}` : null;

  // Load cached timer state from localStorage on mount
  const loadCachedState = useCallback(() => {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }, [storageKey]);

  // Save current timer state to localStorage
  const saveTimerState = useCallback(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          elapsedMinutes,
          elapsedSeconds,
          billableMinutes,
          billableSeconds,
          currentCost,
          ordersTotal,
          isFreePhase,
          isPaused,
          startTime: startTimeRef.current,
          billableStartTime: billableStartRef.current,
          lastSyncedAt: lastSyncRef.current || Date.now(),
        }),
      );
    } catch {}
  }, [storageKey, elapsedMinutes, elapsedSeconds, billableMinutes, billableSeconds, currentCost, ordersTotal, isFreePhase, isPaused]);

  // Sync with backend authoritative timer state
  const syncWithBackend = useCallback(async () => {
    if (!activeSession) return;
    try {
      const clientReqTime = Date.now();
      const res = await api.get(`/playstation/sessions/${activeSession.id}/timer`);
      const clientRecvTime = Date.now();

      if (res.data) {
        const {
          serverTime,
          freeRemainingMinutes,
          freeRemainingSeconds,
          elapsedMinutes: sElapsedMin,
          elapsedSeconds: sElapsedSec,
          billableMinutes: sBillableMin,
          billableSeconds: sBillableSec,
          isFreePhase: sIsFree,
          isPaused: sIsPaused,
          timeCost,
          ordersTotal: sOrdersTotal,
        } = res.data;

        const roundTrip = clientRecvTime - clientReqTime;
        const serverTimestamp = new Date(serverTime).getTime() + Math.round(roundTrip / 2);
        clockSkewRef.current = serverTimestamp - clientRecvTime;

        setElapsedMinutes(sElapsedMin);
        setElapsedSeconds(sElapsedSec);
        setBillableMinutes(sBillableMin);
        setBillableSeconds(sBillableSec);
        setIsFreePhase(sIsFree);
        setIsPaused(Boolean(sIsPaused));
        setCurrentCost(timeCost);
        setOrdersTotal(sOrdersTotal || 0);
        setIsOffline(false);

        lastSyncRef.current = Date.now();
        setLastSyncAgo(0);
      }
    } catch {
      setIsOffline(true);
      const cached = loadCachedState();
      if (cached) {
        setElapsedMinutes(cached.elapsedMinutes || 0);
        setElapsedSeconds(cached.elapsedSeconds || 0);
        setBillableMinutes(cached.billableMinutes || 0);
        setBillableSeconds(cached.billableSeconds || 0);
        setCurrentCost(cached.currentCost || 0);
        setOrdersTotal(cached.ordersTotal || 0);
        setIsFreePhase(cached.isFreePhase !== undefined ? cached.isFreePhase : true);
        setIsPaused(Boolean(cached.isPaused));
      }
    }
  }, [activeSession, loadCachedState]);

  // Initial load
  useEffect(() => {
    if (activeSession) {
      startTimeRef.current = new Date(activeSession.startTime).getTime();
      setIsPaused(Boolean(activeSession.isPaused));
      setOrdersTotal(activeSession.ordersTotal || 0);
      syncWithBackend();

      syncTimerRef.current = setInterval(syncWithBackend, SYNC_INTERVAL_MS);
    } else {
      setElapsedMinutes(0);
      setElapsedSeconds(0);
      setBillableMinutes(0);
      setBillableSeconds(0);
      setCurrentCost(0);
      setOrdersTotal(0);
      setIsFreePhase(true);
      setIsPaused(false);
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    }

    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [activeSession?.id, syncWithBackend]);

  // 1-second interval tick for smooth UI updates
  useEffect(() => {
    if (!activeSession || isPaused) return;

    const interval = setInterval(() => {
      setElapsedSeconds((prevSec) => {
        if (prevSec >= 59) {
          setElapsedMinutes((prevMin) => prevMin + 1);
          return 0;
        }
        return prevSec + 1;
      });

      if (!isFreePhase) {
        setBillableSeconds((prevSec) => {
          if (prevSec >= 59) {
            setBillableMinutes((prevMin) => {
              const newMin = prevMin + 1;
              // Recalculate cost
              const hourly =
                device.hourlyRate != null
                  ? Number(device.hourlyRate)
                  : pricing.singlePlayerHourlyPrice;
              const ratePerMin = hourly / 60;
              setCurrentCost(Math.round(ratePerMin * newMin * 100) / 100);
              return newMin;
            });
            return 0;
          }
          return prevSec + 1;
        });
      }

      setLastSyncAgo((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession, isFreePhase, isPaused, device.hourlyRate, pricing.singlePlayerHourlyPrice]);

  useEffect(() => {
    saveTimerState();
  }, [elapsedMinutes, elapsedSeconds, saveTimerState]);

  const handleEndSession = () => {
    if (!activeSession) return;
    const totalGrandCost = currentCost + ordersTotal;
    onCloseSession(activeSession, elapsedMinutes, totalGrandCost);
  };

  const getDeviceTypeBadge = () => {
    const type = device.deviceType || 'PS5';
    switch (type) {
      case 'VIP_ROOM':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <Crown className="w-3 h-3 text-amber-400" /> غرفة VIP
          </span>
        );
      case 'BILLIARDS':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            🎱 بلياردو
          </span>
        );
      case 'PING_PONG':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
            🏓 بينج بونج
          </span>
        );
      case 'PS4':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-600/30 text-slate-300 border border-slate-500/30">
            PS4
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            PS5
          </span>
        );
    }
  };

  const freeRemainingMinutes = isFreePhase ? Math.max(0, 10 - elapsedMinutes - 1) : 0;
  const freeRemainingSeconds = isFreePhase ? Math.max(0, 59 - elapsedSeconds) : 0;

  return (
    <div
      className={`rounded-2xl border transition-all duration-300 p-5 ${
        !device.active
          ? 'bg-[#150f0d]/60 border-white/5 opacity-60'
          : activeSession
          ? isPaused
            ? 'bg-[#1c140f] border-amber-500/40 shadow-xl shadow-amber-500/5'
            : 'bg-[#1a1210] border-[#c69255]/40 shadow-xl shadow-[#c69255]/5 ring-1 ring-[#c69255]/20'
          : 'bg-[#17100e] border-white/10 hover:border-white/20'
      }`}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              activeSession
                ? isPaused
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-[#c69255]/20 text-[#c69255]'
                : 'bg-white/5 text-gray-400'
            }`}
          >
            <Gamepad2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white tracking-wide">{device.name}</h4>
              {getDeviceTypeBadge()}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  !device.active
                    ? 'bg-gray-600'
                    : activeSession
                    ? isPaused
                      ? 'bg-amber-500 animate-pulse'
                      : 'bg-emerald-500 animate-ping'
                    : 'bg-emerald-500'
                }`}
              />
              <span className="text-[11px] text-gray-400">
                {!device.active
                  ? 'معطل'
                  : activeSession
                  ? isPaused
                    ? 'متوقف مؤقتاً'
                    : 'مشغول باللعب'
                  : 'متاح للعب'}
              </span>
            </div>
          </div>
        </div>

        {/* Owner Controls */}
        {role === 'owner' && (
          <div className="flex items-center gap-1">
            {onToggleDevice && (
              <button
                onClick={() => onToggleDevice(device)}
                className="p-1.5 text-gray-400 hover:text-white transition-colors"
                title={device.active ? 'تعطيل الجهاز' : 'تفعيل الجهاز'}
              >
                {device.active ? (
                  <ToggleRight className="w-5 h-5 text-emerald-500" />
                ) : (
                  <ToggleLeft className="w-5 h-5 text-gray-600" />
                )}
              </button>
            )}
            {onEditDevice && (
              <button
                onClick={() => onEditDevice(device)}
                className="p-1.5 text-gray-400 hover:text-white transition-colors"
                title="تعديل الجهاز"
              >
                <Edit className="w-3.5 h-3.5" />
              </button>
            )}
            {onDeleteDevice && (
              <button
                onClick={() => onDeleteDevice(device.id)}
                disabled={Boolean(activeSession)}
                className="p-1.5 text-gray-500 hover:text-red-400 disabled:opacity-30 transition-colors"
                title="حذف الجهاز"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Card Body */}
      {device.active && activeSession ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-xs bg-[#120d0b] p-2.5 rounded-xl border border-white/5">
            <div>
              <span className="text-[10px] text-gray-500 block">العميل</span>
              <span className="font-bold text-white truncate block">{activeSession.customerName}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 block">نوع اللعب</span>
              <span className="font-bold text-[#c69255] block">{activeSession.sessionType}</span>
            </div>
          </div>

          {/* Timer Display */}
          <div
            className={`rounded-xl p-3 flex flex-col items-center justify-center border ${
              isPaused
                ? 'bg-amber-950/20 border-amber-500/30'
                : isOffline
                ? 'bg-red-950/20 border-red-900/50'
                : 'bg-[#120d0b] border-white/5'
            }`}
          >
            {isPaused && (
              <span className="text-[10px] font-bold text-amber-400 mb-1 flex items-center gap-1 animate-pulse">
                <Pause className="w-3 h-3" /> الجلسة متوقفة مؤقتاً
              </span>
            )}
            {isFreePhase ? (
              <>
                <span className="text-[10px] text-gray-400 mb-0.5">⏳ الوقت المجاني المتبقي</span>
                <span className="text-2xl font-black text-amber-500 font-mono">
                  {freeRemainingMinutes.toString().padStart(2, '0')}:
                  {freeRemainingSeconds.toString().padStart(2, '0')}
                </span>
              </>
            ) : (
              <>
                <span className="text-[10px] text-gray-400 mb-0.5">🕒 وقت اللعب المحسوب</span>
                <span className="text-2xl font-black text-[#f4efe6] font-mono">
                  {billableMinutes.toString().padStart(2, '0')}:
                  {billableSeconds.toString().padStart(2, '0')}
                </span>
              </>
            )}
          </div>

          {/* Real-time Cost & Attached Cafe Orders */}
          <div className="space-y-1.5 border-t border-white/5 pt-3 text-xs">
            <div className="flex items-center justify-between text-gray-400">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
                تكلفة الوقت:
              </span>
              <span className="font-mono font-bold text-white">{currentCost.toFixed(2)} ج.م</span>
            </div>

            {ordersTotal > 0 && (
              <div className="flex items-center justify-between text-amber-300">
                <span className="flex items-center gap-1.5">
                  <Coffee className="w-3.5 h-3.5 text-amber-400" />
                  مشاريب وطلبات الكافيه:
                </span>
                <span className="font-mono font-bold">{ordersTotal.toFixed(2)} ج.م</span>
              </div>
            )}

            <div className="flex items-center justify-between text-sm font-bold border-t border-white/5 pt-1.5">
              <span className="text-white flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-[#c69255]" />
                الإجمالي الحالي:
              </span>
              <span className="font-mono text-[#c69255] text-base">
                {(currentCost + ordersTotal).toFixed(2)} ج.م
              </span>
            </div>
          </div>

          {/* Quick Action Grid */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {/* Add Drink */}
            {onAddOrder && (
              <button
                type="button"
                onClick={() => onAddOrder(activeSession, device)}
                className="flex items-center justify-center gap-1 py-2 px-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-[11px] font-semibold transition-all"
                title="إضافة مشروبات للجلسة"
              >
                <Coffee className="w-3.5 h-3.5" />
                طلب مشروب
              </button>
            )}

            {/* Pause / Resume */}
            {isPaused ? (
              <button
                type="button"
                onClick={() => onResumeSession && onResumeSession(activeSession.id)}
                className="flex items-center justify-center gap-1 py-2 px-1 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-[11px] font-semibold transition-all"
                title="استئناف اللعب"
              >
                <Play className="w-3.5 h-3.5" />
                استئناف
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onPauseSession && onPauseSession(activeSession.id)}
                className="flex items-center justify-center gap-1 py-2 px-1 rounded-xl bg-gray-500/10 hover:bg-gray-500/20 text-gray-300 border border-white/10 text-[11px] font-semibold transition-all"
                title="إيقاف مؤقت"
              >
                <Pause className="w-3.5 h-3.5" />
                إيقاف مؤقت
              </button>
            )}

            {/* Transfer */}
            {onTransferSession && (
              <button
                type="button"
                onClick={() => onTransferSession(activeSession, device)}
                className="flex items-center justify-center gap-1 py-2 px-1 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 text-[11px] font-semibold transition-all"
                title="نقل الجلسة لجهاز آخر"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                نقل الجهاز
              </button>
            )}
          </div>

          {/* End & Settle Button */}
          <button
            type="button"
            onClick={handleEndSession}
            className="w-full rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:brightness-110 text-white font-bold text-xs py-2.5 shadow-lg shadow-red-600/10 transition-all active:scale-[0.98]"
          >
            إنهاء وحساب الفاتورة الموحدة
          </button>
        </div>
      ) : device.active ? (
        <div className="py-7 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-xl bg-[#120d0b]/40">
          <p className="text-xs text-gray-500 mb-3">الجهاز أو الغرفة شاغرة ومتاحة للعب</p>
          <button
            type="button"
            onClick={() => onOpenSession(device.id)}
            className="flex items-center gap-2 rounded-xl bg-[#c69255] hover:bg-[#b58145] px-6 py-2.5 text-xs font-bold text-black shadow-lg shadow-[#c69255]/15 transition-all active:scale-[0.98]"
          >
            <Play className="w-3.5 h-3.5 fill-black" />
            <span>بدء جلسة جديدة</span>
          </button>
        </div>
      ) : (
        <div className="py-7 flex flex-col items-center justify-center border border-white/5 rounded-xl bg-[#120d0b]/60">
          <ShieldAlert className="w-6 h-6 text-gray-600 mb-2" />
          <p className="text-xs text-gray-500 text-center leading-relaxed">
            هذا الجهاز أو الغرفة معطلة حالياً.
          </p>
        </div>
      )}
    </div>
  );
}
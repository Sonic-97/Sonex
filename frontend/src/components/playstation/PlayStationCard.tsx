'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Edit, Trash2, Clock, Coins, CheckSquare, Square, Settings, ShieldAlert, ToggleLeft, ToggleRight } from 'lucide-react';
import api from '@/lib/api';

interface Device {
  id: string;
  name: string;
  active: boolean;
}

interface Session {
  id: string;
  customerName: string;
  sessionType: string;
  startTime: string;
  serverTime?: string;
  billableStartTime?: string | null;
}

interface Pricing {
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
  onEditDevice,
  onToggleDevice,
  onDeleteDevice,
}: PlayStationCardProps) {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [billableMinutes, setBillableMinutes] = useState(0);
  const [billableSeconds, setBillableSeconds] = useState(0);
  const [currentCost, setCurrentCost] = useState(0);
  const [isFreePhase, setIsFreePhase] = useState(true);
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
      localStorage.setItem(storageKey, JSON.stringify({
        elapsedMinutes,
        elapsedSeconds,
        billableMinutes,
        billableSeconds,
        currentCost,
        isFreePhase,
        startTime: startTimeRef.current,
        billableStartTime: billableStartRef.current,
        lastSyncedAt: lastSyncRef.current || Date.now(),
      }));
    } catch {}
  }, [storageKey, elapsedMinutes, elapsedSeconds, billableMinutes, billableSeconds, currentCost, isFreePhase]);

  // Sync with backend authoritative timer state
  const syncWithBackend = useCallback(async () => {
    if (!activeSession?.id) return;
    try {
      const { data } = await api.get(`/playstation/sessions/${activeSession.id}/timer`);
      lastSyncRef.current = Date.now();
      setLastSyncAgo(0);

      // Recalibrate clock skew using serverTime from backend
      const serverRef = new Date(data.serverTime).getTime();
      clockSkewRef.current = Date.now() - serverRef;

      // Recalibrate reference times from authoritative backend data
      startTimeRef.current = new Date(data.startTime).getTime();
      if (data.billableStartTime) {
        billableStartRef.current = new Date(data.billableStartTime).getTime();
      } else {
        billableStartRef.current = 0;
      }

      // Use backend's computed values to prevent drift
      if (data.isFreePhase) {
        setIsFreePhase(true);
        setElapsedMinutes(data.elapsedMinutes);
        setElapsedSeconds(data.elapsedSeconds);
        setBillableMinutes(0);
        setBillableSeconds(0);
        setCurrentCost(0);
      } else {
        setIsFreePhase(false);
        setElapsedMinutes(data.elapsedMinutes);
        setElapsedSeconds(data.elapsedSeconds);
        setBillableMinutes(data.billableMinutes);
        setBillableSeconds(data.billableSeconds);
        setCurrentCost(data.totalCost);
      }
      setIsOffline(false);
    } catch {
      // Offline or network error - fallback to local computation
      setIsOffline(true);
    }
  }, [activeSession?.id]);

  // Initialize timer from session data or cached state
  useEffect(() => {
    if (!activeSession) {
      setElapsedMinutes(0);
      setElapsedSeconds(0);
      setBillableMinutes(0);
      setBillableSeconds(0);
      setCurrentCost(0);
      setIsFreePhase(true);
      clockSkewRef.current = 0;
      startTimeRef.current = 0;
      billableStartRef.current = 0;
      lastSyncRef.current = 0;
      setLastSyncAgo(0);
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
        syncTimerRef.current = undefined;
      }
      return;
    }

    const cached = loadCachedState();
    const start = new Date(activeSession.startTime).getTime();
    const serverReference = activeSession.serverTime
      ? new Date(activeSession.serverTime).getTime()
      : Date.now();
    const initialSkew = Date.now() - serverReference;

    clockSkewRef.current = initialSkew;
    startTimeRef.current = start;

    if (activeSession.billableStartTime) {
      billableStartRef.current = new Date(activeSession.billableStartTime).getTime();
    } else {
      // If billable hasn't started yet, compute from 10 min after start
      const billableCandidate = start + 600000;
      billableStartRef.current = Date.now() - initialSkew >= billableCandidate ? billableCandidate : 0;
    }

    // If we have a recent cached state (< 5s old), use it to avoid display flash
    if (cached && cached.lastSyncedAt && (Date.now() - cached.lastSyncedAt) < 5000) {
      setElapsedMinutes(cached.elapsedMinutes);
      setElapsedSeconds(cached.elapsedSeconds);
      setBillableMinutes(cached.billableMinutes);
      setBillableSeconds(cached.billableSeconds);
      setCurrentCost(cached.currentCost);
      setIsFreePhase(cached.isFreePhase);
      startTimeRef.current = cached.startTime;
      billableStartRef.current = cached.billableStartTime;
    } else {
      // Initial immediate calculation
      const adjustedNow = Date.now() - initialSkew;
      const diffMs = Math.max(0, adjustedNow - start);
      const totalSec = Math.floor(diffMs / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      setElapsedMinutes(m);
      setElapsedSeconds(s);

      const isFree = m < 10;
      setIsFreePhase(isFree);

      if (!isFree) {
        const billableStart = billableStartRef.current || start + 600000;
        const billableMs = Math.max(0, adjustedNow - billableStart);
        const billableSec = Math.floor(billableMs / 1000);
        setBillableMinutes(Math.floor(billableSec / 60));
        setBillableSeconds(billableSec % 60);

        let hourlyRate = 20;
        const type = activeSession.sessionType;
        if (type === 'Single Player') hourlyRate = Number(pricing.singlePlayerHourlyPrice);
        else if (type === 'Two Players') hourlyRate = Number(pricing.twoPlayersHourlyPrice);
        else if (type === 'Three Players') hourlyRate = Number(pricing.threePlayersHourlyPrice);
        else if (type === 'Four Players') hourlyRate = Number(pricing.fourPlayersHourlyPrice);

        const billableMinutesVal = Math.floor(billableMs / 60000);
        const billableSecondsVal = Math.floor((billableMs % 60000) / 1000);
        const perMinRate = hourlyRate / 60;
        setCurrentCost(perMinRate * (billableMinutesVal + billableSecondsVal / 60));
      }
    }

    // Sync with backend immediately on mount
    syncWithBackend();

    // Set up 1-second timer tick
    const tickTimer = setInterval(() => {
      const adjustNow = Date.now() - clockSkewRef.current;
      const diffMs = Math.max(0, adjustNow - startTimeRef.current);
      const totalSec = Math.floor(diffMs / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      setElapsedMinutes(m);
      setElapsedSeconds(s);

      const free = m < 10;
      setIsFreePhase(free);

      if (!free) {
        const bStart = billableStartRef.current || startTimeRef.current + 600000;
        const bMs = Math.max(0, adjustNow - bStart);
        const bSec = Math.floor(bMs / 1000);
        const bMin = Math.floor(bSec / 60);
        setBillableMinutes(bMin);
        setBillableSeconds(bSec % 60);

        let hourlyRate = 20;
        const type = activeSession.sessionType;
        if (type === 'Single Player') hourlyRate = Number(pricing.singlePlayerHourlyPrice);
        else if (type === 'Two Players') hourlyRate = Number(pricing.twoPlayersHourlyPrice);
        else if (type === 'Three Players') hourlyRate = Number(pricing.threePlayersHourlyPrice);
        else if (type === 'Four Players') hourlyRate = Number(pricing.fourPlayersHourlyPrice);

        const perMinRate = hourlyRate / 60;
        setCurrentCost(perMinRate * (bMin + (bSec % 60) / 60));
      } else {
        setBillableMinutes(0);
        setBillableSeconds(0);
        setCurrentCost(0);
      }

      // Update last sync age indicator
      if (lastSyncRef.current > 0) {
        setLastSyncAgo(Math.floor((Date.now() - lastSyncRef.current) / 1000));
      }
    }, 1000);

    // Set up periodic backend sync
    syncTimerRef.current = setInterval(syncWithBackend, SYNC_INTERVAL_MS);

    return () => {
      clearInterval(tickTimer);
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
        syncTimerRef.current = undefined;
      }
    };
  }, [activeSession, pricing, loadCachedState, syncWithBackend]);

  // Save timer state to localStorage periodically (every 5 seconds)
  useEffect(() => {
    if (!activeSession) return;
    const saveTimer = setInterval(saveTimerState, 5000);
    return () => clearInterval(saveTimer);
  }, [activeSession, saveTimerState]);

  // Free time remaining (countdown)
  const freeRemainingTotalSeconds = Math.max(0, 600 - (elapsedMinutes * 60 + elapsedSeconds));
  const freeRemainingMinutes = Math.floor(freeRemainingTotalSeconds / 60);
  const freeRemainingSeconds = freeRemainingTotalSeconds % 60;

  const handleEndSession = () => {
    if (activeSession) {
      const totalElapsedMinutes = elapsedMinutes + elapsedSeconds / 60;
      onCloseSession(activeSession, Math.ceil(totalElapsedMinutes), currentCost);
    }
  };

  const syncStatusColor = lastSyncAgo < 60 ? 'text-emerald-500' : lastSyncAgo < 120 ? 'text-amber-500' : 'text-red-500';

  return (
    <div className={`rounded-2xl border bg-slate-900/60 p-5 shadow-lg relative overflow-hidden transition-all hover:shadow-xl ${
      !device.active
        ? 'border-slate-800 opacity-60'
        : activeSession
        ? 'border-violet-500/40 ring-1 ring-violet-500/20'
        : 'border-slate-800 hover:border-slate-750'
    }`}>
      {/* Device Header */}
      <div className="flex items-center justify-between border-b border-slate-850 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${
            !device.active ? 'bg-slate-600' : activeSession ? 'bg-violet-400 animate-pulse' : 'bg-emerald-400'
          }`} />
          <h3 className="font-bold text-white text-sm">{device.name}</h3>
        </div>
        
        {/* Device Status/Control Badge */}
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            !device.active
              ? 'bg-slate-800 text-slate-400'
              : activeSession
              ? isFreePhase
                ? 'bg-amber-500/10 text-amber-400'
                : 'bg-violet-500/10 text-violet-400'
              : 'bg-emerald-500/10 text-emerald-400'
          }`}>
            {!device.active
              ? 'معطل'
              : activeSession
              ? isFreePhase
                ? '⏳ وقت مجاني (Pending Free Time)'
                : '🕒 وقت محسوب (Running)'
              : 'شغال / متاح'}
          </span>

          {role === 'owner' && (
            <div className="flex items-center gap-1 border-r border-slate-800 pr-1.5 mr-1.5">
              {onToggleDevice && (
                <button
                  onClick={() => onToggleDevice(device)}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title={device.active ? 'تعطيل الجهاز' : 'تفعيل الجهاز'}
                >
                  {device.active ? (
                    <ToggleRight className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <ToggleLeft className="h-5 w-5 text-slate-500" />
                  )}
                </button>
              )}
              {onEditDevice && (
                <button
                  onClick={() => onEditDevice(device)}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="تعديل الاسم"
                >
                  <Edit className="h-3.5 w-3.5" />
                </button>
              )}
              {onDeleteDevice && (
                <button
                  onClick={() => onDeleteDevice(device.id)}
                  disabled={!!activeSession}
                  className="text-slate-500 hover:text-red-400 disabled:opacity-30 disabled:hover:text-slate-500 transition-colors cursor-pointer"
                  title="حذف الجهاز"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Device Body */}
      {device.active && activeSession ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-right">
            <div>
              <span className="text-[10px] text-slate-500 block">اسم العميل</span>
              <span className="text-xs font-bold text-white truncate block">{activeSession.customerName}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">نوع اللعب</span>
              <span className="text-xs font-bold text-amber-400 block">{activeSession.sessionType}</span>
            </div>
          </div>

          {/* Timer Display */}
          <div className={`rounded-xl p-3 flex flex-col items-center justify-center border ${isOffline ? 'bg-red-950/20 border-red-900/50' : 'bg-slate-950 border-slate-850'}`}>
            {isOffline && (
              <span className="text-[10px] font-bold text-red-500 mb-2 flex items-center gap-1 animate-pulse">
                <ShieldAlert className="w-3 h-3" /> Offline: Timer running locally
              </span>
            )}
            {isFreePhase ? (
              <>
                <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1 mb-1">
                  <span>⏳ الوقت المجاني المتبقي</span>
                </span>
                <span className="text-2xl font-black text-amber-500 font-mono">
                  {freeRemainingMinutes.toString().padStart(2, '0')}:
                  {freeRemainingSeconds.toString().padStart(2, '0')}
                </span>
              </>
            ) : (
              <>
                <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1 mb-1">
                  <span>🕒 الوقت المحسوب</span>
                </span>
                <span className="text-2xl font-black text-violet-400 font-mono">
                  {billableMinutes.toString().padStart(2, '0')}:
                  {billableSeconds.toString().padStart(2, '0')}
                </span>
              </>
            )}
          </div>

          {/* Real-time Cost */}
          <div className="flex items-center justify-between border-t border-slate-850 pt-3">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Coins className="h-4 w-4 text-emerald-400" />
              <span>المبلغ الحالي:</span>
            </span>
            <span className="text-base font-black text-emerald-400 font-mono">
              {currentCost.toFixed(2)} EGP
            </span>
          </div>

          {/* Sync Status Indicator */}
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-600">
              {lastSyncAgo === 0 ? (
                <span className="text-emerald-500">متزامن</span>
              ) : (
                <span>آخر تزامن: {lastSyncAgo} ث</span>
              )}
            </span>
            <span className={`h-1.5 w-1.5 rounded-full ${syncStatusColor}`} />
          </div>

          {/* Actions */}
          <button
            onClick={handleEndSession}
            className="w-full rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-2.5 shadow-lg shadow-red-600/10 transition-all active:scale-[0.98] cursor-pointer"
          >
            إغلاق وحساب الفاتورة
          </button>
        </div>
      ) : device.active ? (
        <div className="py-6 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
          <p className="text-xs text-slate-500 mb-4">الجهاز جاهز لبدء وقت لعب جديد</p>
          <button
            onClick={() => onOpenSession(device.id)}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-500/10 transition-all active:scale-[0.98] cursor-pointer"
          >
            <span>افتح وقت</span>
          </button>
        </div>
      ) : (
        <div className="py-6 flex flex-col items-center justify-center border border-slate-850 rounded-xl bg-slate-950/40">
          <ShieldAlert className="h-6 w-6 text-slate-600 mb-2" />
          <p className="text-xs text-slate-500 text-center leading-relaxed">
            هذا الجهاز معطل حالياً من قِبل المدير.<br/>تواصل مع الإدارة لتفعيله.
          </p>
        </div>
      )}
    </div>
  );
}
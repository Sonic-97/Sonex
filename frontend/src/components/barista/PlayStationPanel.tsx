'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getPSDevices,
  getPSPricing,
  getPSActiveSessions,
  startPSSession,
  getPSTimer,
  closePSSession,
} from '@/lib/api';
import { Loader2, Clock, DollarSign, User, Gamepad2, CheckCircle2, XCircle } from 'lucide-react';

interface Device {
  id: string;
  name: string;
  active: boolean;
}

interface ActiveSession {
  id: string;
  deviceId: string;
  customerName: string;
  sessionType: string;
  status: string;
  startTime: string;
  freePeriodEndTime?: string;
  device?: Device;
  openedBy?: { id: string; name: string };
  serverTime?: string;
}

interface TimerState {
  sessionId: string;
  status: string;
  serverTime: string;
  startTime: string;
  freePeriodEndTime: string;
  billableStartTime?: string | null;
  freeRemainingMinutes: number;
  freeRemainingSeconds: number;
  billableMinutes: number;
  billableSeconds: number;
  isFreePhase: boolean;
  hourlyRate: number;
  totalCost: number;
  deviceName: string;
  customerName: string;
  employeeName: string;
  sessionType: string;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

const SESSION_TYPES = [
  { value: 'Single Player', label: 'لاعب واحد' },
  { value: 'Two Players', label: 'لاعبان' },
  { value: 'Three Players', label: 'ثلاثة لاعبين' },
  { value: 'Four Players', label: 'أربعة لاعبين' },
];

export default function PlayStationPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [pricing, setPricing] = useState<any>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Timer states keyed by session ID
  const [timerStates, setTimerStates] = useState<Record<string, TimerState>>({});

  // Open session modal
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openDeviceId, setOpenDeviceId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [sessionType, setSessionType] = useState('Single Player');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [starting, setStarting] = useState(false);

  // End session modal
  const [showEndModal, setShowEndModal] = useState(false);
  const [endSessionId, setEndSessionId] = useState<string | null>(null);
  const [endTimerState, setEndTimerState] = useState<TimerState | null>(null);
  const [closing, setClosing] = useState(false);

  // Payment status
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'UNPAID'>('PAID');
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [closeResult, setCloseResult] = useState<any>(null);

  const syncRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const timerSyncRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      const [dev, pricingData, sessions, staffData] = await Promise.all([
        getPSDevices(),
        getPSPricing(),
        getPSActiveSessions(),
        (await import('@/lib/api')).fetchStaff().catch(() => []),
      ]);
      setDevices(dev);
      setPricing(pricingData);
      setActiveSessions(sessions);
      setStaff(staffData.filter((s: StaffMember) => s.active));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Refresh devices, sessions, staff every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Sync timer states every 10 seconds for active sessions
  const syncTimers = useCallback(async () => {
    if (activeSessions.length === 0) return;
    const results = await Promise.allSettled(
      activeSessions.map(s => getPSTimer(s.id))
    );
    const newStates: Record<string, TimerState> = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        newStates[activeSessions[i].id] = r.value;
      }
    });
    setTimerStates(prev => ({ ...prev, ...newStates }));
  }, [activeSessions]);

  useEffect(() => {
    syncTimers();
    const interval = setInterval(syncTimers, 10000);
    return () => clearInterval(interval);
  }, [syncTimers]);

  // Local timer update every second (visual only, authoritative from backend)
  useEffect(() => {
    if (activeSessions.length === 0) return;
    const interval = setInterval(() => {
      setTimerStates(prev => {
        const updated = { ...prev };
        for (const [sessionId, ts] of Object.entries(prev)) {
          const now = Date.now();
          const serverTime = new Date(ts.serverTime).getTime();
          const elapsed = now - serverTime;

          if (ts.isFreePhase) {
            const freeEnd = new Date(ts.freePeriodEndTime).getTime();
            const remaining = Math.max(0, freeEnd - now);
            updated[sessionId] = {
              ...ts,
              freeRemainingMinutes: Math.floor(remaining / 60000),
              freeRemainingSeconds: Math.floor((remaining % 60000) / 1000),
            };
          } else {
            const billStart = ts.billableStartTime
              ? new Date(ts.billableStartTime).getTime()
              : new Date(ts.freePeriodEndTime).getTime();
            const billMs = Math.max(0, now - billStart);
            const billMin = Math.floor(billMs / 60000);
            const billSec = Math.floor((billMs % 60000) / 1000);
            const cost = (ts.hourlyRate / 60) * (billMin + billSec / 60);
            updated[sessionId] = {
              ...ts,
              billableMinutes: billMin,
              billableSeconds: billSec,
              totalCost: Math.round(cost * 100) / 100,
            };
          }
        }
        return updated;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSessions.length]);

  const handleOpenSession = async () => {
    if (!openDeviceId || !customerName.trim()) return;
    setStarting(true);
    try {
      await startPSSession({
        deviceId: openDeviceId,
        customerName: customerName.trim(),
        sessionType,
        employeeId: selectedEmployeeId || undefined,
      });
      setShowOpenModal(false);
      setOpenDeviceId(null);
      setCustomerName('');
      setSessionType('Single Player');
      setSelectedEmployeeId('');
      await fetchData();
      await syncTimers();
    } catch {
      // silent
    } finally {
      setStarting(false);
    }
  };

  const handleOpenSessionInstant = async (deviceId: string) => {
    setLoading(true);
    try {
      await startPSSession({
        deviceId,
        customerName: 'زبون',
        sessionType: 'Single Player',
      });
      await fetchData();
      await syncTimers();
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleEndSessionClick = async (session: ActiveSession) => {
    setEndSessionId(session.id);
    setShowEndModal(true);
    setPaymentStatus('PAID');
    setCloseResult(null);
    setShowPaymentConfirm(false);
    // Fetch latest timer state
    try {
      const timer = await getPSTimer(session.id);
      setEndTimerState(timer);
    } catch {
      setEndTimerState(null);
    }
  };

  const handleCloseSession = async () => {
    if (!endSessionId) return;
    setClosing(true);
    try {
      const result = await closePSSession(endSessionId, paymentStatus);
      setCloseResult(result);
      setShowPaymentConfirm(true);
      await fetchData();
    } catch {
      // silent
    } finally {
      setClosing(false);
    }
  };

  const getDeviceStatus = (deviceId: string): { session: ActiveSession | null; timer?: TimerState } => {
    const session = activeSessions.find(s => s.deviceId === deviceId) || null;
    const timer = session ? timerStates[session.id] : undefined;
    return { session, timer };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="p-2">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {devices.map(device => {
          const { session, timer } = getDeviceStatus(device.id);
          const isAvailable = !session;

          return (
            <div
              key={device.id}
              className={`rounded-2xl border p-5 transition-all duration-300 ${
                isAvailable
                  ? 'bg-gradient-to-br from-slate-800/50 to-slate-900/50 border-slate-700/50 hover:border-emerald-500/30'
                  : timer?.isFreePhase
                  ? 'bg-gradient-to-br from-amber-900/20 to-amber-800/10 border-amber-600/30'
                  : 'bg-gradient-to-br from-violet-900/20 to-indigo-800/10 border-violet-500/30'
              }`}
            >
              {isAvailable ? (
                /* Available Device */
                <div className="text-center">
                  <div className="text-5xl mb-3 opacity-60">🎮</div>
                  <h4 className="text-lg font-extrabold text-white">{device.name}</h4>
                  <p className="text-xs text-slate-500 mt-1">متاح</p>
                  {device.active ? (
                    <button
                      onClick={() => handleOpenSessionInstant(device.id)}
                      className="mt-4 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold py-3 text-sm transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                    >
                      🕹 افتح وقت
                    </button>
                  ) : (
                    <p className="mt-4 text-xs text-slate-600">الجهاز غير مفعل</p>
                  )}
                </div>
              ) : (
                /* Active Session */
                <div
                  onClick={() => handleEndSessionClick(session!)}
                  className="cursor-pointer active:scale-[0.98] transition-transform"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">🎮</span>
                      <div>
                        <h4 className="text-sm font-extrabold text-white">{device.name}</h4>
                        <p className="text-[10px] text-slate-400">{session!.customerName}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                      timer?.isFreePhase
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                    }`}>
                      {timer?.isFreePhase ? 'مجاني' : 'محسوب'}
                    </span>
                  </div>

                  {/* Timer Display */}
                  {timer && (
                    <div className="text-center py-3">
                      {timer.isFreePhase ? (
                        <div>
                          <p className="text-[10px] text-amber-400 font-bold mb-1">⏳ الوقت المجاني المتبقي</p>
                          <p className="text-3xl font-black font-mono text-amber-400 tabular-nums">
                            {String(timer.freeRemainingMinutes).padStart(2, '0')}:{String(timer.freeRemainingSeconds).padStart(2, '0')}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[10px] text-violet-400 font-bold mb-1">🕒 الوقت المحسوب</p>
                          <p className="text-3xl font-black font-mono text-violet-400 tabular-nums">
                            {String(timer.billableMinutes).padStart(2, '0')}:{String(timer.billableSeconds).padStart(2, '0')}
                          </p>
                          <p className="text-sm font-bold text-emerald-400 mt-1 font-mono">
                            {timer.totalCost.toFixed(2)} ج.م
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Session Info */}
                  <div className="text-[10px] text-slate-500 space-y-0.5 mt-2">
                    <p className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>{session!.openedBy?.name || '—'}</span>
                    </p>
                    <p className="flex items-center gap-1">
                      <Gamepad2 className="h-3 w-3" />
                      <span>{session!.sessionType}</span>
                    </p>
                  </div>

                  {/* Click hint */}
                  <p className="text-[9px] text-slate-600 text-center mt-3">اضغط لإنهاء الجلسة</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* No devices message */}
      {devices.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <p className="text-4xl mb-3">🎮</p>
          <p className="text-sm font-bold">لا توجد أجهزة بلاي ستيشن متاحة</p>
          <p className="text-xs mt-1">يجب على المالك إضافة أجهزة أولاً</p>
        </div>
      )}

      {/* ── OPEN SESSION MODAL ── */}
      {showOpenModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl animate-in zoom-in-95">
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">🎮</div>
              <h3 className="text-xl font-bold text-white">بدء جلسة بلاي ستيشن</h3>
              <p className="text-sm text-slate-400 mt-1">
                {devices.find(d => d.id === openDeviceId)?.name || ''}
              </p>
            </div>
            <div className="space-y-4">
              {/* Customer Name */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">اسم العميل</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="أدخل اسم العميل"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Session Type */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">نوع الجلسة</label>
                <div className="grid grid-cols-2 gap-2">
                  {SESSION_TYPES.map(st => (
                    <button
                      key={st.value}
                      onClick={() => setSessionType(st.value)}
                      className={`py-2.5 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                        sessionType === st.value
                          ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Employee Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">الموظف المسؤول</label>
                <select
                  value={selectedEmployeeId}
                  onChange={e => setSelectedEmployeeId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">اختر الموظف</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowOpenModal(false);
                    setOpenDeviceId(null);
                    setCustomerName('');
                  }}
                  className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 py-3.5 text-sm font-bold text-slate-300 transition-all active:scale-95"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleOpenSession}
                  disabled={!customerName.trim() || starting}
                  className="flex-[2] rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 py-3.5 text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                >
                  {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  <span>بدء الجلسة</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── END SESSION MODAL ── */}
      {showEndModal && !showPaymentConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl animate-in zoom-in-95">
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">🎮</div>
              <h3 className="text-xl font-bold text-white">إنهاء الجلسة</h3>
            </div>

            {endTimerState ? (
              <div className="space-y-4">
                {/* Session Summary */}
                <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4 space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">الجهاز:</span>
                    <span className="text-white font-bold">{endTimerState.deviceName}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">العميل:</span>
                    <span className="text-white font-bold">{endTimerState.customerName}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">الموظف:</span>
                    <span className="text-white font-bold">{endTimerState.employeeName}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">النوع:</span>
                    <span className="text-white font-bold">{endTimerState.sessionType}</span>
                  </div>
                  <div className="border-t border-slate-800 pt-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">الوقت المحسوب:</span>
                      <span className="text-violet-400 font-bold font-mono">
                        {String(endTimerState.billableMinutes).padStart(2, '0')} دقيقة
                      </span>
                    </div>
                    <div className="flex justify-between text-lg mt-2">
                      <span className="text-slate-300 font-bold">الإجمالي:</span>
                      <span className="text-emerald-400 font-black font-mono drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">
                        {endTimerState.totalCost.toFixed(2)} ج.م
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment Status */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2">حالة الدفع</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setPaymentStatus('PAID')}
                      className={`flex items-center justify-center gap-2 rounded-xl border py-3.5 text-sm font-bold transition-all active:scale-95 ${
                        paymentStatus === 'PAID'
                          ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      <CheckCircle2 className="h-5 w-5" />
                      <span>مدفوع</span>
                    </button>
                    <button
                      onClick={() => setPaymentStatus('UNPAID')}
                      className={`flex items-center justify-center gap-2 rounded-xl border py-3.5 text-sm font-bold transition-all active:scale-95 ${
                        paymentStatus === 'UNPAID'
                          ? 'bg-red-600/20 text-red-400 border-red-500'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      <XCircle className="h-5 w-5" />
                      <span>غير مدفوع</span>
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowEndModal(false);
                      setEndSessionId(null);
                      setEndTimerState(null);
                    }}
                    className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 py-3.5 text-sm font-bold text-slate-300 transition-all active:scale-95"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={handleCloseSession}
                    disabled={closing}
                    className="flex-[2] rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 py-3.5 text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-rose-500/20 flex items-center justify-center gap-2"
                  >
                    {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    <span>إنهاء الجلسة</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PAYMENT CONFIRMATION ── */}
      {showPaymentConfirm && closeResult && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl animate-in zoom-in-95">
            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border mb-6 ${
              paymentStatus === 'PAID'
                ? 'bg-emerald-950 border-emerald-500 text-emerald-400'
                : 'bg-amber-950 border-amber-500 text-amber-400'
            }`}>
              {paymentStatus === 'PAID' ? <CheckCircle2 className="h-10 w-10" /> : <XCircle className="h-10 w-10" />}
            </div>
            <h3 className="text-xl font-bold text-white text-center mb-4">تم إنهاء الجلسة</h3>
            <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4 space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">الجهاز:</span>
                <span className="text-white font-bold">{closeResult.device?.name || endTimerState?.deviceName || '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">العميل:</span>
                <span className="text-white font-bold">{endTimerState?.customerName || '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">المدة:</span>
                <span className="text-white font-bold">{closeResult.duration || 0} دقيقة</span>
              </div>
              <div className="border-t border-slate-800 pt-3">
                <div className="flex justify-between text-lg">
                  <span className="text-slate-300 font-bold">التكلفة:</span>
                  <span className="text-emerald-400 font-black font-mono">{Number(closeResult.cost || 0).toFixed(2)} ج.م</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-slate-400">حالة الدفع:</span>
                  <span className={`font-bold ${closeResult.paymentStatus === 'PAID' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {closeResult.paymentStatus === 'PAID' ? 'مدفوع' : 'غير مدفوع'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-6">
              <button
                onClick={() => {
                  setShowEndModal(false);
                  setShowPaymentConfirm(false);
                  setEndSessionId(null);
                  setEndTimerState(null);
                  setCloseResult(null);
                }}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 py-3.5 text-sm font-bold text-white transition-all active:scale-95"
              >
                تم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

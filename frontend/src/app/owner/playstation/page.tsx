'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { useAppStore } from '@/store';
import api from '@/lib/api';
import { PlayStationCard } from '@/components/playstation/PlayStationCard';
import { Plus, Gamepad2, Settings, Loader2, Sparkles, RefreshCw, X, CheckCircle, HelpCircle, DollarSign, Trophy } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

export default function PlayStationOwnerPage() {
  useSocket('/owner');
  const [activeTab, setActiveTab] = useState<'sessions' | 'pricing' | 'history' | 'kpi'>('sessions');

  // Pricing configuration
  const [pricing, setPricing] = useState({
    singlePlayerHourlyPrice: 20,
    twoPlayersHourlyPrice: 30,
    threePlayersHourlyPrice: 40,
    fourPlayersHourlyPrice: 50,
  });
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingActionLoading, setPricingActionLoading] = useState(false);

  // Devices & Active sessions
  const [devices, setDevices] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [unpaidSessions, setUnpaidSessions] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesActionLoading, setDevicesActionLoading] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deviceNameInput, setDeviceNameInput] = useState('');

  const [editingDevice, setEditingDevice] = useState<any | null>(null);
  const [editDeviceNameInput, setEditDeviceNameInput] = useState('');

  const [openSessionDeviceId, setOpenSessionDeviceId] = useState<string | null>(null);
  const [sessionCustomerName, setSessionCustomerName] = useState('');
  const [sessionType, setSessionType] = useState('Single Player');

  const [closingSession, setClosingSession] = useState<any | null>(null);
  const [closingDuration, setClosingDuration] = useState(0);
  const [closingCost, setClosingCost] = useState(0);
  const [closingIsPaid, setClosingIsPaid] = useState(true);

  // History & KPI reports
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [kpiData, setKpiData] = useState<any[]>([]);
  const [kpiLoading, setKpiLoading] = useState(false);

  // KPI Aggregations and Filters
  const [employees, setEmployees] = useState<any[]>([]);
  const [kpiFilters, setKpiFilters] = useState({
    employeeId: '',
    deviceId: '',
    dateFrom: '',
    dateTo: '',
  });
  const [kpiAggregations, setKpiAggregations] = useState<any>(null);
  const [kpiAggregationsLoading, setKpiAggregationsLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Data Loading
  const loadPricing = useCallback(async () => {
    try {
      const { data } = await api.get('/playstation/pricing');
      if (data) {
        setPricing({
          singlePlayerHourlyPrice: Number(data.singlePlayerHourlyPrice),
          twoPlayersHourlyPrice: Number(data.twoPlayersHourlyPrice),
          threePlayersHourlyPrice: Number(data.threePlayersHourlyPrice),
          fourPlayersHourlyPrice: Number(data.fourPlayersHourlyPrice),
        });
      }
    } catch {
      setError('خطأ في تحميل إعدادات الأسعار');
    } finally {
      setPricingLoading(false);
    }
  }, []);

  const loadDevicesAndSessions = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const [devsRes, sessRes, historyRes] = await Promise.all([
        api.get('/playstation/devices'),
        api.get('/playstation/sessions/active'),
        api.get('/playstation/sessions/history'),
      ]);
      setDevices(Array.isArray(devsRes.data) ? devsRes.data : []);
      setActiveSessions(Array.isArray(sessRes.data) ? sessRes.data : []);
      const allCompleted = Array.isArray(historyRes.data) ? historyRes.data : [];
      setUnpaidSessions(allCompleted.filter((s: any) => s.paymentStatus === 'UNPAID'));
    } catch (err: any) {
      setError('خطأ في تحميل أجهزة الـ PlayStation والجلسات');
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const { data } = await api.get(`/playstation/sessions/history?${params}`);
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      setError('خطأ في تحميل سجل اللعب');
    } finally {
      setHistoryLoading(false);
    }
  }, [dateFrom, dateTo]);

  const loadEmployees = useCallback(async () => {
    try {
      const { data } = await api.get('/staff');
      setEmployees(Array.isArray(data) ? data : []);
    } catch {
      setError('خطأ في تحميل قائمة الموظفين');
    }
  }, []);

  const loadKpiAggregations = useCallback(async () => {
    setKpiAggregationsLoading(true);
    try {
      const params = new URLSearchParams();
      if (kpiFilters.employeeId) params.set('employeeId', kpiFilters.employeeId);
      if (kpiFilters.deviceId) params.set('deviceId', kpiFilters.deviceId);
      if (kpiFilters.dateFrom) params.set('dateFrom', kpiFilters.dateFrom);
      if (kpiFilters.dateTo) params.set('dateTo', kpiFilters.dateTo);

      const { data } = await api.get(`/playstation/reports/kpi-aggregations?${params}`);
      setKpiAggregations(data);
    } catch {
      setError('خطأ في تحميل تقرير الأداء المجمع');
    } finally {
      setKpiAggregationsLoading(false);
    }
  }, [kpiFilters]);

  useEffect(() => {
    loadPricing();
    loadDevicesAndSessions();
  }, [loadPricing, loadDevicesAndSessions]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    } else if (activeTab === 'kpi') {
      loadEmployees();
      loadKpiAggregations();
    }
  }, [activeTab, loadHistory, loadEmployees, loadKpiAggregations]);

  // Pricing Actions
  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setPricingActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await api.put('/playstation/pricing', pricing);
      setSuccessMsg('تم حفظ وتعديل أسعار اللعب بنجاح!');
    } catch (err: any) {
      setError(err.response?.data?.message || 'فشل حفظ الأسعار');
    } finally {
      setPricingActionLoading(false);
    }
  };

  // Device CRUD Actions
  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceNameInput.trim()) return;
    setDevicesActionLoading(true);
    setError(null);
    try {
      await api.post('/playstation/devices', { name: deviceNameInput.trim() });
      setDeviceNameInput('');
      setShowCreateModal(false);
      await loadDevicesAndSessions();
    } catch (err: any) {
      setError(err.response?.data?.message || 'فشل إضافة الجهاز الجديد');
    } finally {
      setDevicesActionLoading(false);
    }
  };

  const handleUpdateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice || !editDeviceNameInput.trim()) return;
    setDevicesActionLoading(true);
    setError(null);
    try {
      await api.patch(`/playstation/devices/${editingDevice.id}`, { name: editDeviceNameInput.trim() });
      setEditingDevice(null);
      await loadDevicesAndSessions();
    } catch (err: any) {
      setError(err.response?.data?.message || 'فشل تعديل اسم الجهاز');
    } finally {
      setDevicesActionLoading(false);
    }
  };

  const handleToggleDevice = async (device: any) => {
    setError(null);
    try {
      await api.patch(`/playstation/devices/${device.id}`, { active: !device.active });
      await loadDevicesAndSessions();
    } catch (err: any) {
      setError(err.response?.data?.message || 'فشل تفعيل/تعطيل الجهاز');
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا الجهاز نهائياً؟')) return;
    setError(null);
    try {
      await api.delete(`/playstation/devices/${deviceId}`);
      await loadDevicesAndSessions();
    } catch (err: any) {
      setError(err.response?.data?.message || 'فشل حذف الجهاز');
    }
  };

  // Session Actions
  const handleOpenSession = async (deviceId: string) => {
    setDevicesActionLoading(true);
    setError(null);
    try {
      await api.post('/playstation/sessions', {
        deviceId,
        customerName: 'زبون',
        sessionType: 'Single Player',
      });
      await loadDevicesAndSessions();
    } catch (err: any) {
      setError(err.response?.data?.message || 'فشل فتح الجلسة للجهاز');
    } finally {
      setDevicesActionLoading(false);
    }
  };

  const handleCollectPayment = async (sessionId: string) => {
    setDevicesActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await api.patch(`/playstation/sessions/${sessionId}/collect`);
      setSuccessMsg('تم تحصيل قيمة الجلسة بنجاح وضمه لمحفظتك!');
      await loadDevicesAndSessions();
      if (activeTab === 'history') {
        loadHistory();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'فشل تحصيل المبلغ');
    } finally {
      setDevicesActionLoading(false);
    }
  };

  const handleConfirmCloseSession = async () => {
    if (!closingSession) return;
    setDevicesActionLoading(true);
    setError(null);
    try {
      await api.patch(`/playstation/sessions/${closingSession.id}/close`, {
        paymentStatus: closingIsPaid ? 'PAID' : 'UNPAID',
      });
      setClosingSession(null);
      await loadDevicesAndSessions();
    } catch (err: any) {
      setError(err.response?.data?.message || 'فشل إغلاق وقت الجلسة');
    } finally {
      setDevicesActionLoading(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Gamepad2 className="h-6 w-6 text-violet-600" />
            <span>نظام إدارة أجهزة الـ PlayStation</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">تتبع الجلسات المفتوحة، والمبالغ المستحقة بالدقيقة، مع تفعيل 10 دقائق مجانية لكل زبون.</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'sessions' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-750 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-violet-600/10 transition-all active:scale-[0.98] cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>إضافة جهاز جديد</span>
            </button>
          )}
          <button
            onClick={() => loadDevicesAndSessions()}
            className="rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50 text-slate-600 transition-colors"
            title="تحديث البيانات"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('sessions')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'sessions'
              ? 'border-violet-600 text-violet-600'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          🎮 الأجهزة وجلسات اللعب
        </button>
        <button
          onClick={() => setActiveTab('pricing')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'pricing'
              ? 'border-violet-600 text-violet-600'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          ⚙ إعدادات أسعار الساعة
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'history'
              ? 'border-violet-600 text-violet-600'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          📋 سجل اللعب والأرباح
        </button>
        <button
          onClick={() => setActiveTab('kpi')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'kpi'
              ? 'border-violet-600 text-violet-600'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          🏆 أداء الموظفين (KPI)
        </button>
      </div>

      {/* TAB 1: SESSIONS & DEVICES */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          {devicesLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-24 border border-dashed border-slate-200 rounded-3xl bg-white">
              <Gamepad2 className="h-16 w-16 text-slate-200 mx-auto mb-4" />
              <h3 className="font-bold text-slate-800">لا توجد أجهزة PlayStation مضافة</h3>
              <p className="text-xs text-slate-400 mt-1">انقر على زر "إضافة جهاز جديد" في الأعلى للبدء.</p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {devices.map((device) => {
                const session = activeSessions.find((s) => s.deviceId === device.id) || null;
                return (
                  <PlayStationCard
                    key={device.id}
                    device={device}
                    activeSession={session}
                    pricing={pricing}
                    role="owner"
                    onOpenSession={(id) => handleOpenSession(id)}
                    onCloseSession={(s, dur, c) => {
                      setClosingSession(s);
                      setClosingDuration(dur);
                      setClosingCost(c);
                      setClosingIsPaid(true);
                    }}
                    onEditDevice={(dev) => {
                      setEditingDevice(dev);
                      setEditDeviceNameInput(dev.name);
                    }}
                    onToggleDevice={(dev) => handleToggleDevice(dev)}
                    onDeleteDevice={(id) => handleDeleteDevice(id)}
                  />
                );
              })}
            </div>
          )}

            {/* Unpaid Completed Sessions List */}
            {unpaidSessions.length > 0 && (
              <div className="rounded-3xl border border-red-200/50 bg-red-50/10 p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-red-150 pb-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                  <h3 className="font-extrabold text-slate-800 text-sm">⚠️ فواتير PlayStation معلقة بانتظار التحصيل</h3>
                </div>
                
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {unpaidSessions.map((session) => (
                    <div key={session.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800 text-xs">{session.device?.name || 'جهاز'}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{new Date(session.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-right text-[11px] text-slate-500">
                          <div>
                            <span className="block text-slate-400 text-[10px]">العميل</span>
                            <span className="font-semibold text-slate-700">{session.customerName}</span>
                          </div>
                          <div>
                            <span className="block text-slate-400 text-[10px]">نوع اللعب</span>
                            <span className="font-semibold text-amber-600">{session.sessionType}</span>
                          </div>
                          <div>
                            <span className="block text-slate-400 text-[10px]">المدة</span>
                            <span className="font-semibold text-violet-600">{session.duration} دقيقة</span>
                          </div>
                          <div>
                            <span className="block text-slate-400 text-[10px]">المبلغ المستحق</span>
                            <span className="font-extrabold text-emerald-600 font-mono">{Number(session.cost || 0).toFixed(2)} ج.م</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCollectPayment(session.id)}
                        disabled={devicesActionLoading}
                        className="w-full mt-4 rounded-xl bg-emerald-600 hover:bg-emerald-750 text-white font-bold text-xs py-2 shadow-sm transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>تحصيل للمحفظة</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      {/* TAB 2: PRICING CONFIGURATION (OWNER-ONLY SETTINGS) */}
      {activeTab === 'pricing' && (
        <div className="max-w-xl mx-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-6">
            <DollarSign className="h-5 w-5 text-violet-600" />
            <div>
              <h3 className="font-black text-slate-800 text-sm">تكوين أسعار اللعب لكل ساعة</h3>
              <p className="text-[10px] text-slate-400">حدد أسعار الساعة المقابلة لعدد اللاعبين (يقوم النظام بالتقسيم والحساب بالدقيقة تلقائياً).</p>
            </div>
          </div>

          {pricingLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
            </div>
          ) : (
            <form onSubmit={handleSavePricing} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">سعر ساعة اللعب الفردي (Single Player)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={pricing.singlePlayerHourlyPrice}
                    onChange={(e) => setPricing({ ...pricing, singlePlayerHourlyPrice: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:border-violet-500 focus:outline-none"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">EGP / ساعة</span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">سعر ساعة اللعب الزوجي (Two Players)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={pricing.twoPlayersHourlyPrice}
                    onChange={(e) => setPricing({ ...pricing, twoPlayersHourlyPrice: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:border-violet-500 focus:outline-none"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">EGP / ساعة</span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">سعر ساعة اللعب الثلاثي (Three Players)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={pricing.threePlayersHourlyPrice}
                    onChange={(e) => setPricing({ ...pricing, threePlayersHourlyPrice: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:border-violet-500 focus:outline-none"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">EGP / ساعة</span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">سعر ساعة اللعب الرباعي (Four Players)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={pricing.fourPlayersHourlyPrice}
                    onChange={(e) => setPricing({ ...pricing, fourPlayersHourlyPrice: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:border-violet-500 focus:outline-none"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">EGP / ساعة</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={pricingActionLoading}
                className="w-full rounded-xl bg-violet-600 hover:bg-violet-750 text-white font-bold text-sm py-3 transition-all active:scale-[0.98] cursor-pointer mt-4 flex items-center justify-center gap-2"
              >
                {pricingActionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>حفظ التعديلات والتسعيرة</span>
              </button>
            </form>
          )}
        </div>
      )}

      {/* TAB 3: PLAY HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* History Filters */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex-1 min-w-[150px]">
              <label className="mb-1 block text-[10px] font-medium text-gray-500">من تاريخ</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-lg border px-3 py-1.5 text-xs text-gray-800"
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="mb-1 block text-[10px] font-medium text-gray-500">إلى تاريخ</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-lg border px-3 py-1.5 text-xs text-gray-800"
              />
            </div>
            <div className="flex items-end self-end">
              <button
                onClick={loadHistory}
                disabled={historyLoading}
                className="rounded-lg bg-violet-600 hover:bg-violet-750 px-5 py-2 text-xs font-bold text-white transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {historyLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                <span>تصفية السجلات</span>
              </button>
            </div>
          </div>

          {/* History Table */}
          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center text-gray-400 border border-dashed rounded-xl bg-white">لا توجد سجلات مطابقة</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-slate-500 text-xs font-bold">
                    <th className="px-4 py-3 text-right">الجهاز</th>
                    <th className="px-4 py-3 text-right">العميل</th>
                    <th className="px-4 py-3 text-right">النوع</th>
                    <th className="px-4 py-3 text-right">وقت البدء</th>
                    <th className="px-4 py-3 text-right">وقت النهاية</th>
                    <th className="px-4 py-3 text-right">المدة (دقيقة)</th>
                    <th className="px-4 py-3 text-right">التكلفة</th>
                    <th className="px-4 py-3 text-right">حالة الدفع</th>
                    <th className="px-4 py-3 text-right">الموظف المسؤول</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b last:border-0 hover:bg-gray-50 text-xs text-slate-700">
                      <td className="px-4 py-3 font-bold text-slate-800">{h.device?.name}</td>
                      <td className="px-4 py-3">{h.customerName}</td>
                      <td className="px-4 py-3 text-amber-600 font-semibold">{h.sessionType}</td>
                      <td className="px-4 py-3 font-mono">{new Date(h.startTime).toLocaleTimeString()}</td>
                      <td className="px-4 py-3 font-mono">{h.endTime ? new Date(h.endTime).toLocaleTimeString() : '—'}</td>
                      <td className="px-4 py-3 font-mono">{h.duration ?? '—'} دقيقة</td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-600">{Number(h.cost || 0).toFixed(2)} EGP</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            h.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {h.paymentStatus === 'PAID' ? 'مدفوع' : 'غير مدفوع'}
                          </span>
                          {h.paymentStatus === 'UNPAID' && (
                            <button
                              onClick={() => handleCollectPayment(h.id)}
                              disabled={devicesActionLoading}
                              className="rounded bg-emerald-600 hover:bg-emerald-750 text-white font-bold text-[10px] px-2 py-1 transition-all active:scale-[0.95] cursor-pointer"
                            >
                              تحصيل
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{h.openedBy?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: EMPLOYEE KPI */}
      {activeTab === 'kpi' && (
        <div className="space-y-6">
          {/* KPI Dashboard Filters */}
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs font-bold text-slate-600">تصفية حسب الموظف</label>
              <select
                value={kpiFilters.employeeId}
                onChange={(e) => setKpiFilters({ ...kpiFilters, employeeId: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-violet-500 focus:outline-none cursor-pointer"
              >
                <option value="">كل الموظفين (All Employees)</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs font-bold text-slate-600">تصفية حسب الجهاز</label>
              <select
                value={kpiFilters.deviceId}
                onChange={(e) => setKpiFilters({ ...kpiFilters, deviceId: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-violet-500 focus:outline-none cursor-pointer"
              >
                <option value="">كل الأجهزة (All Devices)</option>
                {devices.map((dev) => (
                  <option key={dev.id} value={dev.id}>{dev.name}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[150px]">
              <label className="mb-1 block text-xs font-bold text-slate-600">من تاريخ</label>
              <input
                type="date"
                value={kpiFilters.dateFrom}
                onChange={(e) => setKpiFilters({ ...kpiFilters, dateFrom: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div className="flex-1 min-w-[150px]">
              <label className="mb-1 block text-xs font-bold text-slate-600">إلى تاريخ</label>
              <input
                type="date"
                value={kpiFilters.dateTo}
                onChange={(e) => setKpiFilters({ ...kpiFilters, dateTo: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div className="flex items-end self-end">
              <button
                onClick={loadKpiAggregations}
                disabled={kpiAggregationsLoading}
                className="rounded-xl bg-violet-600 hover:bg-violet-750 px-6 py-2.5 text-xs font-bold text-white transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-lg shadow-violet-600/10"
              >
                {kpiAggregationsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>تحديث البيانات المجمعة</span>
              </button>
            </div>
          </div>

          {/* KPI Dashboard Aggregations */}
          {kpiAggregationsLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
            </div>
          ) : !kpiAggregations ? (
            <div className="text-center py-24 border border-dashed border-slate-200 rounded-3xl bg-white text-slate-400">
              لا توجد بيانات للأداء بعد
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Stats Cards */}
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                <div className="rounded-2xl border bg-white p-5 shadow-sm">
                  <span className="text-[10px] text-slate-500 block font-bold mb-1">إجمالي جلسات اللعب</span>
                  <span className="text-2xl font-black text-slate-800 font-mono">
                    {kpiAggregations.paymentBreakdown.paidCount + kpiAggregations.paymentBreakdown.unpaidCount}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-1">جلسة لعب مكتملة ومغلقة</span>
                </div>

                <div className="rounded-2xl border bg-white p-5 shadow-sm">
                  <span className="text-[10px] text-slate-500 block font-bold mb-1">إجمالي الإيرادات المولدة</span>
                  <span className="text-2xl font-black text-emerald-600 font-mono">
                    {formatCurrency(kpiAggregations.paymentBreakdown.paidRevenue + kpiAggregations.paymentBreakdown.unpaidRevenue)}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    شاملة الإيرادات المحصلة وغير المحصلة
                  </span>
                </div>

                <div className="rounded-2xl border bg-white p-5 shadow-sm">
                  <span className="text-[10px] text-slate-500 block font-bold mb-1">متوسط مدة الجلسة</span>
                  <span className="text-2xl font-black text-violet-600 font-mono">
                    {kpiAggregations.averageDuration}
                  </span>
                  <span className="text-[10px] text-slate-400 inline-block mr-1">دقيقة لكل جلسة</span>
                </div>
              </div>

              {/* Aggregation Detail Cards */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Sessions per employee */}
                <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
                  <h3 className="font-extrabold text-slate-800 text-xs border-b pb-2">عدد الجلسات لكل موظف</h3>
                  {kpiAggregations.sessionsPerEmployee.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">لا توجد بيانات جلسات للموظفين</p>
                  ) : (
                    <div className="space-y-3">
                      {kpiAggregations.sessionsPerEmployee.map((item: any) => (
                        <div key={item.employeeId} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-bold text-slate-700">{item.employeeName}</span>
                            <span className="font-mono text-slate-500">{item.count} جلسة</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-violet-600 h-full rounded-full"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (item.count /
                                    Math.max(
                                      1,
                                      ...kpiAggregations.sessionsPerEmployee.map((e: any) => e.count)
                                    )) *
                                    100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Revenue per employee */}
                <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
                  <h3 className="font-extrabold text-slate-800 text-xs border-b pb-2">الإيرادات المولدة لكل موظف</h3>
                  {kpiAggregations.revenuePerEmployee.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">لا توجد إيرادات مسجلة للموظفين</p>
                  ) : (
                    <div className="space-y-3">
                      {kpiAggregations.revenuePerEmployee.map((item: any) => (
                        <div key={item.employeeId} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-bold text-slate-700">{item.employeeName}</span>
                            <span className="font-mono font-bold text-emerald-600">{formatCurrency(item.revenue)}</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-50 h-full rounded-full"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (item.revenue /
                                    Math.max(
                                      1,
                                      ...kpiAggregations.revenuePerEmployee.map((e: any) => e.revenue)
                                    )) *
                                    100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Paid vs Unpaid Breakdown */}
                <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4 md:col-span-2">
                  <h3 className="font-extrabold text-slate-800 text-xs border-b pb-2">تفاصيل الفواتير (مدفوع / غير مدفوع)</h3>
                  <div className="grid gap-6 sm:grid-cols-2">
                    {/* Paid Cards */}
                    <div className="rounded-xl bg-emerald-50/50 border border-emerald-100 p-4 space-y-2">
                      <span className="text-[10px] font-bold text-emerald-700 block">الجلسات المدفوعة (Paid Sessions)</span>
                      <div className="flex justify-between items-end">
                        <div>
                          <span className="text-2xl font-black text-emerald-800 font-mono">
                            {kpiAggregations.paymentBreakdown.paidCount}
                          </span>
                          <span className="text-[10px] text-emerald-600 block">جلسة تم تحصيلها</span>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-black text-emerald-700 font-mono block">
                            {formatCurrency(kpiAggregations.paymentBreakdown.paidRevenue)}
                          </span>
                          <span className="text-[10px] text-emerald-600">إجمالي القيمة المحصلة</span>
                        </div>
                      </div>
                    </div>

                    {/* Unpaid Cards */}
                    <div className="rounded-xl bg-red-50/50 border border-red-100 p-4 space-y-2">
                      <span className="text-[10px] font-bold text-red-700 block">الجلسات غير المدفوعة (Unpaid Sessions)</span>
                      <div className="flex justify-between items-end">
                        <div>
                          <span className="text-2xl font-black text-red-800 font-mono">
                            {kpiAggregations.paymentBreakdown.unpaidCount}
                          </span>
                          <span className="text-[10px] text-red-600 block">جلسة معلقة الدفع</span>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-black text-red-700 font-mono block">
                            {formatCurrency(kpiAggregations.paymentBreakdown.unpaidRevenue)}
                          </span>
                          <span className="text-[10px] text-red-600">إجمالي المبالغ المستحقة</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE DEVICE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-850 p-6 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-850 pb-3 mb-4">
              <h3 className="font-bold text-white text-sm">إضافة جهاز PlayStation جديد</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateDevice} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">اسم الجهاز</label>
                <input
                  type="text"
                  placeholder="مثال: PS Device 3"
                  required
                  value={deviceNameInput}
                  onChange={(e) => setDeviceNameInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:border-violet-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  disabled={devicesActionLoading}
                  className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-750 text-white font-bold text-xs py-3 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {devicesActionLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>حفظ وإضافة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs py-3 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT DEVICE MODAL */}
      {editingDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-850 p-6 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-850 pb-3 mb-4">
              <h3 className="font-bold text-white text-sm">تعديل اسم الجهاز</h3>
              <button onClick={() => setEditingDevice(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateDevice} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">الاسم الجديد</label>
                <input
                  type="text"
                  required
                  value={editDeviceNameInput}
                  onChange={(e) => setEditDeviceNameInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs text-white focus:border-violet-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  disabled={devicesActionLoading}
                  className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-750 text-white font-bold text-xs py-3 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {devicesActionLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>حفظ التعديل</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingDevice(null)}
                  className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs py-3 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* START SESSION MODAL REMOVED FOR AUTOMATIC PLAY SESSION INITIATION */}

      {/* END SESSION (CLOSING) MODAL */}
      {closingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-850 p-6 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-850 pb-3 mb-4">
              <h3 className="font-bold text-white text-sm">فاتورة إنهاء وقت اللعب</h3>
              <button onClick={() => setClosingSession(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl bg-slate-950 p-4 border border-slate-850 space-y-3 text-xs text-slate-300">
                <div className="flex justify-between">
                  <span>اسم الجهاز:</span>
                  <span className="text-white font-bold">{closingSession.device?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>الزبون:</span>
                  <span className="text-white font-bold">{closingSession.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span>نوع الجلسة:</span>
                  <span className="text-white font-bold">{closingSession.sessionType}</span>
                </div>
                <div className="flex justify-between">
                  <span>وقت البدء:</span>
                  <span className="text-white font-mono">{new Date(closingSession.startTime).toLocaleTimeString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>المسؤول (الباريستا):</span>
                  <span className="text-white font-bold">{closingSession.openedBy?.name || '—'}</span>
                </div>
                <div className="flex justify-between border-t border-slate-900 pt-2 text-violet-400 font-semibold">
                  <span>مدة اللعب الكلية:</span>
                  <span className="font-mono">{closingDuration} دقيقة</span>
                </div>
                {closingDuration <= 10 ? (
                  <div className="bg-emerald-950/20 text-emerald-400 border border-emerald-900/50 p-2 rounded-lg text-center font-bold">
                    جلسة لعب مجانية (أقل من 10 دقائق)
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-500">
                    * تم خصم 10 دقائق مجانية من الفاتورة الإجمالية.
                  </div>
                )}
              </div>

              {/* Total Due */}
              <div className="flex items-center justify-between bg-slate-950/50 rounded-xl p-4 border border-slate-850">
                <span className="text-xs font-bold text-slate-300">المبلغ الإجمالي المستحق:</span>
                <span className="text-xl font-black text-emerald-400 font-mono">
                  {closingCost.toFixed(2)} EGP
                </span>
              </div>

              {/* Payment status options */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-300 block">حالة الدفع (Payment Status)</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setClosingIsPaid(true)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                      closingIsPaid
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                        : 'bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    🟢 مدفوع (Paid)
                  </button>
                  <button
                    type="button"
                    onClick={() => setClosingIsPaid(false)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                      !closingIsPaid
                        ? 'bg-red-500/10 border-red-500 text-red-400'
                        : 'bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    🔴 غير مدفوع (Not Paid)
                  </button>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={handleConfirmCloseSession}
                  disabled={devicesActionLoading}
                  className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-750 text-white font-bold text-xs py-3 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {devicesActionLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>حفظ وإغلاق الجلسة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setClosingSession(null)}
                  className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs py-3 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert Banners */}
      {error && (
        <div className="fixed bottom-4 right-4 max-w-sm p-4 rounded-xl bg-red-950/40 border border-red-900/60 text-red-400 text-xs font-semibold flex justify-between items-center gap-4 z-50">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="fixed bottom-4 right-4 max-w-sm p-4 rounded-xl bg-emerald-950/40 border border-emerald-900/60 text-emerald-400 text-xs font-semibold flex justify-between items-center gap-4 z-50">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

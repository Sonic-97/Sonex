'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import api from '@/lib/api';
import { PlayStationCard, Device, Session } from '@/components/playstation/PlayStationCard';
import {
  Plus,
  Gamepad2,
  Settings,
  Loader2,
  Sparkles,
  RefreshCw,
  X,
  CheckCircle,
  HelpCircle,
  DollarSign,
  Trophy,
  Coffee,
  ArrowRightLeft,
  Crown,
  QrCode,
  Users,
  Coins,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function PlayStationOwnerPage() {
  useSocket('/owner');
  const [activeTab, setActiveTab] = useState<'sessions' | 'pricing' | 'history' | 'kpi'>('sessions');

  // Pricing configuration
  const [pricing, setPricing] = useState({
    singlePlayerHourlyPrice: 25,
    twoPlayersHourlyPrice: 35,
    threePlayersHourlyPrice: 45,
    fourPlayersHourlyPrice: 55,
  });
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingActionLoading, setPricingActionLoading] = useState(false);

  // Devices & Active sessions
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [unpaidSessions, setUnpaidSessions] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesActionLoading, setDevicesActionLoading] = useState(false);

  // Product Catalog for adding drinks
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deviceForm, setDeviceForm] = useState({
    name: '',
    deviceType: 'PS5',
    hourlyRate: '',
    multiHourlyRate: '',
    notes: '',
  });

  const [editingDevice, setEditingDevice] = useState<Device | null>(null);

  const [openSessionDeviceId, setOpenSessionDeviceId] = useState<string | null>(null);
  const [sessionCustomerName, setSessionCustomerName] = useState('');
  const [sessionType, setSessionType] = useState('Single Player');
  const [sessionTargetMinutes, setSessionTargetMinutes] = useState('');

  // Add Order to Session Modal
  const [orderingSession, setOrderingSession] = useState<Session | null>(null);
  const [orderingDevice, setOrderingDevice] = useState<Device | null>(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState<{ [productId: string]: number }>({});
  const [orderNotes, setOrderNotes] = useState('');

  // Transfer Session Modal
  const [transferringSession, setTransferringSession] = useState<Session | null>(null);
  const [transferringDevice, setTransferringDevice] = useState<Device | null>(null);
  const [targetDeviceId, setTargetDeviceId] = useState('');

  // Unified Settlement Modal
  const [settlingSession, setSettlingSession] = useState<Session | null>(null);
  const [settlementDetails, setSettlementDetails] = useState<any | null>(null);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settlePaymentMethod, setSettlePaymentMethod] = useState<'CASH' | 'INSTAPAY' | 'VODAFONE_CASH'>('CASH');
  const [splitCount, setSplitCount] = useState<number>(1);
  const [discountAmount, setDiscountAmount] = useState<string>('0');

  // History & KPI reports
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [kpiFilters, setKpiFilters] = useState({
    employeeId: '',
    deviceId: '',
    dateFrom: '',
    dateTo: '',
  });
  const [kpiAggregations, setKpiAggregations] = useState<any>(null);
  const [kpiAggregationsLoading, setKpiAggregationsLoading] = useState(false);

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
      toast.error('خطأ في تحميل إعدادات الأسعار');
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
    } catch {
      toast.error('خطأ في تحميل الأجهزة والجلسات');
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    if (products.length > 0) return;
    try {
      setProductsLoading(true);
      const res = await api.get('/products');
      setProducts(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error('تعذر جلب منيو الكافيه');
    } finally {
      setProductsLoading(false);
    }
  }, [products.length]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const { data } = await api.get(`/playstation/sessions/history?${params}`);
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      toast.error('خطأ في تحميل سجل اللعب');
    } finally {
      setHistoryLoading(false);
    }
  }, [dateFrom, dateTo]);

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
      toast.error('خطأ في تحميل تقرير الأداء المجمع');
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
      loadKpiAggregations();
    }
  }, [activeTab, loadHistory, loadKpiAggregations]);

  // Pricing Actions
  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setPricingActionLoading(true);
    try {
      await api.put('/playstation/pricing', pricing);
      toast.success('تم حفظ وتعديل أسعار اللعب بنجاح!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل حفظ الأسعار');
    } finally {
      setPricingActionLoading(false);
    }
  };

  // Device Actions
  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceForm.name.trim()) return;
    setDevicesActionLoading(true);
    try {
      await api.post('/playstation/devices', {
        name: deviceForm.name.trim(),
        deviceType: deviceForm.deviceType,
        hourlyRate: deviceForm.hourlyRate ? parseFloat(deviceForm.hourlyRate) : undefined,
        multiHourlyRate: deviceForm.multiHourlyRate ? parseFloat(deviceForm.multiHourlyRate) : undefined,
        notes: deviceForm.notes.trim() || undefined,
      });
      toast.success('تمت إضافة الجهاز/الغرفة بنجاح!');
      setShowCreateModal(false);
      setDeviceForm({ name: '', deviceType: 'PS5', hourlyRate: '', multiHourlyRate: '', notes: '' });
      await loadDevicesAndSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل إضافة الجهاز');
    } finally {
      setDevicesActionLoading(false);
    }
  };

  const handleUpdateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice || !editingDevice.name.trim()) return;
    setDevicesActionLoading(true);
    try {
      await api.patch(`/playstation/devices/${editingDevice.id}`, {
        name: editingDevice.name.trim(),
        deviceType: editingDevice.deviceType,
        hourlyRate: editingDevice.hourlyRate ? parseFloat(String(editingDevice.hourlyRate)) : undefined,
        multiHourlyRate: editingDevice.multiHourlyRate ? parseFloat(String(editingDevice.multiHourlyRate)) : undefined,
        notes: editingDevice.notes || undefined,
      });
      toast.success('تم تعديل الجهاز بنجاح!');
      setEditingDevice(null);
      await loadDevicesAndSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل تعديل الجهاز');
    } finally {
      setDevicesActionLoading(false);
    }
  };

  const handleToggleDevice = async (device: Device) => {
    try {
      await api.patch(`/playstation/devices/${device.id}`, { active: !device.active });
      toast.success(device.active ? 'تم تعطيل الجهاز' : 'تم تفعيل الجهاز');
      await loadDevicesAndSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل تفعيل/تعطيل الجهاز');
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الجهاز نهائياً؟')) return;
    try {
      await api.delete(`/playstation/devices/${deviceId}`);
      toast.success('تم حذف الجهاز بنجاح!');
      await loadDevicesAndSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل حذف الجهاز');
    }
  };

  // Session Control Actions
  const handleOpenSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openSessionDeviceId) return;
    setDevicesActionLoading(true);
    try {
      await api.post('/playstation/sessions', {
        deviceId: openSessionDeviceId,
        customerName: sessionCustomerName.trim() || 'زبون',
        sessionType,
        targetDurationMinutes: sessionTargetMinutes ? parseInt(sessionTargetMinutes, 10) : undefined,
      });
      toast.success('تم بدء الجلسة بنجاح!');
      setOpenSessionDeviceId(null);
      setSessionCustomerName('');
      setSessionTargetMinutes('');
      await loadDevicesAndSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل فتح الجلسة');
    } finally {
      setDevicesActionLoading(false);
    }
  };

  const handlePauseSession = async (sessionId: string) => {
    try {
      await api.post(`/playstation/sessions/${sessionId}/pause`);
      toast.success('تم إيقاف الجلسة مؤقتاً');
      await loadDevicesAndSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل إيقاف الجلسة');
    }
  };

  const handleResumeSession = async (sessionId: string) => {
    try {
      await api.post(`/playstation/sessions/${sessionId}/resume`);
      toast.success('تم استئناف الجلسة');
      await loadDevicesAndSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل استئناف الجلسة');
    }
  };

  // Transfer Session
  const handleOpenTransfer = (session: Session, device: Device) => {
    setTransferringSession(session);
    setTransferringDevice(device);
    setTargetDeviceId('');
  };

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferringSession || !targetDeviceId) return;
    try {
      await api.post(`/playstation/sessions/${transferringSession.id}/transfer`, {
        targetDeviceId,
      });
      toast.success('تم نقل الجلسة بنجاح!');
      setTransferringSession(null);
      await loadDevicesAndSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل نقل الجلسة');
    }
  };

  // Add Order to Session
  const handleOpenAddOrder = (session: Session, device: Device) => {
    setOrderingSession(session);
    setOrderingDevice(device);
    setSelectedOrderItems({});
    setOrderNotes('');
    loadProducts();
  };

  const handleQuantityChange = (productId: string, delta: number) => {
    setSelectedOrderItems((prev) => {
      const current = prev[productId] || 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
  };

  const handleConfirmAddOrder = async () => {
    if (!orderingSession) return;
    const items = Object.entries(selectedOrderItems).map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
    if (items.length === 0) {
      toast.error('برجاء اختيار مشروب أو منتج واحد على الأقل');
      return;
    }

    try {
      await api.post(`/playstation/sessions/${orderingSession.id}/orders`, {
        items,
        notes: orderNotes.trim() || undefined,
      });
      toast.success('تم إرسال الطلب للمطبخ/الباريستا وإضافته للجلسة! ☕');
      setOrderingSession(null);
      await loadDevicesAndSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل إضافة الطلب');
    }
  };

  // Open Settlement Modal
  const handleOpenSettlement = async (session: Session) => {
    setSettlingSession(session);
    setSettlementLoading(true);
    setSettlePaymentMethod('CASH');
    setSplitCount(1);
    setDiscountAmount('0');

    try {
      const res = await api.get(`/playstation/sessions/${session.id}/timer`);
      setSettlementDetails(res.data);
    } catch {
      toast.error('تعذر جلب تفاصيل الفاتورة');
    } finally {
      setSettlementLoading(false);
    }
  };

  const handleConfirmSettle = async () => {
    if (!settlingSession) return;
    try {
      const discount = parseFloat(discountAmount) || 0;
      await api.post(`/playstation/sessions/${settlingSession.id}/settle`, {
        paymentMethod: settlePaymentMethod,
        paymentStatus: 'PAID',
        splitCount,
        discountAmount: discount,
      });
      toast.success('تم تسوية الحساب وإغلاق الجلسة بنجاح! 🏁');
      setSettlingSession(null);
      setSettlementDetails(null);
      await loadDevicesAndSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل تسوية الجلسة');
    }
  };

  const activeCount = activeSessions.length;
  const freeDevicesCount = devices.filter(
    (d) => d.active && !activeSessions.some((s) => s.id && activeSessions.some((as) => as.id === s.id && devices.find(dev => dev.id === d.id))),
  ).length;

  return (
    <div className="min-h-screen bg-[#120d0b] text-[#f4efe6] p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/10 border border-violet-500/30">
              <Gamepad2 className="h-6 w-6 text-violet-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-wide">
                صالات البلايستيشن والغرف (Lounge Manager)
              </h1>
              <p className="text-sm text-[#a69c98] mt-0.5">
                إدارة الجلسات الحية، ربط طلبات المشروبات، وتوليد الفواتير الموحدة مع الدفع بـ InstaPay.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center bg-[#1e1614] p-1 rounded-xl border border-white/10 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('sessions')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'sessions' ? 'bg-[#c69255] text-black shadow-lg' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
            الجلسات والأجهزة
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pricing')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'pricing' ? 'bg-[#c69255] text-black shadow-lg' : 'text-gray-400 hover:text-white'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            قائمة الأسعار
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'history' ? 'bg-[#c69255] text-black shadow-lg' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4" />
            سجل الجلسات
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      {activeTab === 'sessions' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-[#1a1311] border border-white/10 rounded-2xl p-4">
            <span className="text-xs text-gray-400 block">إجمالي الأجهزة والغرف</span>
            <span className="text-2xl font-black text-white">{devices.length}</span>
          </div>
          <div className="bg-[#1a1311] border border-white/10 rounded-2xl p-4">
            <span className="text-xs text-gray-400 block">جلسات نشطة الآن</span>
            <span className="text-2xl font-black text-amber-400">{activeSessions.length}</span>
          </div>
          <div className="bg-[#1a1311] border border-white/10 rounded-2xl p-4">
            <span className="text-xs text-gray-400 block">أجهزة وغرف شاغرة</span>
            <span className="text-2xl font-black text-emerald-400">
              {devices.filter((d) => d.active && !activeSessions.some((s) => (s as any).deviceId === d.id)).length}
            </span>
          </div>
          <div className="bg-[#1a1311] border border-white/10 rounded-2xl p-4">
            <span className="text-xs text-gray-400 block">فترة السماح المجانية</span>
            <span className="text-sm font-bold text-violet-400 mt-1 block">أول 10 دقائق مجاناً ✨</span>
          </div>
        </div>
      )}

      {/* TAB 1: SESSIONS & DEVICES */}
      {activeTab === 'sessions' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-[#c69255]" />
              خريطة الصالات والأجهزة الحية
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#c69255] to-[#a36f3d] text-black text-xs font-bold shadow-lg hover:brightness-110 transition-all"
              >
                <Plus className="w-4 h-4" />
                إضافة جهاز أو غرفة جديدة
              </button>
              <button
                type="button"
                onClick={loadDevicesAndSessions}
                className="p-2 rounded-xl bg-[#1e1614] border border-white/10 text-gray-300 hover:text-white"
                title="تحديث"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Grid of Devices */}
          {devicesLoading ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <RefreshCw className="w-8 h-8 animate-spin text-[#c69255]" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {devices.map((device) => {
                const session = activeSessions.find((s) => (s as any).deviceId === device.id) || null;
                return (
                  <PlayStationCard
                    key={device.id}
                    device={device}
                    activeSession={session}
                    pricing={pricing}
                    role="owner"
                    onOpenSession={(devId) => {
                      setOpenSessionDeviceId(devId);
                      setSessionCustomerName('');
                      setSessionType('Single Player');
                      setSessionTargetMinutes('');
                    }}
                    onCloseSession={(sess) => handleOpenSettlement(sess)}
                    onAddOrder={(sess, dev) => handleOpenAddOrder(sess, dev)}
                    onPauseSession={(sessId) => handlePauseSession(sessId)}
                    onResumeSession={(sessId) => handleResumeSession(sessId)}
                    onTransferSession={(sess, dev) => handleOpenTransfer(sess, dev)}
                    onEditDevice={(dev) => setEditingDevice(dev)}
                    onToggleDevice={handleToggleDevice}
                    onDeleteDevice={handleDeleteDevice}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PRICING CONFIGURATION */}
      {activeTab === 'pricing' && (
        <form onSubmit={handleSavePricing} className="max-w-2xl bg-[#1a1311] border border-white/10 rounded-2xl p-6 space-y-6">
          <div className="border-b border-white/5 pb-4">
            <h3 className="text-lg font-bold text-white">إعدادات أسعار الساعة العامة</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              الأسعار العامة المطبقة على كافة الأجهزة ما لم يتم تخصيص سعر خاص للغرفة.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">لعب فردي (Single Player) ج.م/ساعة</label>
              <input
                type="number"
                min="0"
                step="1"
                value={pricing.singlePlayerHourlyPrice}
                onChange={(e) => setPricing({ ...pricing, singlePlayerHourlyPrice: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#c69255]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">لعب زوجي (Two Players) ج.م/ساعة</label>
              <input
                type="number"
                min="0"
                step="1"
                value={pricing.twoPlayersHourlyPrice}
                onChange={(e) => setPricing({ ...pricing, twoPlayersHourlyPrice: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#c69255]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">لعب ثلاثي (Three Players) ج.م/ساعة</label>
              <input
                type="number"
                min="0"
                step="1"
                value={pricing.threePlayersHourlyPrice}
                onChange={(e) => setPricing({ ...pricing, threePlayersHourlyPrice: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#c69255]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">لعب رباعي (Four Players) ج.م/ساعة</label>
              <input
                type="number"
                min="0"
                step="1"
                value={pricing.fourPlayersHourlyPrice}
                onChange={(e) => setPricing({ ...pricing, fourPlayersHourlyPrice: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#c69255]"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={pricingActionLoading}
              className="px-6 py-2.5 rounded-xl bg-[#c69255] text-black font-bold text-xs shadow-lg hover:brightness-110 transition-all disabled:opacity-50"
            >
              {pricingActionLoading ? 'جاري الحفظ...' : 'حفظ الأسعار'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: SESSION HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#1a1311] p-4 rounded-xl border border-white/10">
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-[#120d0b] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white"
              />
              <span className="text-gray-400 text-xs">إلى</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-[#120d0b] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white"
              />
            </div>
            <button
              type="button"
              onClick={loadHistory}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#120d0b] border border-white/10 text-xs text-gray-300 hover:text-white"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              تحديث السجل
            </button>
          </div>

          {historyLoading ? (
            <div className="flex min-h-[30vh] items-center justify-center">
              <RefreshCw className="w-8 h-8 animate-spin text-[#c69255]" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 bg-[#1a1311] rounded-2xl border border-white/10 text-gray-400 text-sm">
              لا توجد جلسات منتهية في هذه الفترة
            </div>
          ) : (
            <div className="overflow-x-auto bg-[#1a1311] rounded-2xl border border-white/10">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#120d0b] text-gray-400 border-b border-white/5">
                  <tr>
                    <th className="p-3.5">الجهاز / الغرفة</th>
                    <th className="p-3.5">العميل</th>
                    <th className="p-3.5">نوع اللعب</th>
                    <th className="p-3.5">المدة</th>
                    <th className="p-3.5">وقت البدء</th>
                    <th className="p-3.5">التكلفة</th>
                    <th className="p-3.5">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {history.map((s) => (
                    <tr key={s.id} className="hover:bg-white/[0.02]">
                      <td className="p-3.5 font-bold text-white">{s.device?.name}</td>
                      <td className="p-3.5 text-gray-300">{s.customerName}</td>
                      <td className="p-3.5 text-[#c69255]">{s.sessionType}</td>
                      <td className="p-3.5 font-mono text-gray-300">{s.duration || 0} دقيقة</td>
                      <td className="p-3.5 text-gray-400">
                        {new Date(s.startTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-3.5 font-bold font-mono text-emerald-400">{s.cost || 0} ج.م</td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            s.paymentStatus === 'PAID'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-red-500/20 text-red-300'
                          }`}
                        >
                          {s.paymentStatus === 'PAID' ? 'مدفوع' : 'غير مدفوع'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Start Session */}
      {openSessionDeviceId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleOpenSession}
            className="bg-[#1a1311] border border-white/10 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-[#c69255]" />
                بدء جلسة لعب جديدة
              </h3>
              <button
                type="button"
                onClick={() => setOpenSessionDeviceId(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs text-gray-300 mb-1">اسم العميل / الفريق</label>
              <input
                type="text"
                value={sessionCustomerName}
                onChange={(e) => setSessionCustomerName(e.target.value)}
                placeholder="مثال: أحمد محمود"
                className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#c69255]"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-gray-300 mb-1">نوع اللعب</label>
              <select
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value)}
                className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#c69255]"
              >
                <option value="Single Player">لعب فردي (Single Player)</option>
                <option value="Two Players">لعب زوجي (Two Players)</option>
                <option value="Three Players">لعب ثلاثي (Three Players)</option>
                <option value="Four Players">لعب رباعي (Four Players)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-300 mb-1">وقت محدد للجلسة (اختياري بالدقائق)</label>
              <input
                type="number"
                min="10"
                step="10"
                value={sessionTargetMinutes}
                onChange={(e) => setSessionTargetMinutes(e.target.value)}
                placeholder="اتركه فارغاً لوقت مفتوح (مثال: 60 لساعة)"
                className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#c69255]"
              />
              <p className="text-[11px] text-gray-500 mt-1">تنبيه الكاشير قبل انتهاء الوقت بـ 5 دقائق.</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenSessionDeviceId(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-6 py-2 rounded-xl bg-[#c69255] text-black text-xs font-bold hover:brightness-110 shadow-lg"
              >
                بدء اللعب فوراً 🎮
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: Add Cafe Drinks to Session */}
      {orderingSession && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1311] border border-white/10 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Coffee className="w-5 h-5 text-amber-400" />
                  إضافة طلب مشروبات للجلسة
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {orderingDevice?.name} — {orderingSession.customerName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOrderingSession(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="ابحث عن مشروب أو حلوى..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            </div>

            {/* Product List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {productsLoading ? (
                <div className="py-8 text-center text-gray-400 text-xs">جاري تحميل المنيو...</div>
              ) : (
                products
                  .filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()))
                  .map((prod) => {
                    const qty = selectedOrderItems[prod.id] || 0;
                    return (
                      <div
                        key={prod.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-[#120d0b] border border-white/5"
                      >
                        <div>
                          <span className="text-xs font-bold text-white block">{prod.name}</span>
                          <span className="text-[11px] text-[#c69255] font-mono">{prod.price} ج.م</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {qty > 0 && (
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(prod.id, -1)}
                              className="w-7 h-7 rounded-lg bg-red-500/20 text-red-300 font-bold flex items-center justify-center hover:bg-red-500/30"
                            >
                              -
                            </button>
                          )}
                          {qty > 0 && <span className="font-bold text-xs text-white px-1">{qty}</span>}
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(prod.id, 1)}
                            className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center hover:bg-emerald-500/30"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            <div className="border-t border-white/5 pt-3">
              <input
                type="text"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="ملاحظات للبار (مثال: سكر زيادة، تلج كتير)..."
                className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none mb-3"
              />

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  إجمالي المنتجات المحددة: {Object.values(selectedOrderItems).reduce((a, b) => a + b, 0)}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderingSession(null)}
                    className="px-4 py-2 rounded-xl bg-white/5 text-gray-300 text-xs font-semibold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmAddOrder}
                    className="px-5 py-2 rounded-xl bg-[#c69255] text-black text-xs font-bold hover:brightness-110"
                  >
                    تأكيد وإرسال للباريستا ☕
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Transfer Session */}
      {transferringSession && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmTransfer}
            className="bg-[#1a1311] border border-white/10 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-blue-400" />
                نقل الجلسة لجهاز أو غرفة أخرى
              </h3>
              <button
                type="button"
                onClick={() => setTransferringSession(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-400">
              الجهاز الحالي: <span className="text-white font-bold">{transferringDevice?.name}</span>
            </p>

            <div>
              <label className="block text-xs text-gray-300 mb-1.5">اختر الجهاز الجديد المتاح</label>
              <select
                value={targetDeviceId}
                onChange={(e) => setTargetDeviceId(e.target.value)}
                className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                required
              >
                <option value="">-- اختر جهازاً شاغراً --</option>
                {devices
                  .filter(
                    (d) =>
                      d.active &&
                      d.id !== transferringDevice?.id &&
                      !activeSessions.some((s) => (s as any).deviceId === d.id),
                  )
                  .map((dev) => (
                    <option key={dev.id} value={dev.id}>
                      {dev.name} ({dev.deviceType || 'PS5'})
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTransferringSession(null)}
                className="px-4 py-2 rounded-xl bg-white/5 text-gray-300 text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={!targetDeviceId}
                className="px-6 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 disabled:opacity-50"
              >
                تأكيد النقل فوراً
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 4: Unified Settlement & Checkout Modal */}
      {settlingSession && settlementDetails && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1311] border border-white/10 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Coins className="w-5 h-5 text-emerald-400" />
                  إنهاء الجلسة والفاتورة الموحدة
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {settlementDetails.deviceName} — العميل: {settlementDetails.customerName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettlingSession(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bill Summary */}
            <div className="space-y-2 bg-[#120d0b] p-4 rounded-xl border border-white/5 text-xs">
              <div className="flex justify-between text-gray-400">
                <span>وقت اللعب ({settlementDetails.elapsedMinutes} دقيقة):</span>
                <span className="font-mono font-bold text-white">{settlementDetails.timeCost} ج.م</span>
              </div>

              {settlementDetails.ordersTotal > 0 && (
                <div className="flex justify-between text-amber-300">
                  <span>مشاريب وطلبات الكافيه ({settlementDetails.ordersCount} طلب):</span>
                  <span className="font-mono font-bold">{settlementDetails.ordersTotal} ج.م</span>
                </div>
              )}

              <div className="flex justify-between items-center text-gray-300 pt-1">
                <span>خصم خاص (ج.م):</span>
                <input
                  type="number"
                  min="0"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  className="w-24 bg-[#17100e] border border-white/10 rounded-lg px-2 py-1 text-xs text-right font-mono text-white focus:outline-none"
                />
              </div>

              <div className="flex justify-between text-sm font-bold border-t border-white/10 pt-2 text-white">
                <span>المبلغ الإجمالي المستحق:</span>
                <span className="font-mono text-emerald-400 text-lg">
                  {Math.max(
                    0,
                    settlementDetails.timeCost +
                      settlementDetails.ordersTotal -
                      (parseFloat(discountAmount) || 0),
                  ).toFixed(2)}{' '}
                  ج.م
                </span>
              </div>
            </div>

            {/* Split Bill Calculator */}
            <div className="bg-[#120d0b] p-3 rounded-xl border border-white/5 flex items-center justify-between text-xs">
              <span className="text-gray-400 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-violet-400" />
                تقسيم الفاتورة (عدد اللاعبين):
              </span>
              <div className="flex items-center gap-3">
                <select
                  value={splitCount}
                  onChange={(e) => setSplitCount(parseInt(e.target.value, 10))}
                  className="bg-[#17100e] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white"
                >
                  <option value={1}>1 (شخص واحد)</option>
                  <option value={2}>2 لاعبين</option>
                  <option value={3}>3 لاعبين</option>
                  <option value={4}>4 لاعبين</option>
                  <option value={5}>5 لاعبين</option>
                </select>
                {splitCount > 1 && (
                  <span className="text-violet-300 font-bold font-mono">
                    {(
                      Math.max(
                        0,
                        settlementDetails.timeCost +
                          settlementDetails.ordersTotal -
                          (parseFloat(discountAmount) || 0),
                      ) / splitCount
                    ).toFixed(2)}{' '}
                    ج.م / فرد
                  </span>
                )}
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-2">طريقة التحصيل والدفع:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSettlePaymentMethod('CASH')}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                    settlePaymentMethod === 'CASH'
                      ? 'bg-[#c69255] text-black border-[#c69255]'
                      : 'bg-[#120d0b] text-gray-400 border-white/10'
                  }`}
                >
                  💵 نقداً (كاش)
                </button>
                <button
                  type="button"
                  onClick={() => setSettlePaymentMethod('INSTAPAY')}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                    settlePaymentMethod === 'INSTAPAY'
                      ? 'bg-pink-600 text-white border-pink-500'
                      : 'bg-[#120d0b] text-gray-400 border-white/10'
                  }`}
                >
                  📱 InstaPay QR
                </button>
                <button
                  type="button"
                  onClick={() => setSettlePaymentMethod('VODAFONE_CASH')}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                    settlePaymentMethod === 'VODAFONE_CASH'
                      ? 'bg-red-600 text-white border-red-500'
                      : 'bg-[#120d0b] text-gray-400 border-white/10'
                  }`}
                >
                  🔴 محفظة إلكترونية
                </button>
              </div>
            </div>

            {settlePaymentMethod === 'INSTAPAY' && (
              <div className="p-3 bg-pink-500/10 border border-pink-500/20 rounded-xl text-xs text-pink-200 text-center">
                يتم إظهار باركود الـ QR للعميل لمسحه فوراً وسداد الفاتورة عبر تطبيق InstaPay.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSettlingSession(null)}
                className="px-4 py-2 rounded-xl bg-white/5 text-gray-300 text-xs font-semibold"
              >
                رجوع
              </button>
              <button
                type="button"
                onClick={handleConfirmSettle}
                className="px-6 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 shadow-lg"
              >
                تأكيد الاستلام وإغلاق الجلسة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Create Device / Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateDevice}
            className="bg-[#1a1311] border border-white/10 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#c69255]" />
                إضافة جهاز أو غرفة جديدة
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs text-gray-300 mb-1">اسم الجهاز أو الغرفة</label>
              <input
                type="text"
                value={deviceForm.name}
                onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })}
                placeholder="مثال: PS5 - صالة رئيسية أو غرفة VIP 1"
                className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#c69255]"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-gray-300 mb-1">النوع والتصنيف</label>
              <select
                value={deviceForm.deviceType}
                onChange={(e) => setDeviceForm({ ...deviceForm, deviceType: e.target.value })}
                className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#c69255]"
              >
                <option value="PS5">PlayStation 5 (PS5)</option>
                <option value="PS4">PlayStation 4 (PS4)</option>
                <option value="VIP_ROOM">غرفة خاصة (VIP Room)</option>
                <option value="BILLIARDS">ترابيزة بلياردو (Billiards)</option>
                <option value="PING_PONG">ترابيزة بينج بونج (Ping Pong)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-300 mb-1">سعر خاص فردي (ج.م/ساعة)</label>
                <input
                  type="number"
                  min="0"
                  value={deviceForm.hourlyRate}
                  onChange={(e) => setDeviceForm({ ...deviceForm, hourlyRate: e.target.value })}
                  placeholder="افتراضي"
                  className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-300 mb-1">سعر خاص زوجي (ج.م/ساعة)</label>
                <input
                  type="number"
                  min="0"
                  value={deviceForm.multiHourlyRate}
                  onChange={(e) => setDeviceForm({ ...deviceForm, multiHourlyRate: e.target.value })}
                  placeholder="افتراضي"
                  className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl bg-white/5 text-gray-300 text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={devicesActionLoading}
                className="px-6 py-2 rounded-xl bg-[#c69255] text-black text-xs font-bold hover:brightness-110 shadow-lg disabled:opacity-50"
              >
                إضافة الجهاز
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 6: Edit Device Modal */}
      {editingDevice && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdateDevice}
            className="bg-[#1a1311] border border-white/10 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-base font-bold text-white">تعديل الجهاز / الغرفة</h3>
              <button
                type="button"
                onClick={() => setEditingDevice(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs text-gray-300 mb-1">اسم الجهاز أو الغرفة</label>
              <input
                type="text"
                value={editingDevice.name}
                onChange={(e) => setEditingDevice({ ...editingDevice, name: e.target.value })}
                className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-gray-300 mb-1">التصنيف</label>
              <select
                value={editingDevice.deviceType || 'PS5'}
                onChange={(e) => setEditingDevice({ ...editingDevice, deviceType: e.target.value })}
                className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none"
              >
                <option value="PS5">PlayStation 5 (PS5)</option>
                <option value="PS4">PlayStation 4 (PS4)</option>
                <option value="VIP_ROOM">غرفة خاصة (VIP Room)</option>
                <option value="BILLIARDS">ترابيزة بلياردو (Billiards)</option>
                <option value="PING_PONG">ترابيزة بينج بونج (Ping Pong)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingDevice(null)}
                className="px-4 py-2 rounded-xl bg-white/5 text-gray-300 text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-6 py-2 rounded-xl bg-[#c69255] text-black text-xs font-bold hover:brightness-110 shadow-lg"
              >
                حفظ التعديلات
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

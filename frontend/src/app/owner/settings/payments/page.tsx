'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  Wallet,
  QrCode,
  Smartphone,
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Save,
  ShieldCheck,
  Phone,
  Copy,
  Check,
  Info,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface PaymentConfig {
  id?: string;
  cafeId?: string;
  instapayAddress: string;
  instapayAccountName: string;
  instapayEnabled: boolean;

  vodafoneCashNumber: string;
  vodafoneCashEnabled: boolean;

  orangeCashNumber: string;
  orangeCashEnabled: boolean;

  etisalatCashNumber: string;
  etisalatCashEnabled: boolean;

  wePayNumber: string;
  wePayEnabled: boolean;

  onlineCardEnabled: boolean;
  paymobApiKey: string;
  paymobIntegrationId: string;
  paymobIframeId: string;
  paymobHmacSecret: string;

  instructionsArabic: string;
}

interface TransactionItem {
  id: string;
  orderId: string;
  provider: string;
  referenceNumber: string;
  customerPhone?: string;
  amount: number | string;
  status: 'PENDING' | 'VERIFYING' | 'PAID' | 'FAILED';
  notes?: string;
  verifiedAt?: string;
  createdAt: string;
  order?: {
    id: string;
    code: string;
    total: number | string;
    status: string;
    paymentStatus: string;
    customer?: {
      id: string;
      name: string;
      phone: string;
    };
  };
}

export default function OwnerPaymentsPage() {
  const [activeTab, setActiveTab] = useState<'accounts' | 'queue'>('accounts');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form State
  const [config, setConfig] = useState<PaymentConfig>({
    instapayAddress: '',
    instapayAccountName: '',
    instapayEnabled: false,
    vodafoneCashNumber: '',
    vodafoneCashEnabled: false,
    orangeCashNumber: '',
    orangeCashEnabled: false,
    etisalatCashNumber: '',
    etisalatCashEnabled: false,
    wePayNumber: '',
    wePayEnabled: false,
    onlineCardEnabled: false,
    paymobApiKey: '',
    paymobIntegrationId: '',
    paymobIframeId: '',
    paymobHmacSecret: '',
    instructionsArabic: '',
  });

  // Transactions Queue
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [queueFilter, setQueueFilter] = useState<'ALL' | 'VERIFYING' | 'PAID' | 'FAILED'>('ALL');
  const [queueLoading, setQueueLoading] = useState<boolean>(false);

  // Fetch Payment Config
  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/owner/payment-settings');
      if (res.data) {
        setConfig((prev) => ({
          ...prev,
          ...res.data,
          instapayAddress: res.data.instapayAddress || '',
          instapayAccountName: res.data.instapayAccountName || '',
          instapayEnabled: Boolean(res.data.instapayEnabled),
          vodafoneCashNumber: res.data.vodafoneCashNumber || '',
          vodafoneCashEnabled: Boolean(res.data.vodafoneCashEnabled),
          orangeCashNumber: res.data.orangeCashNumber || '',
          orangeCashEnabled: Boolean(res.data.orangeCashEnabled),
          etisalatCashNumber: res.data.etisalatCashNumber || '',
          etisalatCashEnabled: Boolean(res.data.etisalatCashEnabled),
          wePayNumber: res.data.wePayNumber || '',
          wePayEnabled: Boolean(res.data.wePayEnabled),
          onlineCardEnabled: Boolean(res.data.onlineCardEnabled),
          paymobApiKey: res.data.paymobApiKey || '',
          paymobIntegrationId: res.data.paymobIntegrationId || '',
          paymobIframeId: res.data.paymobIframeId || '',
          paymobHmacSecret: res.data.paymobHmacSecret || '',
          instructionsArabic: res.data.instructionsArabic || '',
        }));
      }
    } catch (err: any) {
      toast.error('تعذر جلب إعدادات الدفع');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Transactions
  const fetchTransactions = useCallback(async () => {
    try {
      setQueueLoading(true);
      const params: any = { limit: 50 };
      if (queueFilter !== 'ALL') {
        params.status = queueFilter;
      }
      const res = await api.get('/owner/payment-settings/transactions', { params });
      setTransactions(res.data || []);
    } catch (err: any) {
      toast.error('تعذر جلب طابور التحقق');
    } finally {
      setQueueLoading(false);
    }
  }, [queueFilter]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (activeTab === 'queue') {
      fetchTransactions();
    }
  }, [activeTab, fetchTransactions]);

  // Save Config
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.post('/owner/payment-settings', config);
      toast.success('تم حفظ إعدادات الدفع الإلكتروني بنجاح!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  // Verify Transaction
  const handleVerify = async (transactionId: string, action: 'APPROVE' | 'REJECT') => {
    let notes: string | undefined;
    if (action === 'REJECT') {
      const reason = window.prompt('سبب رفض التحويل (اختياري):');
      if (reason === null) return;
      notes = reason;
    }

    try {
      const res = await api.post(`/owner/payment-settings/verify/${transactionId}`, {
        action,
        notes,
      });
      toast.success(res.data?.message || (action === 'APPROVE' ? 'تم اعتماد الدفع' : 'تم رفض العملية'));
      fetchTransactions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشلت عملية التحقق');
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast.success('تم النسخ إلى الحافظة');
  };

  const getProviderBadge = (provider: string) => {
    switch (provider?.toUpperCase()) {
      case 'INSTAPAY':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-pink-500/20 text-pink-300 border border-pink-500/30">InstaPay</span>;
      case 'VODAFONE_CASH':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30">Vodafone Cash</span>;
      case 'ORANGE_CASH':
      case 'ORANGE_MONEY':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">Orange Cash</span>;
      case 'ETISALAT_CASH':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Etisalat Cash</span>;
      case 'WE_PAY':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">WE Pay</span>;
      case 'PAYMOB':
      case 'PAYMOB_CARD':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">Paymob Card</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-500/20 text-gray-300 border border-gray-500/30">{provider}</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> معتمد ومدفوع
          </span>
        );
      case 'VERIFYING':
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
            <Clock className="w-3.5 h-3.5" /> بانتظار التأكيد
          </span>
        );
      case 'FAILED':
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            <XCircle className="w-3.5 h-3.5" /> مرفوض
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
            {status}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-[#c69255]" />
          <p className="text-sm text-gray-400">جاري تحميل إعدادات الدفع الإلكتروني...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#120d0b] text-[#f4efe6] p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#c69255]/20 to-[#a36f3d]/10 border border-[#c69255]/30">
              <Wallet className="h-6 w-6 text-[#c69255]" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-wide">الدفع الإلكتروني السريع</h1>
              <p className="text-sm text-[#a69c98] mt-0.5">
                ربط حسابات انستاباي (InstaPay) والمحافظ الذكية وبوابات الدفع — الأموال تصل مباشرة لحسابك.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center bg-[#1e1614] p-1 rounded-xl border border-white/10 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('accounts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'accounts'
                ? 'bg-[#c69255] text-black shadow-lg shadow-[#c69255]/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <QrCode className="w-4 h-4" />
            إعداد الحسابات والمحافظ
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all relative ${
              activeTab === 'queue'
                ? 'bg-[#c69255] text-black shadow-lg shadow-[#c69255]/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            طابور التحقق اللحظي
            {transactions.filter((t) => t.status === 'VERIFYING').length > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping ml-1" />
            )}
          </button>
        </div>
      </div>

      {/* Multi-Tenant Security Note */}
      <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-amber-200/90 text-sm">
        <ShieldCheck className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">استقلالية مالية كاملة: </span>
          جميع التحويلات عبر انستاباي والمحافظ الذكية تتم مباشرة بين العميل وحساب الكافيه الخاص بك بدون أي عمولات
          منصية أو وسطاء. يتم التحقق وتأكيد الطلب لحظياً بمجرد مطابقة رقم العملية.
        </div>
      </div>

      {/* TAB 1: Accounts & Wallets Configuration */}
      {activeTab === 'accounts' && (
        <form onSubmit={handleSaveConfig} className="space-y-6">
          {/* 1. InstaPay Dynamic QR Section */}
          <div className="bg-[#1a1311] border border-white/10 rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center border border-pink-500/20">
                  <QrCode className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">انستاباي (InstaPay) — التحويل اللحظي بالـ QR</h3>
                  <p className="text-xs text-gray-400">
                    توليد باركود QR ذكي تلقائياً يحتوي على عنوان حسابك (IPA) ومبلغ الطلب بالمليم وكود الطلب.
                  </p>
                </div>
              </div>

              {/* Active Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs font-semibold text-gray-300">
                  {config.instapayEnabled ? 'مفعّل' : 'معطّل'}
                </span>
                <input
                  type="checkbox"
                  checked={config.instapayEnabled}
                  onChange={(e) => setConfig({ ...config, instapayEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600 relative"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  عنوان الدفع اللحظي (InstaPay Address / IPA) <span className="text-pink-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={config.instapayAddress}
                    onChange={(e) => setConfig({ ...config, instapayAddress: e.target.value })}
                    placeholder="مثال: cafe.name@instapay أو 010xxxxxxxx"
                    className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-pink-500/50"
                  />
                  {config.instapayAddress && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(config.instapayAddress, 'ipa')}
                      className="absolute left-3 top-2.5 text-gray-400 hover:text-white"
                    >
                      {copiedField === 'ipa' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  يمكنك وضع عنوان الـ IPA المباشر أو رقم الهاتف المسجل على تطبيق InstaPay.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  اسم المستفيد كما يظهر في التطبيق
                </label>
                <input
                  type="text"
                  value={config.instapayAccountName}
                  onChange={(e) => setConfig({ ...config, instapayAccountName: e.target.value })}
                  placeholder="مثال: Sonic Coffee Co."
                  className="w-full bg-[#120d0b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-pink-500/50"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  يساعد العميل على التأكد من تحويل المبلغ للشخص أو الكافيه الصحيح.
                </p>
              </div>
            </div>
          </div>

          {/* 2. Mobile Wallets (Vodafone Cash, Orange, Etisalat, WE) */}
          <div className="bg-[#1a1311] border border-white/10 rounded-2xl p-6 space-y-6">
            <div className="border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
                  <Smartphone className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">المحافظ الإلكترونية الذكية (Mobile Wallets)</h3>
                  <p className="text-xs text-gray-400">
                    استقبال التحويلات عبر المحافظ مع دعم أكواد الـ USSD السريعة للمحول.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Vodafone Cash */}
              <div className="p-4 rounded-xl bg-[#120d0b] border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-red-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span> فودافون كاش (Vodafone Cash)
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.vodafoneCashEnabled}
                      onChange={(e) => setConfig({ ...config, vodafoneCashEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-red-600 relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                  </label>
                </div>
                <input
                  type="tel"
                  value={config.vodafoneCashNumber}
                  onChange={(e) => setConfig({ ...config, vodafoneCashNumber: e.target.value })}
                  placeholder="رقم المحفظة (مثال: 01012345678)"
                  className="w-full bg-[#17100e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
                />
                <p className="text-[11px] text-gray-500">كود التحويل التلقائي للعميل: *9*7*الرقم*المبلغ#</p>
              </div>

              {/* Orange Cash */}
              <div className="p-4 rounded-xl bg-[#120d0b] border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-orange-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500"></span> أورنج كاش (Orange Cash)
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.orangeCashEnabled}
                      onChange={(e) => setConfig({ ...config, orangeCashEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-orange-600 relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                  </label>
                </div>
                <input
                  type="tel"
                  value={config.orangeCashNumber}
                  onChange={(e) => setConfig({ ...config, orangeCashNumber: e.target.value })}
                  placeholder="رقم المحفظة (مثال: 01212345678)"
                  className="w-full bg-[#17100e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50"
                />
                <p className="text-[11px] text-gray-500">كود التحويل التلقائي للعميل: *115*1*الرقم*المبلغ#</p>
              </div>

              {/* Etisalat Cash */}
              <div className="p-4 rounded-xl bg-[#120d0b] border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> اتصالات كاش (Etisalat Cash)
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.etisalatCashEnabled}
                      onChange={(e) => setConfig({ ...config, etisalatCashEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-emerald-600 relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                  </label>
                </div>
                <input
                  type="tel"
                  value={config.etisalatCashNumber}
                  onChange={(e) => setConfig({ ...config, etisalatCashNumber: e.target.value })}
                  placeholder="رقم المحفظة (مثال: 01112345678)"
                  className="w-full bg-[#17100e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
                />
                <p className="text-[11px] text-gray-500">كود التحويل التلقائي للعميل: *777*الرقم*المبلغ#</p>
              </div>

              {/* WE Pay */}
              <div className="p-4 rounded-xl bg-[#120d0b] border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span> وي باي (WE Pay)
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.wePayEnabled}
                      onChange={(e) => setConfig({ ...config, wePayEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-indigo-600 relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                  </label>
                </div>
                <input
                  type="tel"
                  value={config.wePayNumber}
                  onChange={(e) => setConfig({ ...config, wePayNumber: e.target.value })}
                  placeholder="رقم المحفظة (مثال: 01512345678)"
                  className="w-full bg-[#17100e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
                />
                <p className="text-[11px] text-gray-500">استقبال التحويلات عبر تطبيق WE Pay مباشرة.</p>
              </div>
            </div>
          </div>

          {/* 3. Card Gateway (Paymob) */}
          <div className="bg-[#1a1311] border border-white/10 rounded-2xl p-6 space-y-6">
            <div className="border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                  <CreditCard className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">بوابات الدفع الإلكتروني بالبطاقات البنكية</h3>
                  <p className="text-xs text-gray-400">
                    ربط حساب Paymob الخاص بك لاستقبال فيزا وماستركارد وتأكيد الطلبات تلقائياً عبر الـ Webhook.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-blue-300">بوابة Paymob (بطاقات ائتمان / خصم مباشر)</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.onlineCardEnabled}
                    onChange={(e) => setConfig({ ...config, onlineCardEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                </label>
              </div>

              {config.onlineCardEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-[#120d0b] border border-white/5">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Paymob API Key</label>
                    <input
                      type="password"
                      value={config.paymobApiKey}
                      onChange={(e) => setConfig({ ...config, paymobApiKey: e.target.value })}
                      placeholder="zx_live_..."
                      className="w-full bg-[#17100e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Integration ID</label>
                    <input
                      type="text"
                      value={config.paymobIntegrationId}
                      onChange={(e) => setConfig({ ...config, paymobIntegrationId: e.target.value })}
                      placeholder="مثال: 452912"
                      className="w-full bg-[#17100e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Iframe ID</label>
                    <input
                      type="text"
                      value={config.paymobIframeId}
                      onChange={(e) => setConfig({ ...config, paymobIframeId: e.target.value })}
                      placeholder="مثال: 81294"
                      className="w-full bg-[#17100e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">HMAC Secret</label>
                    <input
                      type="password"
                      value={config.paymobHmacSecret}
                      onChange={(e) => setConfig({ ...config, paymobHmacSecret: e.target.value })}
                      placeholder="مفتاح التوثيق التلقائي"
                      className="w-full bg-[#17100e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4. Customer Instructions Notes */}
          <div className="bg-[#1a1311] border border-white/10 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Info className="w-4 h-4 text-[#c69255]" />
              تعليمات إضافية تظهر للعميل عند اختيار الدفع الإلكتروني
            </h3>
            <textarea
              rows={3}
              value={config.instructionsArabic}
              onChange={(e) => setConfig({ ...config, instructionsArabic: e.target.value })}
              placeholder="مثال: برجاء إرسال لقطة شاشة أو رقم المرجع عبر الواتساب لتأكيد تحضير الأوردر على الفور."
              className="w-full bg-[#120d0b] border border-white/10 rounded-xl p-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#c69255]/50"
            />
          </div>

          {/* Save Button Bar */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-[#c69255] to-[#a36f3d] text-black font-bold shadow-lg shadow-[#c69255]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {saving ? 'جاري الحفظ...' : 'حفظ إعدادات الدفع'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: Live Verification Queue */}
      {activeTab === 'queue' && (
        <div className="space-y-6">
          {/* Filter and Refresh Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#1a1311] p-4 rounded-xl border border-white/10">
            <div className="flex items-center gap-2 overflow-x-auto">
              {(['ALL', 'VERIFYING', 'PAID', 'FAILED'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setQueueFilter(status)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    queueFilter === status
                      ? 'bg-[#c69255] text-black'
                      : 'bg-[#120d0b] text-gray-400 hover:text-white border border-white/5'
                  }`}
                >
                  {status === 'ALL' && 'الكل'}
                  {status === 'VERIFYING' && 'بانتظار التأكيد'}
                  {status === 'PAID' && 'تم التأكيد'}
                  {status === 'FAILED' && 'مرفوض'}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={fetchTransactions}
              disabled={queueLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#120d0b] border border-white/10 text-xs font-semibold text-gray-300 hover:text-white hover:border-white/20 transition-all self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${queueLoading ? 'animate-spin' : ''}`} />
              تحديث الطابور اللحظي
            </button>
          </div>

          {/* Transactions List */}
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-[#1a1311] rounded-2xl border border-white/10 text-center">
              <Clock className="w-12 h-12 text-gray-600 mb-3" />
              <h3 className="text-base font-bold text-gray-300">لا توجد عمليات تحويل حالياً</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm">
                عندما يقوم العميل بإرسال رقم عملية انستاباي أو فودافون كاش، ستظهر هنا فوراً لمراجعتها واعتمادها بنقرة واحدة.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className={`bg-[#1a1311] border rounded-2xl p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    tx.status === 'VERIFYING'
                      ? 'border-amber-500/40 shadow-lg shadow-amber-500/5'
                      : 'border-white/10'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      {getProviderBadge(tx.provider)}
                      {getStatusBadge(tx.status)}
                      <span className="text-xs font-mono text-gray-400">
                        {new Date(tx.createdAt).toLocaleTimeString('ar-EG', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <div>
                        <span className="text-xs text-gray-500 block">رقم العملية / المرجع</span>
                        <span className="font-mono font-bold text-white bg-black/40 px-2 py-0.5 rounded border border-white/10">
                          {tx.referenceNumber}
                        </span>
                      </div>

                      <div>
                        <span className="text-xs text-gray-500 block">المبلغ</span>
                        <span className="font-bold text-[#c69255] text-base">{tx.amount} ج.م</span>
                      </div>

                      {tx.order && (
                        <div>
                          <span className="text-xs text-gray-500 block">الطلب</span>
                          <span className="font-semibold text-gray-200">#{tx.order.code}</span>
                        </div>
                      )}

                      {tx.customerPhone && (
                        <div>
                          <span className="text-xs text-gray-500 block">رقم المحول</span>
                          <span className="font-mono text-gray-300">{tx.customerPhone}</span>
                        </div>
                      )}
                    </div>

                    {tx.notes && (
                      <p className="text-xs text-gray-400 bg-[#120d0b] p-2 rounded-lg border border-white/5">
                        {tx.notes}
                      </p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  {tx.status === 'VERIFYING' && (
                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      <button
                        type="button"
                        onClick={() => handleVerify(tx.id, 'APPROVE')}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        تأكيد واستلام النقدية
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVerify(tx.id, 'REJECT')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold border border-red-500/30 active:scale-95 transition-all"
                      >
                        <XCircle className="w-4 h-4" />
                        رفض
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

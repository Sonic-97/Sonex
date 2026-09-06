'use client';

import React, { useState, useEffect } from 'react';
import { 
  MessageCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Key, 
  Phone, 
  Send, 
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

interface WhatsAppAccount {
  id?: string;
  phoneNumberId?: string;
  wabaId?: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  webhookVerifyToken?: string;
  status?: string;
}

export default function OwnerWhatsAppPage() {
  const [account, setAccount] = useState<WhatsAppAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [permanentToken, setPermanentToken] = useState('');
  const [displayPhone, setDisplayPhone] = useState('');

  const fetchAccount = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/whatsapp/account', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.connected && data.account) {
          setAccount(data.account);
          setPhoneNumberId(data.account.phoneNumberId || '');
          setWabaId(data.account.wabaId || '');
          setDisplayPhone(data.account.displayPhoneNumber || '');
        } else {
          setAccount(null);
        }
      }
    } catch (err) {
      console.error('Error fetching WhatsApp account', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccount();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/whatsapp/account/meta', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          phoneNumberId,
          wabaId,
          permanentToken,
          displayPhoneNumber: displayPhone
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({ type: 'success', text: 'تم حفظ وربط بيانات WhatsApp بنجاح!' });
        await fetchAccount();
      } else {
        setStatusMessage({ type: 'error', text: data.message || 'حدث خطأ أثناء حفظ البيانات' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'فشل الاتصال بالخادم' });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('هل أنت متأكد من رغبتك في إلغاء ربط رقم WhatsApp الخاص بهذا الكافيه؟')) return;
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/whatsapp/account/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setStatusMessage({ type: 'success', text: 'تم إلغاء ربط الحساب بنجاح.' });
        setAccount(null);
        setPhoneNumberId('');
        setWabaId('');
        setPermanentToken('');
        setDisplayPhone('');
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'فشل في إلغاء الربط' });
    }
  };

  const handleSendTest = async () => {
    if (!testPhone) {
      alert('يرجى كتابة رقم الهاتف مع كود الدولة (مثال: 201012345678)');
      return;
    }
    setTesting(true);
    setStatusMessage(null);
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/whatsapp/account/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ targetPhone: testPhone })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({ type: 'success', text: 'تم إرسال الرسالة التجريبية بنجاح!' });
      } else {
        setStatusMessage({ type: 'error', text: data.message || 'فشل إرسال الرسالة التجريبية' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'خطأ في الاتصال' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8" dir="rtl">
      <div className="flex items-center justify-between border-b pb-5 border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-2xl">
            <MessageCircle className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              إعدادات WhatsApp Business (Meta Cloud API)
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              اربط رقم الواتساب الخاص بكافيهك لاستقبال طلبات الزبائن والردود الذكية آلياً.
            </p>
          </div>
        </div>

        <button 
          onClick={fetchAccount} 
          className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
          title="تحديث الحالة"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {statusMessage && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300' 
            : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
          <span className="text-sm font-medium">{statusMessage.text}</span>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-500" />
          حالة الاتصال الحالية
        </h2>

        {loading ? (
          <div className="py-6 text-center text-gray-400">جار التحميل...</div>
        ) : account ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">
                    الرقم مفعل: {account.displayPhoneNumber || 'غير محدد'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Phone Number ID: {account.phoneNumberId}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 rounded-full text-xs font-semibold">
                  متصل وجاهز للعمل
                </span>
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition border border-rose-200 dark:hover:bg-rose-950/40"
                >
                  إلغاء الربط
                </button>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                إرسال رسالة تجريبية للتأكد من عمل الـ API:
              </label>
              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  placeholder="201012345678"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                  dir="ltr"
                />
                <button
                  onClick={handleSendTest}
                  disabled={testing}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  {testing ? 'جار الإرسال...' : 'إرسال تجريبي'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-sm">
            لم تقم بربط رقم WhatsApp Business مخصص لكافيهك حتى الآن. يمكنك إدخال بيانات Meta Cloud API في النموذج أدناه لربط رقمك فوراً.
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          ربط بيانات Meta Cloud API
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
          احصل على هذه البيانات من لوحة تحكم Meta for Developers (WhatsApp App Dashboard).
        </p>

        <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Phone Number ID <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
              <input
                type="text"
                required
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="مثال: 104598762341209"
                className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"
                dir="ltr"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              WhatsApp Business Account ID (WABA ID) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              placeholder="مثال: 109283746519283"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Permanent System User Access Token <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Key className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
              <input
                type="password"
                required
                value={permanentToken}
                onChange={(e) => setPermanentToken(e.target.value)}
                placeholder="EAABw..."
                className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"
                dir="ltr"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              رمز الوصول الدائم (System User Token) مع تصريح whatsapp_business_messaging.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              رقم الهاتف المعروض (Display Phone Number)
            </label>
            <input
              type="text"
              value={displayPhone}
              onChange={(e) => setDisplayPhone(e.target.value)}
              placeholder="+20 10 1234 5678"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"
              dir="ltr"
            />
          </div>

          <div className="pt-3">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-medium text-sm hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm"
            >
              {saving ? 'جار الحفظ والتفعيل...' : 'حفظ وتفعيل الرقم'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-2">
          إعداد Webhook في Meta for Developers:
        </h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
          في حساب Meta Developer الخاص بك، توجه إلى إعدادات WhatsApp Webhook وقم بإدخال:
        </p>

        <div className="space-y-3 font-mono text-xs">
          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <span className="text-gray-400 select-none block mb-1">Callback URL:</span>
            <span className="text-emerald-600 dark:text-emerald-400 select-all">
              https://your-domain.com/api/communication/webhook/whatsapp
            </span>
          </div>

          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <span className="text-gray-400 select-none block mb-1">Verify Token:</span>
            <span className="text-emerald-600 dark:text-emerald-400 select-all">
              {account?.webhookVerifyToken || 'sonic_meta_webhook_verify_2026'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

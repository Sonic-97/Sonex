'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { Coffee, User, Store, CheckCircle, Copy, Check, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';

export default function RegisterWizardPage() {
  const router = useRouter();
  
  // Wizard step: 1 = Owner info, 2 = Cafe info, 3 = Success
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Form State
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  
  const [cafeName, setCafeName] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState('Coffee Shop');

  // Success response state
  const [successData, setSuccessData] = useState<{
    cafeCode: string;
    cafeName: string;
    ownerUsername: string;
  } | null>(null);

  // Validations
  const validateStep1 = () => {
    if (!ownerName.trim()) return 'يرجى إدخال اسم المالك';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'يرجى إدخال بريد إلكتروني صالح';
    if (!phone.trim()) return 'يرجى إدخال رقم الهاتف';
    if (password.length < 8) return 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
    return null;
  };

  const validateStep2 = () => {
    if (!cafeName.trim()) return 'يرجى إدخال اسم الكافيه';
    if (!address.trim()) return 'يرجى إدخال عنوان الكافيه';
    if (!category) return 'يرجى اختيار تصنيف الكافيه';
    return null;
  };

  const handleNextStep = () => {
    setError(null);
    const err = validateStep1();
    if (err) {
      setError(err);
      return;
    }
    setStep(2);
  };

  const handlePrevStep = () => {
    setError(null);
    setStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const err = validateStep2();
    if (err) {
      setError(err);
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/register', {
        ownerName,
        email,
        phone,
        password,
        cafeName,
        address,
        category,
      });

      setSuccessData(response.data);
      setStep(3);
    } catch (err: any) {
      const apiMsg = err.response?.data?.message;
      setError(Array.isArray(apiMsg) ? apiMsg[0] : apiMsg || 'حدث خطأ أثناء التسجيل. يرجى المحاولة مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (!successData?.cafeCode) return;
    navigator.clipboard.writeText(successData.cafeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 font-sans" dir="rtl">
      {/* Background decoration */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-amber-500/5 rounded-full blur-[80px] pointer-events-none"></div>

      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative z-10">
        
        {/* Header / Logo */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 font-bold shadow-lg shadow-amber-500/10">
            <Coffee className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">تسجيل كافيه جديد</h1>
          <p className="text-sm text-slate-400 mt-2">انضم إلى منصة سونيك وأدِر عملك باحترافية</p>
        </div>

        {/* Stepper Status Bar */}
        {step < 3 && (
          <div className="flex items-center justify-between mb-8 px-4">
            <div className="flex flex-col items-center gap-1">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= 1 ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                1
              </div>
              <span className={`text-[11px] font-semibold ${step >= 1 ? 'text-amber-400' : 'text-slate-500'}`}>حساب المالك</span>
            </div>
            <div className={`flex-1 h-[2px] mx-2 transition-all ${step >= 2 ? 'bg-amber-500' : 'bg-slate-800'}`}></div>
            <div className="flex flex-col items-center gap-1">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= 2 ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                2
              </div>
              <span className={`text-[11px] font-semibold ${step >= 2 ? 'text-amber-400' : 'text-slate-500'}`}>تفاصيل الكافيه</span>
            </div>
          </div>
        )}

        {/* Step 1: Owner Info Form */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-400 mb-2">
              <User className="h-4 w-4" /> معلومات حساب المالك الرئيسي
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">اسم المالك</label>
                <input
                  type="text"
                  placeholder="الاسم الكامل للمالك"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">البريد الإلكتروني</label>
                <input
                  type="email"
                  placeholder="owner@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">رقم الهاتف</label>
                <input
                  type="text"
                  placeholder="مثال: 01012345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">كلمة المرور</label>
                <input
                  type="password"
                  placeholder="8 أحرف أو أكثر"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all text-left"
                  dir="ltr"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-900/60 text-red-400 text-xs text-center font-medium">
                {error}
              </div>
            )}

            <button
              onClick={handleNextStep}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-3.5 text-sm font-bold text-slate-950 transition-all active:scale-[0.98]"
            >
              <span>المتابعة لتفاصيل الكافيه</span>
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Step 2: Cafe Info Form */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-400 mb-2">
              <Store className="h-4 w-4" /> معلومات الكافيه والفرع الرئيسي
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">اسم الكافيه</label>
                <input
                  type="text"
                  placeholder="اسم الكافيه التجاري"
                  value={cafeName}
                  onChange={(e) => setCafeName(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">عنوان الفرع الرئيسي</label>
                <input
                  type="text"
                  placeholder="مثال: القاهرة، مصر الجديدة"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">تصنيف الكافيه</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all"
                >
                  <option value="Coffee Shop">مقهى / Coffee Shop</option>
                  <option value="Bakery">مخبز وحلويات / Bakery</option>
                  <option value="Restaurant">مطعم وكافيه / Restaurant</option>
                  <option value="Specialty Coffee">قهوة مختصة / Specialty Coffee</option>
                </select>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-900/60 text-red-400 text-xs text-center font-medium">
                {error}
              </div>
            )}

            <div className="flex gap-4">
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={loading}
                className="w-1/3 flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-3.5 text-sm font-bold text-slate-300 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <ArrowRight className="h-4 w-4" />
                <span>السابق</span>
              </button>
              
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-3.5 text-sm font-bold text-slate-950 transition-all active:scale-[0.98] disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>جاري إنشاء الحساب...</span>
                  </>
                ) : (
                  <span>إنشاء الحساب الآن</span>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Success Screen */}
        {step === 3 && successData && (
          <div className="space-y-6 text-center animate-fade-in">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-950 border border-emerald-500 text-emerald-400 mb-4">
              <CheckCircle className="h-8 w-8" />
            </div>
            
            <div>
              <h2 className="text-xl font-extrabold text-white">تم إنشاء حساب الكافيه بنجاح!</h2>
              <p className="text-sm text-slate-400 mt-2">يرجى حفظ كود الكافيه التالي للدخول به لاحقاً</p>
            </div>

            {/* Café Code Box */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-amber-500/10 via-amber-500 to-amber-500/10"></div>
              
              <span className="text-[10px] text-slate-500 font-semibold tracking-wider block mb-2">رمز الكافيه (CAFE CODE)</span>
              <div className="flex items-center justify-center gap-3">
                <span className="text-3xl font-black text-amber-400 tracking-widest font-mono select-all">
                  {successData.cafeCode}
                </span>
                
                <button
                  onClick={handleCopyCode}
                  className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all active:scale-90"
                  title="نسخ الرمز"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Summary Details */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-right space-y-2 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>اسم الكافيه:</span>
                <span className="text-slate-200 font-bold">{successData.cafeName}</span>
              </div>
              <div className="flex justify-between">
                <span>بريد المالك (اسم المستخدم):</span>
                <span className="text-slate-200 font-bold">{successData.ownerUsername}</span>
              </div>
            </div>

            <a
              href="/auth"
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-3.5 text-sm font-bold text-slate-950 transition-all active:scale-[0.98]"
            >
              <span>الانتقال لصفحة تسجيل الدخول</span>
            </a>
          </div>
        )}

        {/* Existing account redirect link */}
        {step < 3 && (
          <div className="mt-6 text-center text-xs text-slate-500 border-t border-slate-800/60 pt-5">
            لديك حساب بالفعل؟{' '}
            <a href="/auth" className="text-amber-400 hover:text-amber-300 font-semibold transition-colors">
              سجل الدخول من هنا
            </a>
          </div>
        )}

      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  AlertCircle, ArrowLeft, BarChart3, BellRing, Bot, CheckCircle2, Coffee,
  Eye, EyeOff, KeyRound, LineChart, LoaderCircle, Lock, PackageSearch,
  ShieldCheck, Sparkles, TrendingUp, User, UsersRound,
} from 'lucide-react';
import api from '@/lib/api';
import axios from 'axios';

export default function AuthPage() {
  const [cafeCode, setCafeCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const storedCode = sessionStorage.getItem('sonic_cafe_code');
    // Preserve the existing post-registration cafe-code prefill behavior.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (storedCode) setCafeCode(storedCode);
  }, []);

  const handleLogin = async () => {
    if (!cafeCode.trim() || !username.trim() || !password.trim()) {
      setError('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        cafeCode: cafeCode.trim(),
        username: username.trim(),
        password: password.trim(),
      };

      const { data } = await api.post('/auth/login-tenant', payload, { withCredentials: true });

      if (data.accessToken) sessionStorage.setItem('sonic_token', data.accessToken);
      sessionStorage.setItem('sonic_cafe_id', data.cafeId);
      sessionStorage.setItem('sonic_cafe_name', data.cafeName);
      sessionStorage.setItem('sonic_cafe_code', data.cafeCode || cafeCode.trim());
      sessionStorage.setItem('sonic_user', JSON.stringify({
        employeeId: data.userId || '',
        name: data.name || '',
        role: (data.role || '').toUpperCase(),
        phone: data.phone || '',
      }));

      const role = (data.role || '').toUpperCase();
      const path = role === 'BARISTA' ? '/barista' : role === 'DRIVER' ? '/driver' : '/owner';
      window.location.href = path;
    } catch (err: unknown) {
      const apiMsg = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setError(apiMsg || 'خطأ في تسجيل الدخول. يرجى التحقق من الكود واسم المستخدم وكلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = 'h-12 w-full rounded-lg border border-[#E2E0DA] bg-white px-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-[#C8A37E] focus:border-[#8C6239] focus:ring-4 focus:ring-[#F4E9DD]';
  const metrics = [
    { label: 'المبيعات', value: '24,860 ج.م', icon: TrendingUp, color: 'text-emerald-300' },
    { label: 'الطلبات', value: '184', icon: Coffee, color: 'text-cyan-300' },
    { label: 'الربح', value: '8,420 ج.م', icon: LineChart, color: 'text-blue-300' },
    { label: 'العملاء', value: '+32', icon: UsersRound, color: 'text-amber-300' },
  ];

  return (
    <main className="min-h-screen bg-[#F7F7F5] p-3 text-slate-950 sm:p-5 lg:p-6" dir="rtl">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1480px] overflow-hidden rounded-lg border border-[#E2E0DA] bg-white shadow-[0_24px_70px_rgba(33,24,22,0.10)] sm:min-h-[calc(100vh-2.5rem)] lg:grid-cols-[minmax(430px,0.82fr)_minmax(560px,1.18fr)]">
        <section className="flex items-center justify-center px-5 py-10 sm:px-10 lg:px-14 xl:px-20">
          <div className="w-full max-w-[470px] animate-in">
            <div className="mb-9 flex items-center gap-3">
              <Image src="/sonex-logo.png" alt="Sonex" width={44} height={44} className="h-11 w-11 rounded-lg border border-[#E2E0DA] bg-white object-cover" priority />
              <div>
                <div className="text-xl font-black">Sonex</div>
                <div className="text-xs font-medium text-slate-500">Cafe operating system</div>
              </div>
            </div>

            <div className="mb-8">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#F4E9DD] px-3 py-1.5 text-xs font-bold text-[#6F4D2D]">
                <ShieldCheck className="h-3.5 w-3.5" /> دخول آمن إلى مساحة العمل
              </div>
              <h1 className="text-3xl font-black leading-tight sm:text-4xl">تسجيل الدخول إلى Sonex</h1>
              <p className="mt-3 max-w-md text-sm leading-7 text-slate-500">نظام ذكي وحديث لإدارة الكافيهات والتحكم الكامل في التشغيل من مكان واحد.</p>
            </div>

            <form onSubmit={(event) => { event.preventDefault(); handleLogin(); }} className="space-y-5">
              <Field label="رمز الكافيه" id="cafe-code" icon={<KeyRound className="h-4 w-4" />}>
                <input id="cafe-code" type="text" required value={cafeCode} onChange={(event) => setCafeCode(event.target.value)} placeholder="COF-12345" className={`${fieldClass} font-mono`} dir="ltr" autoComplete="organization" />
              </Field>

              <Field label="اسم المستخدم أو البريد الإلكتروني أو الهاتف" id="username" icon={<User className="h-4 w-4" />}>
                <input id="username" type="text" required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="أدخل بيانات حسابك" className={fieldClass} dir="ltr" autoComplete="username" />
              </Field>

              <Field label="كلمة المرور" id="password" icon={<Lock className="h-4 w-4" />}>
                <input id="password" type={showPassword ? 'text' : 'password'} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" className={`${fieldClass} pl-12`} dir="ltr" autoComplete="current-password" />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </Field>

              {error && (
                <div role="alert" className="animate-in flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm font-medium text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
                </div>
              )}

              <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#8C6239] px-4 text-sm font-extrabold text-white shadow-lg shadow-[#8C6239]/20 transition hover:bg-[#6F4D2D] hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-[#F4E9DD] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[#C8A37E]">
                {loading ? <><LoaderCircle className="h-4 w-4 animate-spin" /><span>جاري تسجيل الدخول...</span></> : <><span>تسجيل الدخول</span><ArrowLeft className="h-4 w-4" /></>}
              </button>
            </form>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 text-sm">
              <a href="/register" className="font-bold text-[#8C6239] transition hover:text-[#6F4D2D]">إنشاء كافيه جديد</a>
              <a href="/landing" className="font-medium text-slate-500 transition hover:text-slate-800">العودة للرئيسية</a>
            </div>
          </div>
        </section>

        <section className="overflow-hidden bg-[#211816] px-5 py-8 text-white sm:px-10 sm:py-10 lg:px-12 xl:px-16">
          <div className="mx-auto flex h-full max-w-3xl flex-col justify-center">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-cyan-300"><Sparkles className="h-4 w-4" /> منصة تشغيل ذكية</div>
                <h2 className="max-w-xl text-2xl font-black leading-tight sm:text-3xl">تحكم كامل في الكافيه، ورؤية لحظية لكل قرار</h2>
              </div>
              <div className="hidden rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left sm:block" dir="ltr">
                <div className="text-xs text-slate-400">LIVE SYSTEM</div>
                <div className="mt-1 flex items-center gap-2 text-xs font-bold text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" />Operational</div>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4 shadow-2xl backdrop-blur sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div><div className="text-xs text-slate-400">نظرة تشغيلية مباشرة</div><div className="mt-1 text-sm font-bold">لوحة تحكم الفرع الرئيسي</div></div>
                <div className="flex gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400" /><span className="h-2 w-2 rounded-full bg-amber-300" /><span className="h-2 w-2 rounded-full bg-emerald-400" /></div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {metrics.map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="rounded-lg border border-white/10 bg-slate-900/70 p-3">
                    <Icon className={`mb-3 h-4 w-4 ${color}`} /><div className="text-[11px] text-slate-400">{label}</div><div className="mt-1 text-sm font-extrabold">{value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-[1.35fr_0.65fr]">
                <div className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
                  <div className="mb-5 flex items-center justify-between"><div><div className="text-xs text-slate-400">أداء المبيعات</div><div className="mt-1 text-sm font-bold">نمو هذا الأسبوع <span className="text-emerald-300">+18.4%</span></div></div><BarChart3 className="h-5 w-5 text-blue-300" /></div>
                  <div className="flex h-24 items-end gap-2" dir="ltr">{[38,52,46,68,59,82,91,74,96,88,100,92].map((height, index) => <span key={index} className="flex-1 rounded-t-sm bg-blue-500/80 transition hover:bg-cyan-400" style={{ height: `${height}%` }} />)}</div>
                </div>
                <div className="space-y-3">
                  <Insight icon={<Bot className="h-4 w-4" />} title="AI Waiter" text="رصد عميل متكرر واقترح مشروبه المفضل تلقائيًا." tone="cyan" />
                  <Insight icon={<PackageSearch className="h-4 w-4" />} title="تنبيه مخزون" text="حبوب الإسبريسو تقترب من الحد الأدنى." tone="amber" />
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 text-xs text-slate-300 sm:grid-cols-3">
              <Benefit icon={<CheckCircle2 className="h-4 w-4 text-emerald-300" />} text="حساب دقيق للربحية" />
              <Benefit icon={<BellRing className="h-4 w-4 text-amber-300" />} text="تنبيهات تشغيل ذكية" />
              <Benefit icon={<BarChart3 className="h-4 w-4 text-cyan-300" />} text="تحليلات لحظية واضحة" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ label, id, icon, children }: { label: string; id: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="space-y-2"><label htmlFor={id} className="block text-sm font-bold text-slate-700">{label}</label><div className="relative"><span className="absolute right-4 top-1/2 z-10 -translate-y-1/2 text-slate-400">{icon}</span>{children}</div></div>;
}

function Insight({ icon, title, text, tone }: { icon: React.ReactNode; title: string; text: string; tone: 'cyan' | 'amber' }) {
  const styles = tone === 'cyan' ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200' : 'border-amber-300/20 bg-amber-300/10 text-amber-200';
  return <div className={`rounded-lg border p-3 ${styles}`}><div className="flex items-center gap-2 text-xs font-bold">{icon}{title}</div><p className="mt-2 text-xs leading-5 text-slate-300">{text}</p></div>;
}

function Benefit({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex items-center gap-2">{icon}{text}</div>;
}

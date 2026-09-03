'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  AlertCircle, ArrowLeft, BellRing, Bot, CheckCircle2, Eye, EyeOff,
  KeyRound, LineChart, LoaderCircle, LockKeyhole, PackageSearch,
  ShieldCheck, Sparkles, TrendingUp, UserRound,
} from 'lucide-react';
import axios from 'axios';
import api from '@/lib/api';

const metrics = [
  { label: 'مبيعات اليوم', value: '24,860 ج.م', icon: TrendingUp, tone: 'text-emerald-300' },
  { label: 'طلبات نشطة', value: '18', icon: BellRing, tone: 'text-sky-300' },
  { label: 'هامش الربح', value: '34.8%', icon: LineChart, tone: 'text-amber-300' },
  { label: 'صحة التشغيل', value: '98%', icon: ShieldCheck, tone: 'text-violet-300' },
];

export default function AuthPage() {
  const [cafeCode, setCafeCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const storedCode = sessionStorage.getItem('sonic_cafe_code');
    if (storedCode) setCafeCode(storedCode);
  }, []);

  const handleLogin = async () => {
    if (!cafeCode.trim() || !username.trim() || !password.trim()) {
      setError('يرجى ملء جميع الحقول المطلوبة.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login-tenant', {
        cafeCode: cafeCode.trim(), username: username.trim(), password: password.trim(),
      }, { withCredentials: true });
      if (data.accessToken) sessionStorage.setItem('sonic_token', data.accessToken);
      sessionStorage.setItem('sonic_cafe_id', data.cafeId);
      sessionStorage.setItem('sonic_cafe_name', data.cafeName);
      sessionStorage.setItem('sonic_cafe_code', data.cafeCode || cafeCode.trim());
      sessionStorage.setItem('sonic_user', JSON.stringify({
        employeeId: data.userId || '', name: data.name || '', role: (data.role || '').toUpperCase(), phone: data.phone || '',
      }));
      const role = (data.role || '').toUpperCase();
      window.location.href = role === 'BARISTA' ? '/barista' : role === 'DRIVER' ? '/driver' : '/owner';
    } catch (err: unknown) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setError(message || 'تعذر تسجيل الدخول. تحقق من بيانات الحساب وحاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main dir="rtl" className="min-h-screen bg-[#f5f2ed] p-3 text-[#171411] sm:p-5 lg:p-7">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1540px] overflow-hidden rounded-[22px] border border-[#dfd4c8] bg-[#fffdf9] shadow-[0_28px_80px_rgba(43,28,17,0.14)] lg:min-h-[calc(100vh-3.5rem)] lg:grid-cols-[minmax(420px,.86fr)_minmax(620px,1.14fr)]">
        <section className="order-2 flex items-center justify-center px-6 py-10 sm:px-12 lg:order-1 lg:px-16 xl:px-24">
          <div className="w-full max-w-[430px]">
            <Brand />
            <div className="mb-8 mt-10">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#e7d7c5] bg-[#fbf0e5] px-3 py-1.5 text-xs font-bold text-[#80542d]">
                <ShieldCheck className="h-3.5 w-3.5" /> دخول آمن إلى مساحة العمل
              </p>
              <h1 className="text-3xl font-black leading-[1.25] tracking-normal text-[#1f1712] sm:text-[2.45rem]">تسجيل الدخول إلى Sonex</h1>
              <p className="mt-3 text-sm leading-7 text-[#74685d]">نظام تشغيل ذكي لإدارة الكافيهات، مصمم لقرارات أسرع وتشغيل أكثر وضوحًا.</p>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); void handleLogin(); }} className="space-y-5">
              <InputField id="cafe-code" label="رمز الكافيه (أو اسم الكافيه)" icon={<KeyRound className="h-4 w-4" />}>
                <input id="cafe-code" required value={cafeCode} onChange={(event) => setCafeCode(event.target.value)} placeholder="مثال: COF-12345 أو اسم الكافيه" className="auth-input" dir="auto" autoComplete="organization" />
              </InputField>
              <InputField id="username" label="اسم المستخدم أو البريد الإلكتروني أو الهاتف" icon={<UserRound className="h-4 w-4" />}>
                <input id="username" required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="أدخل بيانات حسابك" className="auth-input" dir="ltr" autoComplete="username" />
              </InputField>
              <InputField id="password" label="كلمة المرور" icon={<LockKeyhole className="h-4 w-4" />}>
                <input id="password" required value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} placeholder="••••••••" className="auth-input pl-12" dir="ltr" autoComplete="current-password" />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute left-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-[#8d8175] transition hover:bg-[#f1e8df] hover:text-[#4c3421] focus:outline-none focus:ring-2 focus:ring-[#c99461]" aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </InputField>
              {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-medium leading-6 text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
              <button type="submit" disabled={loading} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#6f4525] px-5 text-sm font-extrabold text-white shadow-[0_12px_24px_rgba(111,69,37,.24)] transition hover:bg-[#57341c] hover:shadow-[0_16px_30px_rgba(111,69,37,.28)] focus:outline-none focus:ring-4 focus:ring-[#ead3bc] disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? <><LoaderCircle className="h-4 w-4 animate-spin" /> جارٍ تسجيل الدخول...</> : <>تسجيل الدخول <ArrowLeft className="h-4 w-4" /></>}
              </button>
            </form>
            <div className="mt-7 flex items-center justify-between border-t border-[#eee6de] pt-5 text-sm"><a href="/register" className="font-bold text-[#8a5630] hover:text-[#57341c]">إنشاء مساحة كافيه جديدة</a><a href="/landing" className="font-medium text-[#7b7067] hover:text-[#33261e]">العودة للرئيسية</a></div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#887b70]"><Trust icon={<ShieldCheck />} text="حماية متعددة الطبقات" /><Trust icon={<Sparkles />} text="متابعة تشغيلية ذكية" /><Trust icon={<CheckCircle2 />} text="جاهز للتشغيل" /></div>
          </div>
        </section>
        <section className="order-1 overflow-hidden bg-[#18202a] px-6 py-10 text-white sm:px-10 lg:order-2 lg:px-14 xl:px-18">
          <div className="mx-auto flex h-full max-w-[670px] flex-col justify-center">
            <div className="mb-8 flex items-start justify-between gap-5"><div><p className="mb-3 flex items-center gap-2 text-xs font-bold text-[#d8b285]"><Sparkles className="h-4 w-4" /> Sonex AI Operating System</p><h2 className="max-w-xl text-3xl font-black leading-[1.3] sm:text-[2.5rem]">تحكم كامل في الكافيه، ورؤية لحظية لكل قرار</h2><p className="mt-4 max-w-lg text-sm leading-7 text-slate-300">من الطلب الأول إلى إغلاق الوردية، تضع Sonex كل ما يحتاجه فريقك في رؤية تنفيذية واحدة.</p></div><span className="hidden shrink-0 items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-200 sm:flex"><i className="h-2 w-2 rounded-full bg-emerald-300" />النظام يعمل</span></div>
            <DashboardPreview />
            <div className="mt-5 grid gap-3 sm:grid-cols-3"><Status label="طلبات مكتملة" value="186" icon={<CheckCircle2 className="text-emerald-300" />} /><Status label="تنبيهات ذكية" value="03" icon={<BellRing className="text-amber-300" />} /><Status label="استقرار النظام" value="99.98%" icon={<ShieldCheck className="text-sky-300" />} /></div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Brand() { return <div className="flex items-center gap-3"><Image src="/sonex-logo.png" alt="Sonex" width={48} height={48} className="h-12 w-12 rounded-xl border border-[#e3d8cd] bg-white object-cover" priority /><div><p className="text-xl font-black text-[#251a13]">Sonex</p><p className="text-xs font-medium text-[#8a7d70]">Cafe operating system</p></div></div>; }
function InputField({ id, label, icon, children }: { id: string; label: string; icon: React.ReactNode; children: React.ReactNode }) { return <div><label htmlFor={id} className="mb-2 block text-sm font-bold text-[#4a3a2c]">{label}</label><div className="relative"><span className="absolute right-4 top-1/2 z-10 -translate-y-1/2 text-[#9b8d80]">{icon}</span>{children}</div></div>; }
function Trust({ icon, text }: { icon: React.ReactNode; text: string }) { return <span className="flex items-center gap-1.5">{icon}{text}</span>; }
function Status({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.045] px-3 py-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[.06] [&>svg]:h-4 [&>svg]:w-4">{icon}</span><div><p className="text-[11px] text-slate-400">{label}</p><p className="mt-0.5 text-sm font-extrabold">{value}</p></div></div>; }
function DashboardPreview() { return <div className="rounded-2xl border border-white/10 bg-[#202b37] p-4 shadow-2xl shadow-black/20 sm:p-5"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs text-slate-400">Boss Café · الفرع الرئيسي</p><p className="mt-1 text-sm font-bold">لوحة القيادة التشغيلية</p></div><span className="rounded-md bg-white/[.07] px-2.5 py-1 text-[11px] font-bold text-slate-300">مباشر الآن</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{metrics.map(({ label, value, icon: Icon, tone }) => <div key={label} className="rounded-xl border border-white/[.08] bg-[#18202a] p-3"><Icon className={`mb-3 h-4 w-4 ${tone}`} /><p className="text-[11px] text-slate-400">{label}</p><p className="mt-1 text-sm font-extrabold">{value}</p></div>)}</div><div className="mt-3 grid gap-3 sm:grid-cols-[1.3fr_.7fr]"><div className="rounded-xl border border-white/[.08] bg-[#18202a] p-4"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs text-slate-400">اتجاه المبيعات</p><p className="mt-1 text-sm font-bold">+18.4% هذا الأسبوع</p></div><LineChart className="h-5 w-5 text-[#d8b285]" /></div><div className="flex h-20 items-end gap-1.5" dir="ltr">{[36,52,44,65,58,77,70,91,84,100,92,96].map((height, index) => <span key={index} className="flex-1 rounded-t-sm bg-gradient-to-t from-[#9c673d] to-[#e5bd8a]" style={{ height: `${height}%` }} />)}</div></div><div className="space-y-3"><Insight icon={<Bot />} title="AI Waiter" text="اقتراح شخصي لعميل متكرر" tone="sky" /><Insight icon={<PackageSearch />} title="تنبيه مخزون" text="حبوب الإسبريسو تقترب من الحد الأدنى" tone="amber" /></div></div></div>; }
function Insight({ icon, title, text, tone }: { icon: React.ReactNode; title: string; text: string; tone: 'sky' | 'amber' }) { const colors = tone === 'sky' ? 'border-sky-300/15 bg-sky-400/[.07] text-sky-200' : 'border-amber-300/15 bg-amber-300/[.07] text-amber-200'; return <div className={`rounded-xl border p-3 ${colors}`}><div className="flex items-center gap-2 text-xs font-bold">{icon}{title}</div><p className="mt-2 text-[11px] leading-5 text-slate-300">{text}</p></div>; }

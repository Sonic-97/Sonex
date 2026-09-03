'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import api from '@/lib/api';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Coffee,
  Copy,
  Loader2,
  MapPin,
  ShieldCheck,
  Sparkles,
  Store,
  User,
} from 'lucide-react';

type SuccessData = { cafeCode: string; cafeName: string; ownerUsername: string };

export default function RegisterWizardPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [cafeName, setCafeName] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState('Coffee Shop');
  const [successData, setSuccessData] = useState<SuccessData | null>(null);

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
    const validationError = validateStep1();
    if (validationError) return setError(validationError);
    setStep(2);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const validationError = validateStep2();
    if (validationError) return setError(validationError);

    setLoading(true);
    try {
      const response = await api.post<SuccessData>('/auth/register', { ownerName, email, phone, password, cafeName, address, category });
      setSuccessData(response.data);
      setStep(3);
    } catch (caughtError: unknown) {
      const responseError = caughtError as { response?: { data?: { message?: string | string[] } } };
      const message = responseError.response?.data?.message;
      setError(Array.isArray(message) ? message[0] : message || 'حدث خطأ أثناء التسجيل. يرجى المحاولة مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!successData?.cafeCode) return;
    await navigator.clipboard.writeText(successData.cafeCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main dir="rtl" className="min-h-screen overflow-hidden bg-[#f3eadc] text-[#27180f]">
      <div className="relative isolate min-h-screen px-5 py-7 sm:px-8 lg:flex lg:items-stretch lg:p-0">
        <aside className="relative hidden overflow-hidden bg-[#203d3a] px-12 py-10 text-[#fff8ed] lg:flex lg:w-[44%] lg:flex-col lg:justify-between xl:px-20">
          <div className="pointer-events-none absolute -left-28 top-24 h-80 w-80 rounded-full border-[38px] border-[#d47b42]/20" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-tl-full bg-[#80966d]/20" />
          <Brand light />
          <div className="relative z-10 my-12 max-w-lg">
            <p className="sonex-note inline-flex rotate-[-2deg] items-center gap-2 border-b-2 border-dashed border-[#edb87b] pb-1 text-sm text-[#f0bd80]"><Sparkles className="h-4 w-4" /> أول مشهد من يومك التشغيلي</p>
            <h1 className="mt-5 text-4xl font-black leading-[1.2] xl:text-5xl">ابدأ الكافيه،<br /><span className="text-[#edb87b]">ودع Sonex يرتب اليوم.</span></h1>
            <p className="mt-6 max-w-md text-base leading-8 text-[#d4ddd0]">مساحة واحدة لفريقك، طلباتك، وقراراتك. التسجيل يأخذ دقيقتين، والبداية تبقى واضحة من أول يوم.</p>
            <div className="mt-9 space-y-3">
              <TrustLine text="مساحة عمل مستقلة وآمنة لكافيهك" />
              <TrustLine text="إعداد بسيط، دون تفاصيل تقنية معقدة" />
              <TrustLine text="من الطلب إلى الإدارة في نظام واحد" />
            </div>
          </div>
          <div className="relative z-10 rounded-2xl border border-white/10 bg-white/[.06] p-4 backdrop-blur-sm"><p className="text-xs text-[#c7d3c3]">بعد إنشاء الحساب</p><div className="mt-3 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e2a165] text-[#2d1a10]"><Coffee className="h-5 w-5" /></span><p className="text-sm font-bold">نجهز لوحة تشغيل كافيهك الأولى.</p></div></div>
        </aside>

        <section className="relative mx-auto flex w-full max-w-xl flex-col py-5 lg:max-w-none lg:flex-1 lg:justify-center lg:px-16 xl:px-24">
          <div className="absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(circle_at_70%_12%,rgba(208,126,65,.20),transparent_35%)] lg:hidden" />
          <div className="mb-9 flex items-center justify-between lg:hidden"><Brand /><Link href="/auth" className="text-sm font-bold text-[#6b4935]">دخول الفريق</Link></div>
          <div className="mx-auto w-full max-w-[510px]">
            <div className="flex items-start justify-between gap-4"><div><p className="sonex-note text-sm text-[#a6502e]">إعداد مساحة عمل جديدة</p><h2 className="mt-2 text-3xl font-black sm:text-4xl">{step === 3 ? 'أصبح كل شيء جاهزًا.' : 'لنبدأ من صاحب القرار.'}</h2><p className="mt-3 text-sm leading-7 text-[#756458]">{step === 1 ? 'أدخل بيانات الحساب الأساسي. ستنتقل بعدها إلى تفاصيل الكافيه.' : step === 2 ? 'آخر تفاصيل بسيطة لنجهز مساحة عملك الأولى.' : 'احتفظ برمز الكافيه؛ ستحتاجه مع فريقك عند تسجيل الدخول.'}</p></div><span className="hidden h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f0dfc9] text-[#9b4c2b] sm:grid">{step === 1 ? <User className="h-5 w-5" /> : step === 2 ? <Store className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}</span></div>

            {step < 3 && <Progress step={step} />}

            <div className="mt-8 border border-[#d9c7b4] bg-[#fffaf2]/85 p-5 shadow-[0_20px_50px_rgba(75,41,20,.10)] backdrop-blur sm:p-7">
              {step === 1 && <OwnerForm ownerName={ownerName} email={email} phone={phone} password={password} setOwnerName={setOwnerName} setEmail={setEmail} setPhone={setPhone} setPassword={setPassword} onNext={handleNextStep} error={error} />}
              {step === 2 && <CafeForm cafeName={cafeName} address={address} category={category} setCafeName={setCafeName} setAddress={setAddress} setCategory={setCategory} onBack={() => { setError(null); setStep(1); }} onSubmit={handleSubmit} loading={loading} error={error} />}
              {step === 3 && successData && <SuccessPanel successData={successData} copied={copied} onCopy={handleCopyCode} />}
            </div>
            {step < 3 && <p className="mt-6 text-center text-xs text-[#776558]">لديك حساب بالفعل؟ <Link href="/auth" className="font-extrabold text-[#a6502e] hover:text-[#7e3d23]">سجل الدخول من هنا</Link></p>}
          </div>
        </section>
      </div>
    </main>
  );
}

function OwnerForm(props: { ownerName: string; email: string; phone: string; password: string; setOwnerName: (value: string) => void; setEmail: (value: string) => void; setPhone: (value: string) => void; setPassword: (value: string) => void; onNext: () => void; error: string | null }) {
  return <div className="space-y-5"><FormHeader icon={User} title="حساب المالك الرئيسي" copy="هذا الحساب يدير الكافيه وفريقه." /><Field label="اسم المالك"><input className="auth-input" placeholder="الاسم الكامل للمالك" value={props.ownerName} onChange={(event) => props.setOwnerName(event.target.value)} /></Field><Field label="البريد الإلكتروني"><input className="auth-input text-left" dir="ltr" type="email" placeholder="owner@example.com" value={props.email} onChange={(event) => props.setEmail(event.target.value)} /></Field><Field label="رقم الهاتف"><input className="auth-input text-left" dir="ltr" placeholder="مثال: 01012345678" value={props.phone} onChange={(event) => props.setPhone(event.target.value)} /></Field><Field label="كلمة المرور"><input className="auth-input text-left" dir="ltr" type="password" placeholder="8 أحرف أو أكثر" value={props.password} onChange={(event) => props.setPassword(event.target.value)} /></Field><ErrorNotice error={props.error} /><button type="button" onClick={props.onNext} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#bb6136] px-4 py-3.5 text-sm font-extrabold text-white shadow-[0_12px_22px_rgba(166,80,46,.2)] transition hover:bg-[#984726] active:scale-[.99]">المتابعة لتفاصيل الكافيه <ArrowLeft className="h-4 w-4" /></button></div>;
}

function CafeForm(props: { cafeName: string; address: string; category: string; setCafeName: (value: string) => void; setAddress: (value: string) => void; setCategory: (value: string) => void; onBack: () => void; onSubmit: (event: React.FormEvent) => void; loading: boolean; error: string | null }) {
  return <form onSubmit={props.onSubmit} className="space-y-5"><FormHeader icon={Store} title="تفاصيل الكافيه والفرع الرئيسي" copy="سنستخدمها لتهيئة مساحة تشغيلك." /><Field label="اسم الكافيه"><input className="auth-input" placeholder="اسم الكافيه التجاري" value={props.cafeName} onChange={(event) => props.setCafeName(event.target.value)} /></Field><Field label="عنوان الفرع الرئيسي"><div className="relative"><MapPin className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9d8979]" /><input className="auth-input pr-10" placeholder="مثال: القاهرة الجديدة، مصر" value={props.address} onChange={(event) => props.setAddress(event.target.value)} /></div></Field><Field label="تصنيف الكافيه"><select className="auth-input appearance-none" value={props.category} onChange={(event) => props.setCategory(event.target.value)}><option value="Coffee Shop">مقهى / Coffee Shop</option><option value="Bakery">مخبز وحلويات / Bakery</option><option value="Restaurant">مطعم وكافيه / Restaurant</option><option value="Specialty Coffee">قهوة مختصة / Specialty Coffee</option></select></Field><ErrorNotice error={props.error} /><div className="flex gap-3"><button type="button" disabled={props.loading} onClick={props.onBack} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#cbb7a3] px-5 text-sm font-extrabold text-[#654734] transition hover:bg-[#f4e9db] disabled:opacity-50"><ArrowRight className="h-4 w-4" /> السابق</button><button type="submit" disabled={props.loading} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#bb6136] px-4 text-sm font-extrabold text-white shadow-[0_12px_22px_rgba(166,80,46,.2)] transition hover:bg-[#984726] disabled:cursor-not-allowed disabled:opacity-75">{props.loading ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري إنشاء الحساب...</> : <>إنشاء الحساب الآن <ArrowLeft className="h-4 w-4" /></>}</button></div></form>;
}

function SuccessPanel({ successData, copied, onCopy }: { successData: SuccessData; copied: boolean; onCopy: () => Promise<void> }) {
  return <div className="space-y-6 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#e0eddb] text-[#3d7250]"><CheckCircle2 className="h-8 w-8" /></span><div><h3 className="text-xl font-black">تم إنشاء مساحة الكافيه بنجاح.</h3><p className="mt-2 text-sm leading-6 text-[#756458]">احتفظ بهذا الرمز، فهو مفتاح الدخول لمساحة كافيهك.</p></div><div className="border border-dashed border-[#c78250] bg-[#f7ead9] p-5"><p className="text-[10px] font-extrabold text-[#8e654a]">رمز الكافيه</p><div className="mt-2 flex items-center justify-center gap-3"><code dir="ltr" className="text-3xl font-black tracking-[.18em] text-[#9f4c2a]">{successData.cafeCode}</code><button type="button" onClick={() => void onCopy()} title="نسخ الرمز" className="grid h-9 w-9 place-items-center rounded-lg border border-[#caa17e] bg-white text-[#8e4d2c] transition hover:bg-[#fff8ed]">{copied ? <Check className="h-4 w-4 text-[#3f7553]" /> : <Copy className="h-4 w-4" />}</button></div></div><div className="space-y-3 border-y border-[#e0d0bd] py-4 text-right text-xs"><Summary label="اسم الكافيه" value={successData.cafeName} /><Summary label="اسم مستخدم المالك" value={successData.ownerUsername} /></div><Link href="/auth" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#263f3d] px-4 text-sm font-extrabold text-white transition hover:bg-[#1d3230]">الانتقال لتسجيل الدخول <ArrowLeft className="h-4 w-4" /></Link></div>;
}

function Progress({ step }: { step: number }) { return <div className="mt-8"><div className="flex items-center justify-between"><ProgressLabel active label="حساب المالك" no="1" /><div className={`mx-3 h-px flex-1 ${step === 2 ? 'bg-[#ba673b]' : 'bg-[#d9c6b2]'}`} /><ProgressLabel active={step === 2} label="تفاصيل الكافيه" no="2" /></div></div>; }
function ProgressLabel({ active, label, no }: { active: boolean; label: string; no: string }) { return <div className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black ${active ? 'bg-[#bb6136] text-white' : 'bg-[#e4d6c6] text-[#8a7564]'}`}>{no}</span><span className={`text-[11px] font-extrabold ${active ? 'text-[#914623]' : 'text-[#927e6d]'}`}>{label}</span></div>; }
function FormHeader({ icon: Icon, title, copy }: { icon: typeof User; title: string; copy: string }) { return <div className="flex items-center gap-3 border-b border-[#e4d5c4] pb-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f0dfc9] text-[#a6502e]"><Icon className="h-4 w-4" /></span><div><h3 className="text-sm font-black">{title}</h3><p className="mt-0.5 text-[11px] text-[#8a7869]">{copy}</p></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-xs font-extrabold text-[#594536]">{label}</span>{children}</label>; }
function ErrorNotice({ error }: { error: string | null }) { return error ? <div role="alert" className="border border-[#d59580] bg-[#fff0ea] px-3 py-3 text-center text-xs font-bold text-[#a33c25]">{error}</div> : null; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4"><span className="text-[#8b7667]">{label}</span><span className="font-bold text-[#49362a]" dir="auto">{value}</span></div>; }
function TrustLine({ text }: { text: string }) { return <p className="flex items-center gap-2 text-sm text-[#e5ebdc]"><Check className="h-4 w-4 text-[#efba78]" /> {text}</p>; }
function Brand({ light = false }: { light?: boolean }) { return <div className="flex items-center gap-2.5"><Image src="/sonex-logo.png" alt="Sonex" width={38} height={38} className="h-9 w-9 rounded-xl object-cover" priority /><span className={`text-lg font-black ${light ? 'text-white' : ''}`}>Sonex</span></div>; }

'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpLeft,
  BarChart3,
  BellRing,
  Bot,
  Check,
  ChefHat,
  Coffee,
  MapPin,
  MessageCircle,
  PackageSearch,
  Route,
  ShieldCheck,
  Sparkles,
  Truck,
  type LucideIcon,
} from 'lucide-react';

type StoryStep = {
  number: string;
  eyebrow: string;
  title: string;
  copy: string;
  icon: LucideIcon;
  tone: 'olive' | 'amber' | 'teal' | 'ink' | 'paper';
};

const storySteps: StoryStep[] = [
  {
    number: '01',
    eyebrow: 'من هاتف العميل',
    title: 'طلب واضح، بلا مكالمات ضائعة',
    copy: 'رسالة واتساب تتحول إلى طلب منظم يعرفه الفريق فورًا.',
    icon: MessageCircle,
    tone: 'olive',
  },
  {
    number: '02',
    eyebrow: 'عند نقطة البيع',
    title: 'الطلب يأخذ مكانه الصحيح',
    copy: 'القناة، الوقت، الحالة، والعميل في سياق تشغيلي واحد.',
    icon: Coffee,
    tone: 'amber',
  },
  {
    number: '03',
    eyebrow: 'أمام الباريستا',
    title: 'تحضير هادئ وواضح',
    copy: 'شاشة عمل لا تترك سؤالًا مفتوحًا أثناء ضغط الذروة.',
    icon: ChefHat,
    tone: 'teal',
  },
  {
    number: '04',
    eyebrow: 'في الطريق',
    title: 'توصيل له موقع وحالة',
    copy: 'السائق يرى ما يحتاجه فقط، والعميل يعرف ما يحدث.',
    icon: Truck,
    tone: 'ink',
  },
  {
    number: '05',
    eyebrow: 'لدى المالك',
    title: 'كل لحظة تصبح قرارًا',
    copy: 'لوحة تنفيذية تربط الإيراد، الطلبات، والتنبيهات في نظرة واحدة.',
    icon: BarChart3,
    tone: 'paper',
  },
];

const proofNotes = [
  ['طلبات اليوم', '186', 'olive'],
  ['متوسط التحضير', '4:18', 'amber'],
  ['صحة التشغيل', 'مستقرة', 'teal'],
] as const;

export default function LandingPage() {
  return (
    <main dir="rtl" className="min-h-screen overflow-hidden bg-[#f3eadc] text-[#25170f] selection:bg-[#d79451]/35">
      <header className="sticky top-0 z-50 border-b border-[#2a180e]/10 bg-[#f3eadc]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1320px] items-center justify-between px-5 lg:px-8">
          <Brand />
          <nav className="hidden items-center gap-7 text-sm font-bold text-[#62554a] md:flex">
            <a href="#journey" className="transition hover:text-[#a6502e]">رحلة الطلب</a>
            <a href="#control-room" className="transition hover:text-[#a6502e]">غرفة المالك</a>
            <a href="#screens" className="transition hover:text-[#a6502e]">شاشات Sonex</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/auth" className="hidden text-sm font-extrabold text-[#5b3520] transition hover:text-[#a6502e] sm:block">دخول الفريق</Link>
            <Link href="/register" className="rounded-full bg-[#263f3d] px-5 py-3 text-sm font-extrabold text-[#fff7eb] shadow-[0_10px_22px_rgba(38,63,61,.18)] transition hover:-translate-y-0.5 hover:bg-[#1d3230]">ابدأ مع Sonex</Link>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden px-5 pb-14 pt-12 sm:pb-20 sm:pt-20 lg:pb-24 lg:pt-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(circle_at_74%_18%,rgba(208,126,65,.24),transparent_24%),radial-gradient(circle_at_28%_45%,rgba(76,113,91,.18),transparent_26%)]" />
        <div className="mx-auto grid max-w-[1320px] gap-10 lg:grid-cols-[.84fr_1.16fr] lg:items-center lg:px-8">
          <div className="relative z-10">
            <p className="sonex-note mb-5 inline-flex rotate-[-2deg] items-center gap-2 border-b-2 border-dashed border-[#ad6438] pb-1 text-sm text-[#8e4e2c]">
              <Sparkles className="h-4 w-4" /> ملاحظة من أرض التشغيل
            </p>
            <h1 className="max-w-[640px] text-4xl font-black leading-[1.16] text-[#24150d] sm:text-5xl lg:text-[4.15rem]">
              الكافيه ليس شاشات كثيرة.<br />
              <span className="text-[#a6502e]">إنه يوم كامل يجب أن يسير.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-[#685a4d] sm:text-lg">
              Sonex هو نظام تشغيل ذكي يجمع الطلب، التحضير، التوصيل، والمشهد التنفيذي في قصة واحدة يفهمها كل شخص في الكافيه.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#bb6136] px-7 py-4 text-sm font-extrabold text-white shadow-[0_14px_28px_rgba(166,80,46,.25)] transition hover:-translate-y-0.5 hover:bg-[#984726]">
                احجز تجربة Boss Cafe <ArrowLeft className="h-4 w-4" />
              </Link>
              <a href="#journey" className="inline-flex items-center justify-center rounded-full border border-[#55321f]/25 px-7 py-4 text-sm font-extrabold text-[#51311f] transition hover:border-[#a6502e] hover:bg-[#fff8ed]">شاهد الرحلة الحقيقية</a>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-5 gap-y-3 text-xs font-bold text-[#66574c]">
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#3e7567]" /> طلبات من كل القنوات</span>
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#3e7567]" /> رؤية لحظية للمالك</span>
            </div>
          </div>
          <HeroStoryboard />
        </div>
      </section>

      <section className="border-y border-[#2a180e]/10 bg-[#efe2cf] px-5 py-5">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-5 lg:px-8">
          <p className="sonex-note text-sm text-[#77523a]">لقطة مباشرة من تشغيل Boss Cafe</p>
          <div className="flex flex-wrap gap-3">
            {proofNotes.map(([label, value, tone]) => <ProofNote key={label} label={label} value={value} tone={tone} />)}
          </div>
        </div>
      </section>

      <section id="journey" className="relative px-5 py-20 lg:py-28">
        <div className="mx-auto max-w-[1320px] lg:px-8">
          <EditorialHeading note="رحلة واحدة، تظهر للجميع" title="من أول رسالة إلى آخر قرار، لا يختفي أي تفصيل." copy="بدل أن تنتقل البيانات بين أشخاص وتطبيقات، تنتقل القصة نفسها عبر Sonex." />
          <div className="relative mt-14 space-y-8 before:absolute before:bottom-12 before:right-[29px] before:top-12 before:border-r-2 before:border-dashed before:border-[#bd7c4e]/50 md:before:right-1/2">
            {storySteps.map((step, index) => <StoryRow key={step.number} step={step} reverse={index % 2 === 1} />)}
          </div>
        </div>
      </section>

      <section id="control-room" className="relative overflow-hidden bg-[#203b39] px-5 py-20 text-[#fff7eb] lg:py-28">
        <div className="pointer-events-none absolute left-0 top-0 h-80 w-80 rounded-full bg-[#d47c42]/20 blur-3xl" />
        <div className="mx-auto grid max-w-[1320px] gap-12 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-8">
          <OwnerBoard />
          <div className="relative z-10">
            <p className="sonex-note text-sm text-[#f0bb7b]">غرفة قرار، وليست مجرد Dashboard</p>
            <h2 className="mt-4 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">المالك لا يحتاج أرقامًا أكثر. يحتاج أن يعرف ماذا يفعل الآن.</h2>
            <p className="mt-6 max-w-xl text-base leading-8 text-[#d5d9c9]">يلخّص Sonex يوم الكافيه على هيئة إشارات قابلة للتصرف: أين يتأخر الطلب، ما الذي ينفد، وما الذي ينمو قبل أن يتحول إلى مفاجأة.</p>
            <div className="mt-8 space-y-3">
              <OwnerBullet icon={BellRing} title="تنبيه له سياق" copy="ليس رقمًا أحمر؛ بل سبب واضح وخطوة تشغيلية مقترحة." />
              <OwnerBullet icon={Bot} title="ذكاء يقرأ النمط" copy="يلتقط فرص الطلب وإشارات الضغط التشغيلي قبل أن تفوت." />
              <OwnerBullet icon={ShieldCheck} title="نظرة موثوقة" copy="الطلب والحالة والأثر المالي في مكان واحد للفريق والمالك." />
            </div>
          </div>
        </div>
      </section>

      <section id="screens" className="px-5 py-20 lg:py-28">
        <div className="mx-auto max-w-[1320px] lg:px-8">
          <EditorialHeading note="ليس تطبيقًا واحدًا يلبس الجميع" title="كل دور يرى المشهد الذي يحتاجه، في الوقت الذي يحتاجه." copy="واجهات Sonex تتغير مع مكان العمل: أمام العميل، عند البار، في الطريق، أو في غرفة الإدارة." />
          <div className="mt-12 grid gap-5 lg:grid-cols-12">
            <ScreenFrame className="lg:col-span-7" label="01 / صاحب الكافيه" title="الرؤية التنفيذية" accent="teal"><OwnerScreen /></ScreenFrame>
            <ScreenFrame className="lg:col-span-5" label="02 / الطلب" title="واتساب إلى طلب" accent="olive"><WhatsappScreen /></ScreenFrame>
            <ScreenFrame className="lg:col-span-4" label="03 / الباريستا" title="ممر التحضير" accent="amber"><BaristaScreen /></ScreenFrame>
            <ScreenFrame className="lg:col-span-4" label="04 / السائق" title="رحلة التوصيل" accent="ink"><DriverScreen /></ScreenFrame>
            <ScreenFrame className="lg:col-span-4" label="05 / الذكاء التشغيلي" title="ملخص اليوم" accent="paper"><AiScreen /></ScreenFrame>
          </div>
        </div>
      </section>

      <section className="border-y border-[#2a180e]/10 bg-[#e5d4bd] px-5 py-16 lg:py-20">
        <div className="mx-auto max-w-[1320px] lg:px-8">
          <div className="grid gap-7 md:grid-cols-3">
            <EditorialReason no="A" title="أقل ضياعًا" copy="كل طلب له صاحب، حالة، ومسار. لا يعتمد العمل على ذاكرة أحد." />
            <EditorialReason no="B" title="أكثر هدوءًا" copy="تصل كل معلومة إلى الشخص المناسب بدل أن تصنع ضوضاء للجميع." />
            <EditorialReason no="C" title="قرارات أذكى" copy="تتحول حركة اليوم إلى رؤية واضحة تساعدك على تكرار ما نجح." />
          </div>
        </div>
      </section>

      <section className="px-5 py-20 lg:py-28">
        <div className="mx-auto max-w-[1320px] overflow-hidden rounded-[2rem] bg-[#311d13] px-6 py-12 text-[#fff7eb] shadow-[0_30px_70px_rgba(54,28,13,.24)] sm:px-12 sm:py-16 lg:px-20">
          <div className="relative max-w-3xl">
            <div className="pointer-events-none absolute -right-24 -top-32 h-56 w-56 rounded-full border-[20px] border-[#cf7a42]/30" />
            <p className="sonex-note text-sm text-[#efbd82]">Boss Cafe يبدأ من اللحظة التالية</p>
            <h2 className="mt-4 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">اجعل يوم الكافيه مفهومًا للجميع، من أول فنجان إلى آخر تقرير.</h2>
            <p className="mt-5 max-w-2xl leading-8 text-[#dcc8b3]">ابدأ بمشهد تشغيلي واضح اليوم، وابنِ عليه نموًا أكثر ثباتًا غدًا.</p>
            <Link href="/register" className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#e09a5c] px-7 py-4 text-sm font-extrabold text-[#2e190d] transition hover:-translate-y-0.5 hover:bg-[#f1c28e]">ابدأ مساحة الكافيه <ArrowLeft className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#2a180e]/10 px-5 py-8">
        <div className="mx-auto flex max-w-[1320px] flex-col items-center justify-between gap-4 text-xs text-[#756357] sm:flex-row lg:px-8">
          <Brand />
          <p>© {new Date().getFullYear()} Sonex. نظام تشغيل ذكي للكافيهات.</p>
        </div>
      </footer>
    </main>
  );
}

function Brand() {
  return <div className="flex items-center gap-2.5"><Image src="/sonex-logo.png" alt="Sonex" width={38} height={38} className="h-9 w-9 rounded-xl object-cover" priority /><span className="text-lg font-black tracking-normal">Sonex</span></div>;
}

function HeroStoryboard() {
  return (
    <div className="relative mx-auto h-[500px] w-full max-w-[700px] sm:h-[560px]" aria-label="رحلة تشغيل Sonex">
      <div className="absolute left-[7%] top-[9%] h-36 w-36 rounded-full border-[14px] border-[#c7733f] bg-[radial-gradient(circle_at_38%_35%,#f6d5a0_0_7%,#ba6037_8%_22%,#6b321d_23%_42%,#e6b87d_43%_58%,#5a2919_59%_100%)] shadow-[0_18px_34px_rgba(84,38,19,.24)] sm:h-44 sm:w-44" />
      <span className="sonex-note absolute left-[3%] top-[42%] rotate-[-8deg] text-xs text-[#914c2b]">قهوة تُصنع الآن</span>
      <div className="absolute right-[5%] top-[1%] w-[45%] rotate-[3deg] rounded-[1.7rem] border border-[#536b58]/25 bg-[#fff8ed] p-3 shadow-[0_20px_44px_rgba(63,41,23,.16)] sm:p-4">
        <div className="flex items-center gap-2 border-b border-[#decdb8] pb-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#537455] text-white"><MessageCircle className="h-4 w-4" /></span><div className="text-[10px]"><b className="block text-[#2a4f37]">رسالة جديدة</b><span className="text-[#798173]">عميلة تتابع الطلب</span></div></div>
        <div className="mt-3 rounded-xl rounded-tr-none bg-[#d7ebd4] p-2 text-[10px] leading-5 text-[#35573a]">لاتيه كبير وكرواسون، لو سمحت</div>
        <div className="mt-2 mr-auto w-[80%] rounded-xl rounded-tl-none bg-[#f1e8dc] p-2 text-[10px] text-[#625345]">تم التأكيد. التحضير بدأ الآن.</div>
      </div>
      <div className="absolute right-[20%] top-[36%] z-10 w-[48%] -rotate-2 rounded-[1.5rem] border border-[#1b3b3a]/15 bg-[#243f3d] p-4 text-[#fff8ec] shadow-[0_24px_44px_rgba(30,43,36,.28)] sm:p-5">
        <div className="flex items-center justify-between text-[10px] text-[#cad8c4]"><span>Boss Cafe / التشغيل الآن</span><span className="rounded-full bg-[#9bcb91]/15 px-2 py-1 text-[#bfe5b7]">متصل</span></div>
        <p className="mt-4 text-xl font-black sm:text-2xl">24,860 <span className="text-xs font-bold text-[#d4dfd0]">ج.م</span></p>
        <p className="mt-1 text-[10px] text-[#c5d2be]">إيراد اليوم حتى الآن</p>
        <div className="mt-4 flex h-14 items-end gap-1" dir="ltr">{[31, 49, 44, 64, 58, 82, 73, 92].map((height, index) => <span key={index} className="flex-1 rounded-t bg-[#e3a265]" style={{ height: `${height}%` }} />)}</div>
      </div>
      <div className="absolute bottom-[3%] right-[5%] w-[47%] rotate-[4deg] rounded-[1.45rem] border border-[#b56a3c]/20 bg-[#f8efe0] p-3 shadow-[0_18px_36px_rgba(76,44,24,.15)] sm:p-4">
        <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#d98a51] text-white"><Truck className="h-4 w-4" /></span><div className="text-[10px]"><b className="block">السائق في الطريق</b><span className="text-[#866856]">12 دقيقة للوصول</span></div></div>
        <div className="mt-3 flex h-9 items-center"><span className="h-2 w-2 rounded-full bg-[#d47443]" /><span className="h-px flex-1 border-t border-dashed border-[#9f876f]" /><MapPin className="h-4 w-4 text-[#375e58]" /></div>
      </div>
      <div className="absolute bottom-[16%] left-[9%] rotate-[-5deg] rounded-xl border-2 border-dashed border-[#bd7849] bg-[#f7d6a6] px-3 py-2 text-[11px] font-extrabold text-[#743b22] shadow-sm">AI: ذروة متوقعة بعد 7 م</div>
      <div className="pointer-events-none absolute inset-0 -z-10">
        <i className="absolute left-[25%] top-[31%] h-24 w-32 rotate-[27deg] rounded-full border-t-2 border-dashed border-[#a65c35]" />
        <i className="absolute bottom-[29%] right-[34%] h-24 w-40 rotate-[12deg] rounded-full border-b-2 border-dashed border-[#59796d]" />
        <i className="absolute bottom-[23%] left-[30%] h-20 w-32 rotate-[-22deg] rounded-full border-t-2 border-dashed border-[#a65c35]" />
      </div>
    </div>
  );
}

function ProofNote({ label, value, tone }: { label: string; value: string; tone: 'olive' | 'amber' | 'teal' }) {
  const colors = { olive: 'border-[#80906d] bg-[#edf0e5] text-[#44533d]', amber: 'border-[#ca8d57] bg-[#faead7] text-[#8d4f2d]', teal: 'border-[#557b73] bg-[#e3efea] text-[#315a53]' };
  return <div className={`min-w-[126px] rotate-[-1deg] border border-dashed px-3 py-2 text-center ${colors[tone]}`}><p className="text-[10px] font-bold opacity-75">{label}</p><p className="mt-0.5 text-sm font-black">{value}</p></div>;
}

function EditorialHeading({ note, title, copy }: { note: string; title: string; copy: string }) {
  return <div className="max-w-3xl"><p className="sonex-note inline-block rotate-[-1deg] text-sm text-[#a6502e]">{note}</p><h2 className="mt-4 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">{title}</h2><p className="mt-5 max-w-2xl text-sm leading-8 text-[#705f52] sm:text-base">{copy}</p></div>;
}

function StoryRow({ step, reverse }: { step: StoryStep; reverse: boolean }) {
  const Icon = step.icon;
  const tones = {
    olive: 'border-[#a1ad8a] bg-[#e7ead9] text-[#3e513c]',
    amber: 'border-[#d49b69] bg-[#fae4c9] text-[#804223]',
    teal: 'border-[#7b9a91] bg-[#d9e8e2] text-[#2d5952]',
    ink: 'border-[#78645a] bg-[#e6ddd3] text-[#3a2a24]',
    paper: 'border-[#b87148] bg-[#fff8ee] text-[#8c4627]',
  };
  return (
    <article className={`relative grid gap-5 pr-16 md:grid-cols-2 md:items-center md:gap-12 md:pr-0 ${reverse ? 'md:[&>div:first-child]:order-2' : ''}`}>
      <span className="absolute right-[10px] top-7 grid h-10 w-10 place-items-center rounded-full border-2 border-[#c78250] bg-[#f3eadc] text-xs font-black text-[#9d512d] md:right-[calc(50%-20px)]">{step.number}</span>
      <div className={`rotate-[-1deg] border p-5 shadow-[0_12px_24px_rgba(67,38,19,.06)] sm:p-6 ${tones[step.tone]}`}>
        <div className="flex items-start justify-between gap-4"><div><p className="sonex-note text-xs opacity-75">{step.eyebrow}</p><h3 className="mt-2 text-xl font-black sm:text-2xl">{step.title}</h3></div><Icon className="h-6 w-6 shrink-0" /></div>
        <p className="mt-4 max-w-md text-sm leading-7 opacity-85">{step.copy}</p>
      </div>
      <div className="hidden min-h-[126px] md:block"><StorySketch tone={step.tone} /></div>
    </article>
  );
}

function StorySketch({ tone }: { tone: StoryStep['tone'] }) {
  const shade = { olive: 'bg-[#6e835f]', amber: 'bg-[#d07543]', teal: 'bg-[#326f67]', ink: 'bg-[#4b3930]', paper: 'bg-[#b7643b]' }[tone];
  return <div className="relative mx-auto h-28 max-w-[270px] rotate-[2deg] border border-dashed border-[#a98367]/60 bg-[#fff7eb]/65"><span className={`absolute bottom-5 right-5 h-8 w-8 rounded-full ${shade}`} /><span className={`absolute bottom-5 right-20 h-14 w-10 rounded-t-full ${shade} opacity-70`} /><span className={`absolute bottom-5 right-36 h-20 w-12 rounded-t-[2rem] ${shade} opacity-45`} /><i className="absolute left-6 top-6 h-9 w-24 rotate-[-10deg] rounded-full border-t-2 border-dashed border-[#a45a33]" /></div>;
}

function OwnerBoard() {
  return (
    <div className="relative rounded-[1.8rem] border border-white/15 bg-[#f4eadb] p-4 text-[#2c1b11] shadow-[0_26px_60px_rgba(6,17,16,.35)] sm:p-6">
      <div className="flex items-center justify-between border-b border-[#563a29]/15 pb-4"><div><p className="text-xs text-[#7c6758]">Boss Cafe / 10:42 ص</p><h3 className="mt-1 font-black">لوحة التشغيل اليومية</h3></div><span className="rounded-full bg-[#dfe8d7] px-3 py-1 text-[10px] font-black text-[#3b684e]">النظام مستقر</span></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-2xl bg-[#263f3d] p-4 text-[#fff7eb]"><div className="flex justify-between text-xs text-[#cbd6c9]"><span>إيراد اليوم</span><span className="text-[#b8d79d]">+18.4%</span></div><p className="mt-2 text-3xl font-black">24,860 <small className="text-xs">ج.م</small></p><div className="mt-5 flex h-20 items-end gap-1.5" dir="ltr">{[34, 51, 45, 65, 58, 83, 73, 91, 82].map((height, index) => <span key={index} className="flex-1 rounded-t bg-[#e0a165]" style={{ height: `${height}%` }} />)}</div></div>
        <div className="space-y-3"><PinnedNote icon={PackageSearch} text="الحليب يقترب من حد التنبيه" tone="amber" /><PinnedNote icon={Bot} text="فرصة عرض على الكرواسون بعد 5 م" tone="olive" /></div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><BoardMetric label="طلبات مكتملة" value="148" /><BoardMetric label="قيد التحضير" value="11" /><BoardMetric label="في التوصيل" value="07" /></div>
      <p className="sonex-note mt-5 rotate-[-1deg] text-xs text-[#a6502e]">ماذا يحتاج انتباهك الآن؟</p>
    </div>
  );
}

function PinnedNote({ icon: Icon, text, tone }: { icon: LucideIcon; text: string; tone: 'amber' | 'olive' }) {
  const styles = tone === 'amber' ? 'bg-[#fae7c8] text-[#834722]' : 'bg-[#e1ead7] text-[#3c5b3e]';
  return <div className={`relative rotate-[1deg] p-3 text-[11px] leading-5 ${styles}`}><Icon className="mb-1 h-4 w-4" />{text}<i className="absolute -top-1 right-1/2 h-2 w-2 rounded-full bg-[#c46a39]" /></div>;
}

function BoardMetric({ label, value }: { label: string; value: string }) { return <div className="border border-[#6d4a35]/15 bg-white/55 p-3"><p className="text-[10px] text-[#806c5e]">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>; }

function OwnerBullet({ icon: Icon, title, copy }: { icon: LucideIcon; title: string; copy: string }) { return <div className="flex gap-3 border-b border-white/10 pb-3 last:border-0"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e39c5c]/15 text-[#efbb7a]"><Icon className="h-4 w-4" /></span><p className="text-sm leading-6 text-[#d7dccd]"><b className="ml-1 text-[#fff7eb]">{title}</b>{copy}</p></div>; }

function ScreenFrame({ label, title, accent, className, children }: { label: string; title: string; accent: 'teal' | 'olive' | 'amber' | 'ink' | 'paper'; className: string; children: React.ReactNode }) {
  const accents = { teal: 'border-[#6a9990] bg-[#dcebe5]', olive: 'border-[#9cac81] bg-[#eceddc]', amber: 'border-[#d29a69] bg-[#fae5cc]', ink: 'border-[#6d5c52] bg-[#e4dcd4]', paper: 'border-[#b97049] bg-[#fff8ee]' };
  return <article className={`overflow-hidden border p-4 shadow-[0_14px_28px_rgba(63,38,19,.08)] transition duration-300 hover:-translate-y-1 ${accents[accent]} ${className}`}><div className="mb-4 flex items-end justify-between"><div><p className="text-[10px] font-extrabold opacity-70">{label}</p><h3 className="mt-1 text-lg font-black">{title}</h3></div><ArrowUpLeft className="h-4 w-4 opacity-60" /></div>{children}</article>;
}

function OwnerScreen() { return <div className="rounded-xl bg-[#213b39] p-4 text-white"><div className="grid grid-cols-3 gap-2 text-center text-[10px]">{[['مبيعات', '24.8k'], ['طلبات', '186'], ['نمو', '+18%']].map(([label, value]) => <div key={label} className="rounded-lg bg-white/10 p-2"><p className="text-white/60">{label}</p><b className="mt-1 block text-sm">{value}</b></div>)}</div><div className="mt-3 flex h-20 items-end gap-1.5" dir="ltr">{[24, 35, 43, 39, 59, 64, 55, 82, 74, 94].map((height, index) => <span key={index} className="flex-1 rounded-t bg-[#e5a368]" style={{ height: `${height}%` }} />)}</div></div>; }
function WhatsappScreen() { return <div className="rounded-xl border border-[#60815d]/20 bg-[#fffaf2] p-3"><div className="flex items-center gap-2 text-xs font-bold text-[#31583b]"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#4c9658] text-white"><MessageCircle className="h-4 w-4" /></span> عميلة جديدة</div><p className="mt-3 w-[82%] rounded-xl rounded-tr-none bg-[#dcefd7] p-2 text-[10px] leading-5">أريد موكا بارد وقطعة كيك.</p><p className="mr-auto mt-2 w-[74%] rounded-xl rounded-tl-none bg-[#f1e7db] p-2 text-[10px] leading-5">تم إنشاء الطلب وإرساله للتحضير.</p></div>; }
function BaristaScreen() { return <div className="space-y-2 rounded-xl bg-[#342016] p-3 text-[#fff5e7]"><p className="text-[10px] text-[#dfb184]">قيد التحضير الآن</p>{['لاتيه كبير / بدون سكر', 'قهوة اليوم / ساخن', 'كرواسون بالجبنة'].map((item, index) => <div key={item} className="flex items-center justify-between border-t border-white/10 pt-2 text-[10px]"><span>{item}</span><span className="text-[#e2a267]">0{index + 1}</span></div>)}</div>; }
function DriverScreen() { return <div className="relative h-[138px] overflow-hidden rounded-xl bg-[#d8e5d7]"><span className="absolute right-4 top-4 text-[10px] font-bold text-[#315b4c]">شارع النخيل</span><i className="absolute right-[30%] top-0 h-44 rotate-[36deg] border-r-[7px] border-[#fbf6ed]" /><i className="absolute bottom-[20%] left-0 w-full rotate-[-12deg] border-t-[7px] border-[#fbf6ed]" /><span className="absolute bottom-5 right-7 grid h-7 w-7 place-items-center rounded-full bg-[#d47141] text-white"><Truck className="h-4 w-4" /></span><span className="absolute left-7 top-7 grid h-7 w-7 place-items-center rounded-full bg-[#2f6a63] text-white"><MapPin className="h-4 w-4" /></span><span className="absolute bottom-3 left-4 rounded-full bg-[#fff9ee] px-2 py-1 text-[9px] font-bold text-[#6b5140]">12 دقيقة</span></div>; }
function AiScreen() { return <div className="rounded-xl border border-[#b66b43]/25 bg-[#fffaf3] p-3"><div className="flex items-center gap-2 text-xs font-black text-[#963f25]"><Bot className="h-4 w-4" /> ملخص Sonex AI</div><p className="mt-3 border-r-2 border-[#d58550] pr-2 text-[10px] leading-5 text-[#705649]">زادت الطلبات بعد 7 م مساءً في آخر 4 أيام. جهّز دفعة إضافية قبل الذروة.</p><div className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-[#36665b]"><Sparkles className="h-3 w-3" /> توصية قابلة للتنفيذ</div></div>; }

function EditorialReason({ no, title, copy }: { no: string; title: string; copy: string }) { return <article className="border-r-2 border-[#b6673b] pr-5"><p className="sonex-note text-sm text-[#a6502e]">{no} / لماذا Sonex</p><h3 className="mt-3 text-2xl font-black">{title}</h3><p className="mt-3 max-w-sm text-sm leading-7 text-[#6d5a4d]">{copy}</p></article>; }

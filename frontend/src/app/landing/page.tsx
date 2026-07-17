'use client';

import Link from 'next/link';
import { Coffee, ShieldCheck, Zap, BarChart3, Users, MessageSquare } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 text-slate-100 font-sans" dir="rtl">
      {/* Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-amber-500/20">
              <Coffee className="h-6 w-6" />
            </div>
            <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">
              سونيك كوفي
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <a 
              href="/auth" 
              className="text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors"
            >
              تسجيل الدخول
            </a>
            <a 
              href="/register" 
              className="rounded-lg bg-amber-500 px-4 py-2.5 text-xs md:text-sm font-bold text-slate-950 hover:bg-amber-400 transition-all hover:shadow-lg hover:shadow-amber-500/20 active:scale-95"
            >
              ابدأ الآن مجاناً
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-6 pt-20 pb-24 md:pt-32 md:pb-40 text-center overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute top-1/3 left-1/4 w-[250px] h-[250px] bg-amber-600/10 rounded-full blur-[80px] pointer-events-none"></div>
        
        <div className="max-w-4xl mx-auto relative z-10">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold mb-6 animate-pulse">
            <Zap className="h-3.5 w-3.5" /> نظام سحابي متكامل لإدارة الكافيهات
          </span>
          
          <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white leading-tight">
            أدِر كافيهك بذكاء كلي، <br />
            <span className="bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500 bg-clip-text text-transparent">
              من أي مكان وفي أي وقت
            </span>
          </h1>
          
          <p className="mt-6 text-base md:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            نظام سونيك لإدارة الكافيهات متعدد الفروع يقدم لك حلاً شاملاً لمعالجة الطلبات، تتبع المخزون، إدارة الكابتن، تتبع السائقين، والتحليلات المدعومة بالذكاء الاصطناعي مع عزل تام للبيانات.
          </p>
          
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a 
              href="/register" 
              className="w-full sm:w-auto flex items-center justify-center rounded-xl bg-amber-500 px-8 py-4 text-base font-bold text-slate-950 hover:bg-amber-400 transition-all hover:shadow-xl hover:shadow-amber-500/30 active:scale-[0.98]"
            >
              تسجيل كافيه جديد
            </a>
            <a 
              href="/auth" 
              className="w-full sm:w-auto flex items-center justify-center rounded-xl bg-slate-900 border border-slate-800 px-8 py-4 text-base font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-all active:scale-[0.98]"
            >
              تسجيل الدخول للموظفين والمالك
            </a>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-6 py-20 bg-slate-950/40 border-t border-slate-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-4xl font-extrabold text-white">مميزات استثنائية لكافيه متطور</h2>
            <p className="mt-4 text-slate-400 max-w-xl mx-auto">صُمم نظام سونيك خصيصاً ليتناسب مع احتياجات المقاهي الحديثة وزيادة الإنتاجية.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-amber-500/30 hover:bg-slate-900 transition-all duration-300 group">
              <div className="h-12 w-12 rounded-xl bg-slate-800 flex items-center justify-center text-amber-400 mb-6 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">عزل تام للمستأجرين</h3>
              <p className="text-slate-400 leading-relaxed text-sm">أمان كامل للبيانات وعزل تام لكل كافيه وفروعه ومستخدميه دون أي تداخل في قواعد البيانات.</p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-amber-500/30 hover:bg-slate-900 transition-all duration-300 group">
              <div className="h-12 w-12 rounded-xl bg-slate-800 flex items-center justify-center text-amber-400 mb-6 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                <BarChart3 className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">تقارير وتحليلات ذكية</h3>
              <p className="text-slate-400 leading-relaxed text-sm">تابع المبيعات، الأرباح، التكاليف، وأداء الموظفين والسائقين بشكل حي ومباشر عبر لوحة تحكم تفاعلية.</p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-amber-500/30 hover:bg-slate-900 transition-all duration-300 group">
              <div className="h-12 w-12 rounded-xl bg-slate-800 flex items-center justify-center text-amber-400 mb-6 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                <MessageSquare className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">تكامل مع واتساب بيزنس</h3>
              <p className="text-slate-400 leading-relaxed text-sm">مستعد للربط المباشر مع واتساب لاستقبال طلبات العملاء وإرسال الإشعارات تلقائياً لتجربة عميل متطورة.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-12 text-center text-slate-500 text-sm">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Coffee className="h-5 w-5 text-amber-500" />
            <span className="font-bold text-slate-400">سونيك كوفي</span>
          </div>
          <p>© {new Date().getFullYear()} سونيك لإدارة الكافيهات. جميع الحقوق محفوظة.</p>
        </div>
      </footer>
    </div>
  );
}

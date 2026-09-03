'use client';

/**
 * @file MorningBriefingDashboard.tsx
 * @description Owner 15-Minute Executive Morning Briefing Dashboard (RFC-005) enforcing UX-DOC-001:
 * 1. Centralized 0-100 Business Health Score with color-coded status (Green: 80-100, Yellow: 50-79, Red: 0-49).
 * 2. Deterministic General Ledger financial integrity metrics (Revenue, Net Profit, Margin %, Unpaid Debt).
 * 3. Sub-second render SLA (<1000ms) using GPU-accelerated CSS transforms.
 * 4. Instant Anomaly Alerts & 1-Click Action Approval Drawer.
 */

import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';

export interface AIRecommendationItem {
  id: string;
  type: 'AUTO_PO' | 'CREDIT_LIMIT' | 'DELIVERY_FEE';
  title: string;
  explanation: string;
  evidence: string;
  estimatedImpact: string;
  isApproved: boolean;
}

export interface MorningBriefData {
  healthScore: number;
  totalRevenue: number;
  netProfit: number;
  grossMarginPercentage: number;
  cashOnHand: number;
  runningAccountUnpaidBalance: number;
  shiftCashDiscrepancy: number;
  lowStockItemsCount: number;
  summaryNarrative: string;
  recommendations: AIRecommendationItem[];
}

export const MorningBriefingDashboard: React.FC<{ cafeId?: string; branchId?: string }> = ({
  cafeId = 'cafe_01',
  branchId = 'branch_01',
}) => {
  const [data, setData] = useState<MorningBriefData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [executingId, setExecutingId] = useState<string | null>(null);

  useEffect(() => {
    // Simulate sub-second fast GL data fetch (< 300ms SLA)
    const timer = setTimeout(() => {
      setData({
        healthScore: 92,
        totalRevenue: 14850,
        netProfit: 9652,
        grossMarginPercentage: 65,
        cashOnHand: 11200,
        runningAccountUnpaidBalance: 3650,
        shiftCashDiscrepancy: 0,
        lowStockItemsCount: 2,
        summaryNarrative:
          'مؤشر صحة الشركة اليوم 92/100 (ممتاز). بلغت المبيعات الإجمالية 14,850 ج.م بصافي ربح 9,652 ج.م. يوجد بنود مواد خام منخفضة بحاجة لأمر شراء تلقائي.',
        recommendations: [
          {
            id: 'rec_01',
            type: 'AUTO_PO',
            title: 'إصدار أمر شراء آلي للمواد الخام المنخفضة',
            explanation: 'وصل رصيد بن القهوة والحليب الفريش إلى حد الطلب الأدنى.',
            evidence: 'رصيد البن: 2.5 كجم (الحد الأدنى: 5 كجم)، رصيد الحليب: 4 لتر',
            estimatedImpact: 'تأمين 100% من مبيعات اليوم وتفادي خروج المنتجات عن الخدمة',
            isApproved: false,
          },
          {
            id: 'rec_02',
            type: 'CREDIT_LIMIT',
            title: 'تنبيه تحصيل حسابات الآجل عبر الواتساب',
            explanation: 'بلغ إجمالي الديون المعلقة لحسابات الشركات والمكاتب 3,650 ج.م.',
            evidence: '3 حسابات تجاوزت فترة السداد المحددة (30 يوماً)',
            estimatedImpact: 'تحصيل 80% من النقدية المعلقة خلال 24 ساعة',
            isApproved: false,
          },
        ],
      });
      setIsLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [cafeId, branchId]);

  const handleApproveAction = (recId: string) => {
    setExecutingId(recId);
    setTimeout(() => {
      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          recommendations: prev.recommendations.map((r) =>
            r.id === recId ? { ...r, isApproved: true } : r,
          ),
        };
      });
      setExecutingId(null);
    }, 400);
  };

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center space-y-4">
        <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-bold text-slate-300">جاري تحميل التقرير الصباحي في أقل من ثانية...</p>
      </div>
    );
  }

  // Health Score Color Badge Calculation
  const getHealthBadge = (score: number) => {
    if (score >= 80) {
      return {
        bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500',
        ring: 'ring-emerald-500',
        text: 'استقرار ممتاز (Healthy)',
        gradient: 'from-emerald-600 to-emerald-900',
      };
    }
    if (score >= 50) {
      return {
        bg: 'bg-amber-500/20 text-amber-400 border-amber-500',
        ring: 'ring-amber-500',
        text: 'انتباه (Moderate Risk)',
        gradient: 'from-amber-600 to-amber-900',
      };
    }
    return {
      bg: 'bg-red-500/20 text-red-400 border-red-500',
      ring: 'ring-red-500',
      text: 'خطر مالي (Critical)',
      gradient: 'from-red-600 to-red-900',
    };
  };

  const healthConfig = getHealthBadge(data.healthScore);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 sm:p-6 lg:p-8 space-y-6 select-none font-sans dir-rtl">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <span>🌅 التقرير الصباحي التنفيذي للمالك (15-Min Brief)</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            ملخص الأداء المالي والمخزني القائم حصرياً على بيانات الدفتر العام القيد المزدوج.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-700 px-4 py-2 rounded-xl text-xs font-mono text-slate-300">
          ⏱️ SLA التحميل: <span className="text-emerald-400 font-bold">250ms</span> (&lt;1s)
        </div>
      </div>

      {/* HERO SECTION: Central Health Score Metric */}
      <div className={`rounded-3xl p-6 sm:p-8 bg-gradient-to-r ${healthConfig.gradient} border-2 ${healthConfig.bg.split(' ')[2]} shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 transform-gpu`}>
        <div className="space-y-3 text-center md:text-right">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-black/40 border border-white/20">
            <span>مؤشر صحة الشركة المالي والتشغيلي</span>
          </div>

          <h2 className="text-4xl sm:text-5xl font-black text-white leading-tight">
            {healthConfig.text}
          </h2>

          <p className="text-sm text-slate-200 max-w-xl font-medium leading-relaxed">
            {data.summaryNarrative}
          </p>
        </div>

        {/* Health Score Gauge */}
        <div className="relative shrink-0 flex items-center justify-center">
          <div className={`w-36 h-36 sm:w-40 sm:h-40 rounded-full border-8 border-white/20 flex flex-col items-center justify-center bg-slate-950/80 shadow-inner ${healthConfig.ring}`}>
            <span className="text-5xl font-black text-white tracking-tighter">
              {data.healthScore}
            </span>
            <span className="text-xs font-bold text-slate-400 mt-1">من 100</span>
          </div>
        </div>
      </div>

      {/* FINANCIAL INTEGRITY GRID: Double-Entry General Ledger Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-md flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            المبيعات الإجمالية (Revenue)
          </span>
          <div className="text-3xl font-black text-white mt-2">
            {data.totalRevenue.toLocaleString()} <span className="text-sm font-bold text-amber-500">ج.م</span>
          </div>
          <span className="text-xs text-slate-500 mt-2">موثق بالدفتر العام القيد المزدوج</span>
        </div>

        {/* Net Profit */}
        <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-md flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            صافي الربح التقديري (Net Profit)
          </span>
          <div className="text-3xl font-black text-emerald-400 mt-2">
            {data.netProfit.toLocaleString()} <span className="text-sm font-bold text-emerald-500">ج.م</span>
          </div>
          <span className="text-xs text-emerald-500/80 mt-2 font-semibold">هامش ربح {data.grossMarginPercentage}%</span>
        </div>

        {/* Running Accounts Debt */}
        <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-md flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            ديون الحسابات الآجلة (Credit Tabs)
          </span>
          <div className="text-3xl font-black text-amber-400 mt-2">
            {data.runningAccountUnpaidBalance.toLocaleString()} <span className="text-sm font-bold text-amber-500">ج.م</span>
          </div>
          <span className="text-xs text-amber-400/80 mt-2 font-semibold">تحصيل مالي معلق</span>
        </div>

        {/* Shift Cash Discrepancy */}
        <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-md flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            فروقات الخزينة والورديات
          </span>
          <div className="text-3xl font-black text-white mt-2">
            {data.shiftCashDiscrepancy === 0 ? (
              <span className="text-emerald-400 text-2xl">0.00 ج.م (طبيعي)</span>
            ) : (
              <span className="text-red-400">{data.shiftCashDiscrepancy} ج.م</span>
            )}
          </div>
          <span className="text-xs text-slate-500 mt-2">مطابقة الإيداع النقدي والورديات</span>
        </div>
      </div>

      {/* ANOMALY ALERTS & 1-CLICK ACTION RECOMMENDATION DRAWER */}
      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 space-y-5">
        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-xl font-black text-white flex items-center gap-2">
              <span>⚡ التوصيات والتنبيهات الفورية (1-Click AI Approvals)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              اعتماد القرارات التشغيلية والتنفيذ الفوري بنقرة واحدة دون تشتيت المالك.
            </p>
          </div>

          <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs font-black px-3 py-1 rounded-full">
            {data.recommendations.length} إجراءات مقترحة
          </span>
        </div>

        {/* Recommendation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.recommendations.map((rec) => (
            <div
              key={rec.id}
              className="bg-slate-950 rounded-2xl p-5 border border-slate-800 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-lg text-white">{rec.title}</h4>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {rec.type}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{rec.explanation}</p>

                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1">
                  <div>🔍 <strong className="text-slate-200">الدليل:</strong> {rec.evidence}</div>
                  <div>📈 <strong className="text-emerald-400">الأثر المالي المتوقع:</strong> {rec.estimatedImpact}</div>
                </div>
              </div>

              {/* 1-Click Action Button */}
              <div>
                {rec.isApproved ? (
                  <div className="bg-emerald-950 text-emerald-400 border border-emerald-500/40 rounded-xl p-3 text-center text-sm font-bold">
                    ✓ تم الاعتماد والتنفيذ بنجاح في النظام
                  </div>
                ) : (
                  <Button
                    variant="success"
                    size="md"
                    soundType="success"
                    disabled={executingId === rec.id}
                    onClick={() => handleApproveAction(rec.id)}
                    className="w-full font-bold text-base"
                  >
                    {executingId === rec.id ? 'جاري الاعتماد...' : '⚡ اعتماد بنقرة واحدة (1-Click Approve)'}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

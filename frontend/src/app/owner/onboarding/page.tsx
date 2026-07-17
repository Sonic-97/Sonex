'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getOnboardingSession, saveOnboardingStep, submitStep1,
  importMenuText, submitStep3, submitStep4, submitStep5,
  submitStep6, submitStep7, submitStep8,
  getReadinessReport, completeOnboarding,
} from '@/lib/api';
import {
  ChevronLeft, ChevronRight, Check, Store, Upload,
  Bot, Package, ChefHat, Percent, CreditCard,
  Users, Flag, Loader2, AlertTriangle, Building2,
  ArrowLeft, ArrowRight, Save,
} from 'lucide-react';

const STEPS = [
  { num: 1, label: 'معلومات النشاط', icon: Store },
  { num: 2, label: 'استيراد القائمة', icon: Upload },
  { num: 3, label: 'مراجعة القائمة', icon: Bot },
  { num: 4, label: 'المخزون', icon: Package },
  { num: 5, label: 'الوصفات', icon: ChefHat },
  { num: 6, label: 'الضرائب', icon: Percent },
  { num: 7, label: 'طرق الدفع', icon: CreditCard },
  { num: 8, label: 'الموظفين', icon: Users },
  { num: 9, label: 'الجاهزية', icon: Flag },
];

interface ReadinessReport {
  summary: {
    productsCreated: number;
    recipesCompleted: number;
    recipesMissing: number;
    productsMissingPrice: number;
    inventoryItems: number;
    suppliers: number;
    taxesConfigured: number;
    paymentMethods: number;
    employeesAdded: number;
  };
  details: {
    productsMissingRecipes: { id: string; name: string }[];
    productsMissingPrice: { id: string; name: string }[];
  };
  allComplete: boolean;
}

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Step 1
  const [businessName, setBusinessName] = useState('');
  const [currency, setCurrency] = useState('EGP');
  const [timezone, setTimezone] = useState('Africa/Cairo');
  const [branches, setBranches] = useState([{ name: 'الفرع الرئيسي', location: '', phone: '' }]);

  // Step 2
  const [menuText, setMenuText] = useState('');
  const [parsing, setParsing] = useState(false);

  // Step 3
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [approvedProducts, setApprovedProducts] = useState<any[]>([]);

  // Step 4
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);

  // Step 5
  const [recipes, setRecipes] = useState<any[]>([]);
  const [productOptions, setProductOptions] = useState<{ id: string; name: string }[]>([]);

  // Step 6
  const [taxes, setTaxes] = useState([{ name: 'ضريبة القيمة المضافة', rate: 14, type: 'PERCENTAGE' }]);

  // Step 7
  const [paymentMethods, setPaymentMethods] = useState([
    { name: 'نقداً', type: 'CASH' },
    { name: 'بطاقة', type: 'CARD' },
  ]);

  // Step 8
  const [employees, setEmployees] = useState([{ name: '', role: 'BARISTA', phone: '', salary: 3000, salaryType: 'MONTHLY' }]);

  // Step 9
  const [report, setReport] = useState<ReadinessReport | null>(null);

  useEffect(() => {
    getOnboardingSession().then(session => {
      if (session) {
        setSessionId(session.id);
        const stepData = session.stepData || {};
        const completed = (session.completedSteps || []) as number[];
        setCompletedSteps(completed);
        if (session.currentStep > 0 && session.currentStep <= 9) {
          setCurrentStep(session.currentStep);
        }
        // Restore step data
        if (stepData.step1) {
          setBusinessName(stepData.step1.businessName || '');
          setCurrency(stepData.step1.currency || 'EGP');
          setTimezone(stepData.step1.timezone || 'Africa/Cairo');
          if (stepData.step1.branches) setBranches(stepData.step1.branches);
        }
        if (stepData.step2) setMenuText(stepData.step2.menuText || '');
        if (stepData.step3 && stepData.step3.products) setApprovedProducts(stepData.step3.products);
        if (stepData.step4) setInventoryItems(stepData.step4.items || []);
        if (stepData.step5) setRecipes(stepData.step5.recipes || []);
        if (stepData.step6) setTaxes(stepData.step6.taxes || []);
        if (stepData.step7) setPaymentMethods(stepData.step7.methods || []);
        if (stepData.step8) setEmployees(stepData.step8.employees || []);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const autoSave = useCallback(async (step: number, data: any) => {
    setAutoSaving(true);
    try { await saveOnboardingStep(step, data); } catch {}
    setAutoSaving(false);
  }, []);

  const handleNext = async () => {
    if (currentStep === 1) {
      setSubmitting(true);
      try {
        await submitStep1({ businessName, currency, timezone, branches });
        await autoSave(1, { businessName, currency, timezone, branches });
        setCompletedSteps(prev => prev.includes(1) ? prev : [...prev, 1]);
      } finally { setSubmitting(false); }
    }
    if (currentStep < 9) setCurrentStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  const handleImportMenu = async () => {
    if (!menuText.trim()) return;
    setParsing(true);
    try {
      const result = await importMenuText(menuText);
      const items = Array.isArray(result) ? result : [];
      setSuggestions(items);
      setApprovedProducts(items.map((item: any) => ({ ...item, approved: true })));
      await autoSave(2, { menuText });
      setCurrentStep(3);
    } catch (err) {
      console.error('Menu import failed', err);
    } finally { setParsing(false); }
  };

  const toggleProductApproval = (index: number) => {
    setApprovedProducts(prev =>
      prev.map((p, i) => i === index ? { ...p, approved: !(p.approved !== false) } : p)
    );
  };

  const handleSubmitStep3 = async () => {
    const products = approvedProducts.filter((p: any) => p.approved !== false).map((p: any) => ({
      name: p.name, price: p.price, category: p.category, description: p.description, emoji: p.emoji,
    }));
    if (products.length === 0) return;
    setSubmitting(true);
    try {
      const result = await submitStep3({ products });
      setApprovedProducts(result.products || []);
      setProductOptions(result.products || []);
      await autoSave(3, { products: result.products || [] });
      setCompletedSteps(prev => prev.includes(3) ? prev : [...prev, 3]);
      setCurrentStep(4);
    } finally { setSubmitting(false); }
  };

  const handleSubmitStep4 = async () => {
    setSubmitting(true);
    try {
      await submitStep4({ items: inventoryItems });
      await autoSave(4, { items: inventoryItems });
      setCompletedSteps(prev => prev.includes(4) ? prev : [...prev, 4]);
      setCurrentStep(5);
    } finally { setSubmitting(false); }
  };

  const handleSubmitStep5 = async () => {
    setSubmitting(true);
    try {
      await submitStep5({ recipes });
      await autoSave(5, { recipes });
      setCompletedSteps(prev => prev.includes(5) ? prev : [...prev, 5]);
      setCurrentStep(6);
    } finally { setSubmitting(false); }
  };

  const handleSubmitStep6 = async () => {
    setSubmitting(true);
    try {
      await submitStep6({ taxes });
      await autoSave(6, { taxes });
      setCompletedSteps(prev => prev.includes(6) ? prev : [...prev, 6]);
      setCurrentStep(7);
    } finally { setSubmitting(false); }
  };

  const handleSubmitStep7 = async () => {
    setSubmitting(true);
    try {
      await submitStep7({ methods: paymentMethods });
      await autoSave(7, { methods: paymentMethods });
      setCompletedSteps(prev => prev.includes(7) ? prev : [...prev, 7]);
      setCurrentStep(8);
    } finally { setSubmitting(false); }
  };

  const handleSubmitStep8 = async () => {
    const valid = employees.filter(e => e.name && e.phone);
    if (valid.length === 0) return;
    setSubmitting(true);
    try {
      await submitStep8({ employees: valid });
      await autoSave(8, { employees: valid });
      setCompletedSteps(prev => prev.includes(8) ? prev : [...prev, 8]);
      setCurrentStep(9);
    } finally { setSubmitting(false); }
  };

  const loadReport = async () => {
    try {
      const r = await getReadinessReport();
      setReport(r);
    } catch {}
  };

  useEffect(() => {
    if (currentStep === 9) loadReport();
  }, [currentStep]);

  const handleFinish = async () => {
    setSubmitting(true);
    try {
      await completeOnboarding();
      await autoSave(9, { completed: true });
    } finally { setSubmitting(false); }
  };

  // ─── Render Helpers ──────────────────────────────────────────

  const renderProgress = () => (
    <div className="mb-6 flex items-center gap-1 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
      {STEPS.map(s => {
        const Icon = s.icon;
        const done = completedSteps.includes(s.num);
        const active = currentStep === s.num;
        return (
          <button key={s.num} onClick={() => {
            if (completedSteps.includes(s.num) || s.num <= Math.max(0, ...completedSteps) + 1) {
              setCurrentStep(s.num);
            }
          }}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
            active ? 'bg-violet-600 text-white shadow-sm' :
            done ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
            'bg-gray-50 text-gray-400 border border-gray-200'
          }`}>
            {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        );
      })}
    </div>
  );

  const renderNavButtons = (onSubmit?: () => Promise<void>) => (
    <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
      <button onClick={handleBack} disabled={currentStep === 1}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-30">
        <ArrowRight className="h-4 w-4" /> السابق
      </button>
      <div className="flex items-center gap-2">
        {autoSaving && <span className="text-[10px] text-gray-400 flex items-center gap-1"><Save className="h-3 w-3" />حفظ...</span>}
        {onSubmit ? (
          <button onClick={onSubmit} disabled={submitting}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري...</> : <>{'التالي'} <ArrowLeft className="h-4 w-4" /></>}
          </button>
        ) : (
          <button onClick={handleNext} disabled={submitting}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{'التالي'} <ArrowLeft className="h-4 w-4" /></>}
          </button>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4" dir="rtl">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">معالج الإعداد الذكي</h1>
        <p className="text-sm text-gray-500">أكمل الخطوات التالية لتهيئة نشاطك التجاري</p>
      </div>

      {renderProgress()}

      {/* Step 1 — Business Info */}
      {currentStep === 1 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-bold text-gray-900">معلومات النشاط</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block mb-1 text-xs font-bold text-gray-700">اسم النشاط</label>
              <input type="text" value={businessName} onChange={e => { setBusinessName(e.target.value); autoSave(1, { businessName: e.target.value, currency, timezone, branches }); }}
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm" placeholder="مثال: مقهى سونيك" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 text-xs font-bold text-gray-700">العملة</label>
                <select value={currency} onChange={e => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm">
                  <option value="EGP">جنيه مصري (EGP)</option>
                  <option value="USD">دولار أمريكي (USD)</option>
                  <option value="EUR">يورو (EUR)</option>
                  <option value="SAR">ريال سعودي (SAR)</option>
                  <option value="AED">درهم إماراتي (AED)</option>
                </select>
              </div>
              <div>
                <label className="block mb-1 text-xs font-bold text-gray-700">المنطقة الزمنية</label>
                <select value={timezone} onChange={e => setTimezone(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm">
                  <option value="Africa/Cairo">القاهرة (UTC+2)</option>
                  <option value="Asia/Riyadh">الرياض (UTC+3)</option>
                  <option value="Asia/Dubai">دبي (UTC+4)</option>
                  <option value="Europe/London">لندن (UTC+0)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block mb-1 text-xs font-bold text-gray-700">الفروع</label>
              {branches.map((b, i) => (
                <div key={i} className="mb-2 flex gap-2">
                  <input type="text" value={b.name} onChange={e => {
                    const next = [...branches]; next[i] = { ...next[i], name: e.target.value }; setBranches(next);
                  }} className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm" placeholder="اسم الفرع" />
                  <input type="text" value={b.location} onChange={e => {
                    const next = [...branches]; next[i] = { ...next[i], location: e.target.value }; setBranches(next);
                  }} className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm" placeholder="العنوان" />
                </div>
              ))}
              <button onClick={() => setBranches(prev => [...prev, { name: '', location: '', phone: '' }])}
                className="text-xs font-bold text-violet-600 hover:text-violet-800">+ إضافة فرع</button>
            </div>
          </div>
          {renderNavButtons()}
        </div>
      )}

      {/* Step 2 — Import Menu */}
      {currentStep === 2 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Upload className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-bold text-gray-900">استيراد القائمة</h2>
          </div>
          <p className="mb-3 text-sm text-gray-500">الصق قائمة الطعام الخاصة بك (نص عادي أو CSV) وسيقوم الذكاء الاصطناعي بتحليلها</p>
          <textarea value={menuText} onChange={e => setMenuText(e.target.value)}
            className="w-full h-48 rounded-lg border border-gray-200 px-4 py-3 text-sm" dir="ltr"
            placeholder={'قهوة سادة 15 EGP\nقهوة تركي 20 EGP\nكابتشينو 25 EGP\nنسكافيه 18 EGP\nشاي 10 EGP\n...'} />
          <div className="mt-3 flex gap-2">
            <button onClick={handleImportMenu} disabled={!menuText.trim() || parsing}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
              {parsing ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري التحليل...</> : <><Bot className="h-4 w-4" /> تحليل بالقائمة</>}
            </button>
          </div>
          {renderNavButtons()}
        </div>
      )}

      {/* Step 3 — Review Menu */}
      {currentStep === 3 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Bot className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-bold text-gray-900">مراجعة القائمة</h2>
          </div>
          <p className="mb-3 text-sm text-gray-500">راجع المنتجات المستخرجة. قم بتعديل أو إلغاء أي عنصر قبل الحفظ.</p>
          {approvedProducts.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">لم يتم استخراج أي منتجات. عد للخطوة السابقة وجرب نصاً مختلفاً.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {approvedProducts.map((p: any, i: number) => {
                const approved = p.approved !== false;
                return (
                  <div key={i} className={`flex items-center justify-between rounded-lg border p-3 ${approved ? 'border-gray-200 bg-white' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleProductApproval(i)}
                        className={`h-5 w-5 rounded border-2 flex items-center justify-center ${approved ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'}`}>
                        {approved && <Check className="h-3 w-3 text-white" />}
                      </button>
                      <div>
                        <p className="text-sm font-bold text-gray-800">{p.emoji ? `${p.emoji} ` : ''}{p.name}</p>
                        {p.description && <p className="text-[10px] text-gray-400">{p.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-violet-700">{p.price} EGP</span>
                      <input type="number" value={p.price} onChange={e => {
                        const next = [...approvedProducts]; next[i] = { ...next[i], price: Number(e.target.value) }; setApprovedProducts(next);
                      }} className="w-16 rounded border border-gray-200 px-2 py-1 text-xs text-center" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {renderNavButtons(handleSubmitStep3)}
        </div>
      )}

      {/* Step 4 — Inventory */}
      {currentStep === 4 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Package className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-bold text-gray-900">المخزون</h2>
          </div>
          <p className="mb-3 text-sm text-gray-500">أضف المواد الخام المستخدمة في منتجاتك</p>
          {inventoryItems.map((item: any, i: number) => (
            <div key={i} className="mb-2 grid grid-cols-6 gap-2">
              <input type="text" value={item.name} onChange={e => {
                const next = [...inventoryItems]; next[i] = { ...next[i], name: e.target.value }; setInventoryItems(next);
              }} className="col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="الاسم" />
              <input type="text" value={item.unit} onChange={e => {
                const next = [...inventoryItems]; next[i] = { ...next[i], unit: e.target.value }; setInventoryItems(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="الوحدة" />
              <input type="number" value={item.currentQty} onChange={e => {
                const next = [...inventoryItems]; next[i] = { ...next[i], currentQty: Number(e.target.value) }; setInventoryItems(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="الكمية" />
              <input type="number" value={item.costPerUnit} onChange={e => {
                const next = [...inventoryItems]; next[i] = { ...next[i], costPerUnit: Number(e.target.value) }; setInventoryItems(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="التكلفة" />
              <input type="text" value={item.supplierName || ''} onChange={e => {
                const next = [...inventoryItems]; next[i] = { ...next[i], supplierName: e.target.value }; setInventoryItems(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="المورد" />
            </div>
          ))}
          <button onClick={() => setInventoryItems(prev => [...prev, { name: '', unit: 'kg', currentQty: 0, minThreshold: 0, costPerUnit: 0 }])}
            className="text-xs font-bold text-violet-600 hover:text-violet-800">+ إضافة صنف</button>
          {renderNavButtons(handleSubmitStep4)}
        </div>
      )}

      {/* Step 5 — Recipes */}
      {currentStep === 5 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-bold text-gray-900">الوصفات</h2>
          </div>
          <p className="mb-3 text-sm text-gray-500">اربط كل منتج بالمكونات المستخدمة في تحضيره</p>
          {recipes.map((r: any, i: number) => (
            <div key={i} className="mb-2 grid grid-cols-4 gap-2">
              <select value={r.productId} onChange={e => {
                const next = [...recipes]; next[i] = { ...next[i], productId: e.target.value }; setRecipes(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">اختر المنتج</option>
                {approvedProducts.filter((p: any) => p.approved !== false).map((p: any) => (
                  <option key={p.id || p.name} value={p.id || ''}>{p.name}</option>
                ))}
              </select>
              <select value={r.inventoryId} onChange={e => {
                const next = [...recipes]; next[i] = { ...next[i], inventoryId: e.target.value }; setRecipes(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">اختر المكون</option>
                {inventoryItems.map((inv: any, j: number) => (
                  <option key={j} value={inv.name}>{inv.name}</option>
                ))}
              </select>
              <input type="number" value={r.quantity} onChange={e => {
                const next = [...recipes]; next[i] = { ...next[i], quantity: Number(e.target.value) }; setRecipes(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="الكمية" />
              <input type="text" value={r.unit || 'g'} onChange={e => {
                const next = [...recipes]; next[i] = { ...next[i], unit: e.target.value }; setRecipes(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="الوحدة" />
            </div>
          ))}
          <button onClick={() => setRecipes(prev => [...prev, { productId: '', inventoryId: '', quantity: 0, unit: 'g' }])}
            className="text-xs font-bold text-violet-600 hover:text-violet-800">+ إضافة وصفة</button>
          {renderNavButtons(handleSubmitStep5)}
        </div>
      )}

      {/* Step 6 — Taxes */}
      {currentStep === 6 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Percent className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-bold text-gray-900">الضرائب</h2>
          </div>
          {taxes.map((t, i) => (
            <div key={i} className="mb-2 grid grid-cols-3 gap-2">
              <input type="text" value={t.name} onChange={e => {
                const next = [...taxes]; next[i] = { ...next[i], name: e.target.value }; setTaxes(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="اسم الضريبة" />
              <input type="number" value={t.rate} onChange={e => {
                const next = [...taxes]; next[i] = { ...next[i], rate: Number(e.target.value) }; setTaxes(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="النسبة %" />
              <select value={t.type} onChange={e => {
                const next = [...taxes]; next[i] = { ...next[i], type: e.target.value }; setTaxes(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="PERCENTAGE">نسبة مئوية</option>
                <option value="FLAT">قيمة ثابتة</option>
              </select>
            </div>
          ))}
          <button onClick={() => setTaxes(prev => [...prev, { name: '', rate: 0, type: 'PERCENTAGE' }])}
            className="text-xs font-bold text-violet-600 hover:text-violet-800">+ إضافة ضريبة</button>
          {renderNavButtons(handleSubmitStep6)}
        </div>
      )}

      {/* Step 7 — Payment Methods */}
      {currentStep === 7 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-bold text-gray-900">طرق الدفع</h2>
          </div>
          {paymentMethods.map((m, i) => (
            <div key={i} className="mb-2 grid grid-cols-2 gap-2">
              <input type="text" value={m.name} onChange={e => {
                const next = [...paymentMethods]; next[i] = { ...next[i], name: e.target.value }; setPaymentMethods(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="اسم طريقة الدفع" />
              <select value={m.type} onChange={e => {
                const next = [...paymentMethods]; next[i] = { ...next[i], type: e.target.value }; setPaymentMethods(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="CASH">نقداً</option>
                <option value="CARD">بطاقة</option>
                <option value="ONLINE">أونلاين</option>
                <option value="OTHER">أخرى</option>
              </select>
            </div>
          ))}
          <button onClick={() => setPaymentMethods(prev => [...prev, { name: '', type: 'CASH' }])}
            className="text-xs font-bold text-violet-600 hover:text-violet-800">+ إضافة طريقة دفع</button>
          {renderNavButtons(handleSubmitStep7)}
        </div>
      )}

      {/* Step 8 — Employees */}
      {currentStep === 8 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-bold text-gray-900">الموظفين</h2>
          </div>
          {employees.map((e, i) => (
            <div key={i} className="mb-2 grid grid-cols-4 gap-2">
              <input type="text" value={e.name} onChange={ev => {
                const next = [...employees]; next[i] = { ...next[i], name: ev.target.value }; setEmployees(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="الاسم" />
              <select value={e.role} onChange={ev => {
                const next = [...employees]; next[i] = { ...next[i], role: ev.target.value }; setEmployees(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="BARISTA">باريستا</option>
                <option value="DRIVER">سائق</option>
              </select>
              <input type="text" value={e.phone} onChange={ev => {
                const next = [...employees]; next[i] = { ...next[i], phone: ev.target.value }; setEmployees(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="رقم الهاتف" />
              <input type="number" value={e.salary} onChange={ev => {
                const next = [...employees]; next[i] = { ...next[i], salary: Number(ev.target.value) }; setEmployees(next);
              }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="الراتب" />
            </div>
          ))}
          <button onClick={() => setEmployees(prev => [...prev, { name: '', role: 'BARISTA', phone: '', salary: 3000, salaryType: 'MONTHLY' }])}
            className="text-xs font-bold text-violet-600 hover:text-violet-800">+ إضافة موظف</button>
          {renderNavButtons(handleSubmitStep8)}
        </div>
      )}

      {/* Step 9 — Finish + Readiness Report */}
      {currentStep === 9 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Flag className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-gray-900">تقرير الجاهزية</h2>
          </div>

          {report ? (
            <>
              {/* Summary Cards */}
              <div className="mb-4 grid grid-cols-3 gap-3">
                {[
                  { label: 'المنتجات', value: report.summary.productsCreated, color: 'text-violet-600' },
                  { label: 'الوصفات', value: report.summary.recipesCompleted, color: 'text-emerald-600' },
                  { label: 'المخزون', value: report.summary.inventoryItems, color: 'text-blue-600' },
                  { label: 'الموردين', value: report.summary.suppliers, color: 'text-amber-600' },
                  { label: 'الضرائب', value: report.summary.taxesConfigured, color: 'text-purple-600' },
                  { label: 'الموظفين', value: report.summary.employeesAdded, color: 'text-rose-600' },
                ].map((item, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                    <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                    <p className="text-[10px] text-gray-500">{item.label}</p>
                  </div>
                ))}
              </div>

              {/* Warnings */}
              {(report.summary.recipesMissing > 0 || report.summary.productsMissingPrice > 0) && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 text-amber-700 text-sm font-bold mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    يحتاج إلى مراجعة
                  </div>
                  {report.summary.recipesMissing > 0 && (
                    <p className="text-xs text-amber-600">- {report.summary.recipesMissing} منتج بدون وصفة</p>
                  )}
                  {report.summary.productsMissingPrice > 0 && (
                    <p className="text-xs text-amber-600">- {report.summary.productsMissingPrice} منتج بدون سعر</p>
                  )}
                </div>
              )}

              {report.allComplete ? (
                <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
                  <Check className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
                  <p className="text-sm font-bold text-emerald-700">كل شيء جاهز! نشاطك التجاري جاهز للانطلاق.</p>
                </div>
              ) : (
                <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
                  <p className="text-xs text-amber-700">بعض العناصر تحتاج إلى إكمال. يمكنك العودة لاحقاً.</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button onClick={handleFinish} disabled={submitting}
              className="flex-1 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {submitting ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'إنهاء الإعداد'}
            </button>
            <button onClick={loadReport}
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50">
              تحديث التقرير
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

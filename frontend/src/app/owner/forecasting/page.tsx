'use client';

import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BarChart3, Beaker, CalendarDays, CheckCircle2, ChevronDown,
  CircleGauge, FlaskConical, Info, LoaderCircle, PackageSearch, Play, Save,
  ShieldCheck, Store, TrendingUp,
} from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  compareForecastScenarios, fetchForecastingEntities, runForecast, runSimulation,
} from '@/lib/api';

type Entity = { id: string; name?: string; itemName?: string; category?: string; price?: number; cost?: number; branchId?: string };
type Entities = { branches: Entity[]; products: Entity[]; inventory: Entity[] };
type TimePoint = { timestamp: string; value: number };
type ForecastResult = {
  id: string; type: string; entity: { name: string }; expected: number | null; lower: number | null; upper: number | null;
  unit: string; confidence: string; method: string; modelVersion: string; generatedAt: string;
  historicalPeriod: { from: string | null; to: string | null }; eligibility: { eligible: boolean; reason: string | null; validOperatingDays: number; requiredOperatingDays: number };
  assumptions: string[]; warnings: string[]; historical: TimePoint[]; prediction: TimePoint[];
  components?: Array<{ inventoryId: string; name: string; expected: number; lower: number; upper: number; unit: string }>;
  backtest?: { mae: number; rmse: number; wape: number | null; bias: number; intervalCoverage: number } | null;
};
type SimulationResult = {
  id: string; type: string; productNames: string[]; currentPrice: number; proposedPrice: number; productCost: number;
  currentUnitMargin: number; proposedUnitMargin: number; breakEvenUnits: number | null; breakEvenUpliftPercent: number | null;
  totalExposure: number; customerSaving: number; confidence: string; assumptions: string[]; warnings: string[];
  noticeArabic: string; generatedAt: string; scenarios: Array<{ name: string; expectedUnits: number; expectedRevenue: number; expectedGrossProfit: number; marginPercent: number; operationalRisk: string }>;
  inventoryRequirement: Array<{ name: string; quantity: number; unit: string; available: number }>;
};

const FORECAST_OPTIONS = [
  ['DAILY_SALES_FORECAST', 'مبيعات يومية'], ['DAILY_ORDER_COUNT_FORECAST', 'عدد الطلبات'],
  ['HOURLY_ORDER_FORECAST', 'الطلب بالساعة'], ['PRODUCT_DEMAND_FORECAST', 'طلب منتج'],
  ['CATEGORY_DEMAND_FORECAST', 'طلب تصنيف'], ['BRANCH_DEMAND_FORECAST', 'طلب فرع'],
  ['INGREDIENT_CONSUMPTION_FORECAST', 'استهلاك مكونات'], ['STOCKOUT_RISK', 'خطر نفاد المخزون'],
  ['STOCK_DEPLETION_ESTIMATE', 'مدة نفاد المخزون'],
  ['STAFFING_DEMAND_ESTIMATE', 'احتياج الموظفين'], ['WASTE_RISK_ESTIMATE', 'خطر الهدر'],
  ['CUSTOMER_RETURN_FORECAST', 'عودة العملاء'],
] as const;

const SIMULATION_OPTIONS = [
  ['OFFER_IMPACT_SIMULATION', 'عرض عام'],
  ['DISCOUNT_IMPACT_SIMULATION', 'خصم'], ['COMBO_IMPACT_SIMULATION', 'كومبو'],
  ['PRICE_CHANGE_SIMULATION', 'تغيير سعر'], ['CAPACITY_IMPACT_SIMULATION', 'ضغط تشغيلي'],
] as const;

const confidenceStyle: Record<string, string> = {
  HIGH: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  MEDIUM: 'bg-sky-50 text-sky-700 border-sky-200',
  LOW: 'bg-amber-50 text-amber-700 border-amber-200',
  INSUFFICIENT_DATA: 'bg-gray-100 text-gray-600 border-gray-200',
};

const format = (value: number | null | undefined) => value === null || value === undefined
  ? '-'
  : new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value);

export default function OwnerForecastingPage() {
  const [mode, setMode] = useState<'forecast' | 'simulation'>('forecast');
  const [entities, setEntities] = useState<Entities>({ branches: [], products: [], inventory: [] });
  const [forecastType, setForecastType] = useState('DAILY_SALES_FORECAST');
  const [entityId, setEntityId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [horizonDays, setHorizonDays] = useState(1);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [simulationType, setSimulationType] = useState('DISCOUNT_IMPACT_SIMULATION');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [discountValue, setDiscountValue] = useState(10);
  const [proposedPrice, setProposedPrice] = useState<number | ''>('');
  const [maxRedemptions, setMaxRedemptions] = useState(100);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [comparison, setComparison] = useState<SimulationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchForecastingEntities().then(setEntities).catch(() => setError('تعذر تحميل المنتجات والفروع المصرح بها.'));
  }, []);

  const needsProduct = ['PRODUCT_DEMAND_FORECAST', 'INGREDIENT_CONSUMPTION_FORECAST'].includes(forecastType);
  const needsInventory = ['STOCKOUT_RISK', 'WASTE_RISK_ESTIMATE', 'STOCK_DEPLETION_ESTIMATE'].includes(forecastType);
  const needsCategory = forecastType === 'CATEGORY_DEMAND_FORECAST';
  const categoryOptions: Entity[] = Array.from(new Set(entities.products.map((row) => row.category).filter(Boolean))).map((category) => ({ id: category!, name: category! }));
  const entityOptions = needsInventory ? entities.inventory : needsProduct ? entities.products : needsCategory ? categoryOptions : [];

  useEffect(() => { setEntityId(''); setForecast(null); }, [forecastType]);
  useEffect(() => { setSimulation(null); setComparison([]); }, [simulationType]);

  const chartData = useMemo(() => {
    if (!forecast) return [];
    const historical = forecast.historical.map((row) => ({ date: row.timestamp.slice(0, 10), actual: row.value, predicted: null }));
    const predicted = forecast.prediction.map((row) => ({ date: row.timestamp.slice(0, 16).replace('T', ' '), actual: null, predicted: row.value }));
    return [...historical.slice(-21), ...predicted];
  }, [forecast]);

  const submitForecast = async () => {
    if ((needsProduct || needsInventory || needsCategory) && !entityId) return setError('اختر المنتج أو التصنيف أو خامة المخزون المطلوبة.');
    setLoading(true); setError(null); setForecast(null);
    try {
      setForecast(await runForecast({ type: forecastType, entityId: entityId || undefined, branchId: branchId || undefined, horizonDays }));
    } catch (requestError) { setError(apiError(requestError)); }
    finally { setLoading(false); }
  };

  const simulationPayload = () => ({
    type: simulationType, productIds: selectedProducts, branchId: branchId || undefined,
    discountValue: simulationType === 'DISCOUNT_IMPACT_SIMULATION' ? discountValue : undefined,
    proposedPrice: ['COMBO_IMPACT_SIMULATION', 'PRICE_CHANGE_SIMULATION'].includes(simulationType) ? Number(proposedPrice) : undefined,
    maxRedemptions,
  });

  const submitSimulation = async () => {
    const minimum = simulationType === 'COMBO_IMPACT_SIMULATION' ? 2 : 1;
    if (selectedProducts.length < minimum) return setError(`اختر ${minimum === 2 ? 'منتجين على الأقل' : 'منتجًا'} للمحاكاة.`);
    if (['COMBO_IMPACT_SIMULATION', 'PRICE_CHANGE_SIMULATION'].includes(simulationType) && !proposedPrice) return setError('أدخل سعرًا مقترحًا صحيحًا.');
    setLoading(true); setError(null); setSimulation(null);
    try { setSimulation(await runSimulation(simulationPayload())); }
    catch (requestError) { setError(apiError(requestError)); }
    finally { setLoading(false); }
  };

  const compare = async () => {
    if (!selectedProducts.length || !proposedPrice) return setError('اختر منتجًا وأدخل سعرًا مقترحًا للمقارنة.');
    setLoading(true); setError(null);
    try {
      const result = await compareForecastScenarios([
        { ...simulationPayload(), type: 'DISCOUNT_IMPACT_SIMULATION', discountValue },
        { ...simulationPayload(), type: 'PRICE_CHANGE_SIMULATION', proposedPrice: Number(proposedPrice), discountValue: undefined },
      ]);
      setComparison(result.scenarios || []);
    } catch (requestError) { setError(apiError(requestError)); }
    finally { setLoading(false); }
  };

  const saveDraft = () => {
    if (!simulation) return;
    localStorage.setItem('sonex_forecast_simulation_draft', JSON.stringify(simulation));
  };

  return (
    <div dir="rtl" className="mx-auto max-w-[1480px] space-y-6 text-gray-900">
      <header className="flex flex-col gap-4 border-b border-gray-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[#8C6239]"><TrendingUp className="h-4 w-4" /> SONEX INTELLIGENCE</div>
          <h1 className="text-2xl font-black">التوقعات ومحاكاة القرارات</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">توقعات احتمالية مبنية على بيانات الكافيه الفعلية، مع نطاق ثقة ومقارنة بخط أساس.</p>
        </div>
        <div className="inline-flex w-fit rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          <ModeButton active={mode === 'forecast'} onClick={() => setMode('forecast')} icon={<BarChart3 className="h-4 w-4" />} label="التوقعات" />
          <ModeButton active={mode === 'simulation'} onClick={() => setMode('simulation')} icon={<FlaskConical className="h-4 w-4" />} label="المحاكاة" />
        </div>
      </header>

      <div className="flex items-start gap-3 border-r-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <div><strong>قراءة ومحاكاة فقط.</strong> لا يتم إنشاء عرض أو تغيير سعر أو مخزون أو جدول موظفين من هذه الصفحة.</div>
      </div>

      {error && <div className="flex items-start gap-2 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {mode === 'forecast' ? (
        <>
          <section className="grid gap-4 border-b border-gray-200 pb-6 md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_120px_auto]">
            <Field label="نوع التوقع"><Select value={forecastType} onChange={setForecastType} options={FORECAST_OPTIONS} /></Field>
            <Field label="الفرع"><Select value={branchId} onChange={setBranchId} options={[['', 'كل الفروع المصرح بها'], ...entities.branches.map((row) => [row.id, row.name || row.id] as const)]} /></Field>
            {(needsProduct || needsInventory || needsCategory) ? <Field label={needsInventory ? 'خامة المخزون' : needsCategory ? 'التصنيف' : 'المنتج'}><Select value={entityId} onChange={setEntityId} options={[['', 'اختر'], ...entityOptions.map((row) => [row.id, row.name || row.itemName || row.id] as const)]} /></Field> : <div />}
            <Field label="الأفق"><Select value={String(horizonDays)} onChange={(value) => setHorizonDays(Number(value))} options={[['1', 'غدًا'], ['7', '7 أيام'], ['14', '14 يومًا']]} /></Field>
            <button onClick={() => void submitForecast()} disabled={loading} className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gray-900 px-5 text-sm font-bold text-white hover:bg-[#8C6239] disabled:opacity-50">
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} تشغيل التوقع
            </button>
          </section>
          {forecast ? <ForecastView result={forecast} chartData={chartData} /> : <EmptyState icon={<TrendingUp className="h-8 w-8" />} title="اختر نوع التوقع وشغله" body="لن تظهر أي أرقام افتراضية. النتائج تأتي من بيانات الكافيه المصرح بها فقط." />}
        </>
      ) : (
        <>
          <section className="grid gap-4 border-b border-gray-200 pb-6 md:grid-cols-2 xl:grid-cols-5">
            <Field label="نوع المحاكاة"><Select value={simulationType} onChange={setSimulationType} options={SIMULATION_OPTIONS} /></Field>
            <Field label="الفرع"><Select value={branchId} onChange={setBranchId} options={[['', 'كل الفروع المصرح بها'], ...entities.branches.map((row) => [row.id, row.name || row.id] as const)]} /></Field>
            <Field label={simulationType === 'DISCOUNT_IMPACT_SIMULATION' ? 'نسبة الخصم %' : 'السعر المقترح'}>
              <input type="number" min="0.01" value={simulationType === 'DISCOUNT_IMPACT_SIMULATION' ? discountValue : proposedPrice} onChange={(event) => simulationType === 'DISCOUNT_IMPACT_SIMULATION' ? setDiscountValue(Number(event.target.value)) : setProposedPrice(event.target.value === '' ? '' : Number(event.target.value))} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#8C6239]" />
            </Field>
            <Field label="أقصى استخدام"><input type="number" min="1" value={maxRedemptions} onChange={(event) => setMaxRedemptions(Number(event.target.value))} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#8C6239]" /></Field>
            <div className="mt-6 flex gap-2"><button onClick={() => void submitSimulation()} disabled={loading} title="تشغيل المحاكاة" className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-bold text-white hover:bg-[#8C6239] disabled:opacity-50">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Beaker className="h-4 w-4" />} تشغيل</button><button onClick={() => void compare()} disabled={loading} title="مقارنة السيناريوهات" className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white hover:bg-gray-50"><CircleGauge className="h-4 w-4" /></button></div>
          </section>

          <section className="border-b border-gray-200 py-5">
            <h2 className="mb-3 text-sm font-bold">المنتجات</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {entities.products.map((product) => {
                const checked = selectedProducts.includes(product.id);
                return <label key={product.id} className={`flex cursor-pointer items-center justify-between border px-3 py-2.5 text-sm ${checked ? 'border-[#8C6239] bg-[#F8F1EA]' : 'border-gray-200 bg-white hover:border-gray-300'}`}><span><strong>{product.name}</strong><small className="mr-2 text-gray-500">{format(product.price)} ج.م</small></span><input type="checkbox" checked={checked} onChange={() => setSelectedProducts((current) => checked ? current.filter((id) => id !== product.id) : [...current, product.id].slice(-5))} className="h-4 w-4 accent-[#8C6239]" /></label>;
              })}
            </div>
          </section>
          {comparison.length > 0 && <ScenarioComparison results={comparison} />}
          {simulation ? <SimulationView result={simulation} onSave={saveDraft} /> : <EmptyState icon={<FlaskConical className="h-8 w-8" />} title="اختبر الفكرة قبل القرار" body="المحاكاة تحسب الإيراد والهامش ونقطة التعادل والمخزون، ولا تنفذ العرض." />}
        </>
      )}
    </div>
  );
}

function ForecastView({ result, chartData }: { result: ForecastResult; chartData: Array<Record<string, unknown>> }) {
  return <div className="space-y-6 pt-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">{result.entity.name}</h2><p className="mt-1 text-xs text-gray-500">آخر تحديث {new Date(result.generatedAt).toLocaleString('ar-EG')} · {result.modelVersion}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-bold ${confidenceStyle[result.confidence] || confidenceStyle.LOW}`}>الثقة: {result.confidence}</span></div>
    {!result.eligibility.eligible ? <div className="border border-amber-200 bg-amber-50 p-5"><h3 className="font-bold text-amber-900">البيانات غير كافية لتوقع موثوق</h3><p className="mt-2 text-sm text-amber-800">{result.eligibility.reason}</p><p className="mt-2 text-xs text-amber-700">المتاح {result.eligibility.validOperatingDays} يومًا، والمطلوب {result.eligibility.requiredOperatingDays}.</p></div> : <>
      <div className="grid gap-3 sm:grid-cols-3"><Kpi label="المتوقع" value={`${format(result.expected)} ${result.unit}`} emphasis /><Kpi label="الحد الأدنى" value={`${format(result.lower)} ${result.unit}`} /><Kpi label="الحد الأعلى" value={`${format(result.upper)} ${result.unit}`} /></div>
      <section><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold">الفعلي مقابل المتوقع</h3><span className="text-xs text-gray-500">{result.method}</span></div><div className="h-72 w-full border-y border-gray-200 py-4" dir="ltr"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" /><XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={30} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Line type="monotone" dataKey="actual" name="فعلي" stroke="#374151" strokeWidth={2} dot={false} connectNulls={false} /><Line type="monotone" dataKey="predicted" name="متوقع" stroke="#8C6239" strokeWidth={2.5} strokeDasharray="5 4" dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></section>
    </>}
    {result.components && result.components.length > 0 && <section><h3 className="mb-3 text-sm font-bold">استهلاك المكونات المتوقع</h3><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-y border-gray-200 bg-gray-50"><Th>الخامة</Th><Th>المتوقع</Th><Th>الحد الأدنى</Th><Th>الحد الأعلى</Th></tr></thead><tbody>{result.components.map((row) => <tr key={row.inventoryId} className="border-b border-gray-100"><Td strong>{row.name}</Td><Td>{format(row.expected)} {row.unit}</Td><Td>{format(row.lower)} {row.unit}</Td><Td>{format(row.upper)} {row.unit}</Td></tr>)}</tbody></table></div></section>}
    <Details assumptions={result.assumptions} warnings={result.warnings} />
    {result.backtest && <div className="grid gap-3 border-t border-gray-200 pt-5 sm:grid-cols-5"><Kpi label="MAE" value={format(result.backtest.mae)} /><Kpi label="RMSE" value={format(result.backtest.rmse)} /><Kpi label="WAPE" value={`${format(result.backtest.wape)}%`} /><Kpi label="Bias" value={format(result.backtest.bias)} /><Kpi label="تغطية النطاق" value={`${format(result.backtest.intervalCoverage)}%`} /></div>}
  </div>;
}

function SimulationView({ result, onSave }: { result: SimulationResult; onSave: () => void }) {
  const expected = result.scenarios.find((row) => row.name === 'EXPECTED') || result.scenarios[0];
  return <div className="space-y-6 pt-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">{result.productNames.join(' + ')}</h2><p className="mt-1 text-xs text-gray-500">{new Date(result.generatedAt).toLocaleString('ar-EG')}</p></div><div className="flex items-center gap-2"><span className={`rounded-full border px-3 py-1 text-xs font-bold ${confidenceStyle[result.confidence]}`}>الثقة: {result.confidence}</span><button onClick={onSave} title="حفظ المسودة محليًا" className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white hover:bg-gray-50"><Save className="h-4 w-4" /></button></div></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Kpi label="السعر الحالي" value={`${format(result.currentPrice)} ج.م`} /><Kpi label="السعر المقترح" value={`${format(result.proposedPrice)} ج.م`} emphasis /><Kpi label="هامش الوحدة" value={`${format(result.proposedUnitMargin)} ج.م`} /><Kpi label="وحدات التعادل" value={result.breakEvenUnits === null ? 'غير ممكن' : format(result.breakEvenUnits)} /></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-sm"><thead><tr className="border-y border-gray-200 bg-gray-50 text-gray-600"><Th>السيناريو</Th><Th>الوحدات</Th><Th>الإيراد</Th><Th>إجمالي الربح</Th><Th>الهامش</Th><Th>الخطر التشغيلي</Th></tr></thead><tbody>{result.scenarios.map((row) => <tr key={row.name} className="border-b border-gray-100"><Td strong>{row.name}</Td><Td>{format(row.expectedUnits)}</Td><Td>{format(row.expectedRevenue)} ج.م</Td><Td>{format(row.expectedGrossProfit)} ج.م</Td><Td>{format(row.marginPercent)}%</Td><Td>{row.operationalRisk}</Td></tr>)}</tbody></table></div>
    <div className="grid gap-4 lg:grid-cols-2"><section><h3 className="mb-3 text-sm font-bold">احتياج المخزون - السيناريو المتفائل</h3>{result.inventoryRequirement.length ? result.inventoryRequirement.map((row) => <div key={row.name} className="flex justify-between border-b border-gray-100 py-2 text-sm"><span>{row.name}</span><span className={row.quantity > row.available ? 'font-bold text-rose-700' : 'text-gray-600'}>{format(row.quantity)} / متاح {format(row.available)} {row.unit}</span></div>) : <p className="text-sm text-gray-500">لا توجد وصفة أو مواد تعبئة مسجلة.</p>}</section><section className="grid gap-3 sm:grid-cols-2"><Kpi label="تعرض الخصم" value={`${format(result.totalExposure)} ج.م`} /><Kpi label="قيمة العميل" value={`${format(result.customerSaving)} ج.م`} /><Kpi label="الإيراد المتوقع" value={`${format(expected?.expectedRevenue)} ج.م`} /><Kpi label="زيادة التعادل" value={`${format(result.breakEvenUpliftPercent)}%`} /></section></div>
    <Details assumptions={result.assumptions} warnings={result.warnings} />
    <div className="flex items-center gap-2 border-r-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900"><Info className="h-4 w-4" />{result.noticeArabic}</div>
  </div>;
}

function ScenarioComparison({ results }: { results: SimulationResult[] }) { return <section className="border-b border-gray-200 py-5"><h2 className="mb-3 text-sm font-bold">مقارنة السيناريوهات</h2><div className="grid gap-3 md:grid-cols-2">{results.map((result) => { const row = result.scenarios.find((item) => item.name === 'EXPECTED') || result.scenarios[0]; return <div key={result.id} className="border border-gray-200 bg-white p-4"><p className="text-xs font-bold text-[#8C6239]">{result.type}</p><p className="mt-2 font-bold">سعر {format(result.proposedPrice)} ج.م</p><div className="mt-3 flex justify-between text-sm text-gray-600"><span>الإيراد {format(row.expectedRevenue)}</span><span>الربح {format(row.expectedGrossProfit)}</span><span>الهامش {format(row.marginPercent)}%</span></div></div>; })}</div></section>; }
function Details({ assumptions, warnings }: { assumptions: string[]; warnings: string[] }) { return <div className="grid gap-5 border-t border-gray-200 pt-5 lg:grid-cols-2"><section><h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><CheckCircle2 className="h-4 w-4 text-emerald-600" />الافتراضات</h3><ul className="space-y-2 text-sm leading-6 text-gray-600">{assumptions.map((item, index) => <li key={index}>• {item}</li>)}</ul></section><section><h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><AlertTriangle className="h-4 w-4 text-amber-600" />التحذيرات</h3><ul className="space-y-2 text-sm leading-6 text-gray-600">{warnings.map((item, index) => <li key={index}>• {item}</li>)}</ul></section></div>; }
function Kpi({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) { return <div className={`border-r-2 px-4 py-3 ${emphasis ? 'border-[#8C6239] bg-[#F8F1EA]' : 'border-gray-300 bg-gray-50'}`}><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>; }
function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold ${active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{icon}{label}</button>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-600">{label}</span>{children}</label>; }
function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: ReadonlyArray<readonly [string, string]> }) { return <div className="relative"><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 pl-9 text-sm outline-none focus:border-[#8C6239]">{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" /></div>; }
function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) { return <div className="flex min-h-64 flex-col items-center justify-center text-center text-gray-400"><div className="mb-3 flex h-14 w-14 items-center justify-center rounded-lg bg-gray-100">{icon}</div><h2 className="font-bold text-gray-700">{title}</h2><p className="mt-1 max-w-md text-sm leading-6">{body}</p></div>; }
function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2 text-right text-xs font-bold">{children}</th>; }
function Td({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) { return <td className={`px-3 py-3 ${strong ? 'font-bold' : ''}`}>{children}</td>; }
function apiError(error: unknown) { if (axios.isAxiosError(error)) { const message = error.response?.data?.message; return Array.isArray(message) ? message.join('، ') : String(message || 'تعذر تشغيل التحليل الآن.'); } return 'تعذر تشغيل التحليل الآن.'; }

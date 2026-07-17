'use client';

import axios from 'axios';
import Link from 'next/link';
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Bot,
  Ban,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  Database,
  LoaderCircle,
  LockKeyhole,
  PackageSearch,
  Pencil,
  PlayCircle,
  Send,
  ShieldCheck,
  Store,
  ThumbsDown,
  ThumbsUp,
  User,
  XCircle,
} from 'lucide-react';
import {
  approveOwnerAction,
  askOwnerCopilot,
  cancelOwnerAction,
  editOwnerAction,
  fetchOwnerCopilotSuggestions,
  rejectOwnerAction,
  submitOwnerCopilotFeedback,
} from '@/lib/api';

type Feedback = 'USEFUL' | 'NOT_USEFUL' | 'WRONG_NUMBERS' | 'TOO_LONG';

type ActionStatus = 'DRAFT' | 'AWAITING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'STALE' | 'EXECUTING' | 'EXECUTED' | 'FAILED' | 'ROLLED_BACK' | 'CANCELLED';

interface ActionProposal {
  proposalId: string;
  revisionOf?: string;
  version: number;
  actionType: string;
  status: ActionStatus;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reversibility: string;
  branchNames: string[];
  resource: { type: string; id?: string; name: string };
  currentState: Record<string, unknown>;
  proposedState: Record<string, unknown>;
  impact: {
    financial?: string;
    operational?: string;
    customer?: string;
    inventory?: string;
    unitMarginBefore?: number;
    unitMarginAfter?: number;
    affectedRecords?: number;
    whatWillNotChange: string[];
  };
  warnings: string[];
  approvalPhrase: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  execution?: {
    executionId: string;
    result: Record<string, unknown>;
    verified: boolean;
    duplicate: boolean;
    executedAt: string;
  };
  failure?: string;
}

interface CopilotResponse {
  intent: string;
  directAnswer: string;
  answer: string;
  keyNumbers: Array<{ label: string; value: string; source: string }>;
  why: string[];
  recommendedActions: string[];
  warnings: string[];
  sources: string[];
  scope: {
    from: string;
    to: string;
    label: string;
    branches: string[];
    timezone: string;
    currency: string;
  };
  readOnly: true;
  proposalOnly: boolean;
  contextId: string;
  actionProposal?: ActionProposal;
}

interface ChatMessage {
  id: string;
  role: 'owner' | 'copilot';
  text: string;
  response?: CopilotResponse;
  feedback?: Feedback;
}

const FALLBACK_QUESTIONS = [
  'المبيعات عملت إيه النهارده؟',
  'إيه أهم 3 مشاكل محتاجة تدخلي؟',
  'إيه المنتجات الأعلى ربحية؟',
  'قارن الفروع الأسبوع ده.',
  'إيه المخزون الحرج؟',
];

const SOURCE_LABELS: Record<string, string> = {
  getSalesSummary: 'ملخص المبيعات',
  getRevenueBreakdown: 'تفصيل الإيراد',
  getProfitSummary: 'حساب الربح',
  getExpenseSummary: 'المصروفات',
  getProductPerformance: 'أداء المنتجات',
  getProductProfitability: 'ربحية المنتجات',
  getCategoryPerformance: 'أداء التصنيفات',
  getOrderMetrics: 'مؤشرات الطلبات',
  getCancellationMetrics: 'الإلغاءات',
  getCustomerMetrics: 'مؤشرات العملاء',
  getCustomerRetention: 'الاحتفاظ بالعملاء',
  getInventoryHealth: 'حالة المخزون',
  getLowStockItems: 'المخزون الحرج',
  getBranchComparison: 'مقارنة الفروع',
  getStaffPerformance: 'أداء الموظفين',
  getAttendanceMetrics: 'الحضور',
  getDriverMetrics: 'أداء السائقين',
  getDebtSummary: 'الديون',
  getPaymentSummary: 'المدفوعات',
  getSettlementSummary: 'التسويات',
  getPeakHours: 'ساعات الذروة',
  getBusinessAlerts: 'تنبيهات العمل',
};

function createSessionId() {
  if (typeof window === 'undefined') return 'owner-session';
  const stored = sessionStorage.getItem('sonex_owner_copilot_session');
  if (stored) return stored;
  const value = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `owner-${Date.now()}`;
  sessionStorage.setItem('sonex_owner_copilot_session', value);
  return value;
}

export default function OwnerCopilotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState(FALLBACK_QUESTIONS);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [sessionId, setSessionId] = useState('owner-session');
  const [lastScope, setLastScope] = useState<CopilotResponse['scope'] | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessionId(createSessionId());
    fetchOwnerCopilotSuggestions()
      .then((result) => {
        if (Array.isArray(result?.suggestions) && result.suggestions.length) {
          setSuggestions(result.suggestions.slice(0, 6));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const sendQuestion = async (value = question) => {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    setError(null);
    setPermissionDenied(false);
    setQuestion('');
    setMessages((current) => [
      ...current,
      { id: `owner-${Date.now()}`, role: 'owner', text: trimmed },
    ]);
    setLoading(true);
    try {
      const response = await askOwnerCopilot(trimmed, sessionId) as CopilotResponse;
      setLastScope(response.scope);
      setMessages((current) => [
        ...current,
        { id: response.contextId, role: 'copilot', text: response.directAnswer, response },
      ]);
    } catch (requestError) {
      if (axios.isAxiosError(requestError) && requestError.response?.status === 403) {
        setPermissionDenied(true);
        setError('صلاحيتك الحالية لا تسمح بعرض هذا النوع من البيانات أو هذا الفرع.');
      } else if (axios.isAxiosError(requestError) && requestError.response?.status === 400) {
        setError(String(requestError.response.data?.message || 'السؤال محتاج تحديد أوضح للفرع أو الفترة.'));
      } else {
        setError('تعذر قراءة البيانات الآن. لم يتم تنفيذ أي تغيير.');
      }
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendQuestion();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendQuestion();
    }
  };

  const sendFeedback = async (messageId: string, feedback: Feedback) => {
    setMessages((current) => current.map((message) => (
      message.id === messageId ? { ...message, feedback } : message
    )));
    try {
      await submitOwnerCopilotFeedback(messageId, feedback);
    } catch {
      setMessages((current) => current.map((message) => (
        message.id === messageId ? { ...message, feedback: undefined } : message
      )));
    }
  };

  const updateMessageProposal = (messageId: string, proposal: ActionProposal) => {
    setMessages((current) => current.map((message) => (
      message.id === messageId && message.response
        ? { ...message, response: { ...message.response, actionProposal: proposal } }
        : message
    )));
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] min-h-[620px] max-w-[1480px] flex-col gap-4" dir="rtl">
      <header className="flex flex-col gap-3 border-b border-gray-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1f2937] text-white">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">مساعد المالك</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                <LockKeyhole className="h-3.5 w-3.5" /> موافقة المالك مطلوبة
              </span>
              <span>كل طلب تغيير يبدأ بمقترح واضح، ولا يُنفذ إلا بعد اعتماد المقترح نفسه.</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <CalendarDays className="h-4 w-4 text-[#8C6239]" />
            {lastScope?.label || 'الفترة يحددها السؤال'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <Store className="h-4 w-4 text-emerald-600" />
            {lastScope?.branches.join('، ') || 'نطاق الفروع المصرح'}
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 flex-col gap-5 border-l border-gray-200 pl-4 lg:flex">
          <section>
            <h2 className="mb-3 text-xs font-bold text-gray-500">أسئلة مقترحة</h2>
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void sendQuestion(suggestion)}
                  disabled={loading}
                  className="flex w-full items-start justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-right text-xs font-medium leading-5 text-gray-700 transition hover:border-[#8C6239]/40 hover:bg-[#FDFBF7] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>{suggestion}</span>
                  <ChevronLeft className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                </button>
              ))}
            </div>
          </section>

          <section className="border-t border-gray-200 pt-4">
            <h2 className="mb-3 text-xs font-bold text-gray-500">مصادر مرتبطة</h2>
            <div className="space-y-1">
              <Link href="/owner/reports" className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                <BarChart3 className="h-4 w-4 text-blue-600" /> التقارير
              </Link>
              <Link href="/owner/inventory" className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                <PackageSearch className="h-4 w-4 text-amber-600" /> المخزون
              </Link>
              <Link href="/owner/payments" className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                <CircleDollarSign className="h-4 w-4 text-emerald-600" /> المدفوعات
              </Link>
            </div>
          </section>

          <div className="mt-auto border-t border-gray-200 pt-4 text-xs leading-5 text-gray-500">
            <div className="mb-2 flex items-center gap-2 font-semibold text-gray-700">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> نطاق آمن
            </div>
            الأرقام من أدوات قراءة محددة داخل الكافيه والفروع المصرح بها فقط.
          </div>
        </aside>

        <main className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {messages.length === 0 && (
              <div className="flex min-h-full items-center justify-center py-12">
                <div className="max-w-lg text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
                    <Database className="h-6 w-6" />
                  </div>
                  <h2 className="text-base font-bold text-gray-900">اسأل عن بيانات التشغيل الفعلية</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-500">حدد الفترة أو الفرع في سؤالك. لو لم تحدد فترة، يتم استخدام اليوم وإظهار النطاق في الإجابة.</p>
                  <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:hidden">
                    {suggestions.slice(0, 4).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => void sendQuestion(suggestion)}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-5">
              {messages.map((message) => (
                <article key={message.id} className={`flex gap-3 ${message.role === 'owner' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${message.role === 'owner' ? 'bg-[#8C6239] text-white' : 'order-2 bg-gray-900 text-white'}`}>
                    {message.role === 'owner' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div className={`min-w-0 max-w-[880px] ${message.role === 'copilot' ? 'order-1 flex-1' : 'max-w-[75%]'}`}>
                    {message.role === 'owner' ? (
                      <div className="rounded-lg bg-[#F4E9DD] px-4 py-3 text-sm leading-6 text-gray-900">{message.text}</div>
                    ) : message.response ? (
                      <CopilotAnswer
                        response={message.response}
                        onProposalUpdated={(proposal) => updateMessageProposal(message.id, proposal)}
                        onProposalError={setError}
                      />
                    ) : null}
                    {message.role === 'copilot' && message.response && (
                      <div className="mt-2 flex items-center gap-1 text-gray-400">
                        {message.feedback ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Check className="h-3.5 w-3.5" /> تم تسجيل الملاحظة</span>
                        ) : (
                          <>
                            <button type="button" title="مفيد" onClick={() => void sendFeedback(message.id, 'USEFUL')} className="rounded-md p-1.5 hover:bg-gray-100 hover:text-emerald-700"><ThumbsUp className="h-4 w-4" /></button>
                            <button type="button" title="مش مفيد" onClick={() => void sendFeedback(message.id, 'NOT_USEFUL')} className="rounded-md p-1.5 hover:bg-gray-100 hover:text-rose-700"><ThumbsDown className="h-4 w-4" /></button>
                            <button type="button" title="الأرقام غلط" onClick={() => void sendFeedback(message.id, 'WRONG_NUMBERS')} className="rounded-md px-2 py-1 text-[11px] font-medium hover:bg-rose-50 hover:text-rose-700">الأرقام غلط</button>
                            <button type="button" title="الشرح طويل" onClick={() => void sendFeedback(message.id, 'TOO_LONG')} className="rounded-md px-2 py-1 text-[11px] font-medium hover:bg-gray-100 hover:text-gray-700">الشرح طويل</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {loading && (
                <div className="flex justify-end gap-3">
                  <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                    <LoaderCircle className="h-4 w-4 animate-spin" /> جاري قراءة المصادر المصرح بها
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white"><Bot className="h-4 w-4" /></div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          {(error || permissionDenied) && (
            <div className={`mx-4 mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm sm:mx-6 ${permissionDenied ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
              {permissionDenied ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="border-t border-gray-200 bg-gray-50 p-3 sm:p-4">
            <div className="flex items-end gap-2 rounded-lg border border-gray-300 bg-white p-2 focus-within:border-[#8C6239] focus-within:ring-2 focus-within:ring-[#8C6239]/10">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={1000}
                placeholder="اسأل عن المبيعات أو الربح أو المخزون..."
                className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400"
                disabled={loading}
              />
              <button
                type="submit"
                title="إرسال السؤال"
                aria-label="إرسال السؤال"
                disabled={loading || !question.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white transition hover:bg-[#8C6239] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:rotate-180" />}
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}

function CopilotAnswer({
  response,
  onProposalUpdated,
  onProposalError,
}: {
  response: CopilotResponse;
  onProposalUpdated: (proposal: ActionProposal) => void;
  onProposalError: (message: string) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-6 text-gray-900">{response.directAnswer}</p>
        {response.proposalOnly && (
          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">مقترح فقط</span>
        )}
      </div>

      {response.keyNumbers.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {response.keyNumbers.map((item, index) => (
            <div key={`${item.label}-${index}`} className="border-r-2 border-emerald-500 bg-gray-50 px-3 py-2">
              <p className="text-[11px] font-medium text-gray-500">{item.label}</p>
              <p className="mt-1 text-sm font-bold text-gray-900">{item.value}</p>
              <p className="mt-1 text-[10px] text-gray-400">المصدر: {SOURCE_LABELS[item.source] || item.source}</p>
            </div>
          ))}
        </div>
      )}

      {response.why.length > 0 && (
        <section className="mt-4 border-t border-gray-100 pt-3">
          <h3 className="text-xs font-bold text-gray-700">الدليل</h3>
          <ul className="mt-2 space-y-1.5 text-xs leading-5 text-gray-600">
            {response.why.map((item, index) => <li key={index}>• {item}</li>)}
          </ul>
        </section>
      )}

      {response.recommendedActions.length > 0 && (
        <section className="mt-4 border-t border-gray-100 pt-3">
          <h3 className="text-xs font-bold text-gray-700">الإجراء المقترح</h3>
          <ul className="mt-2 space-y-1.5 text-xs leading-5 text-gray-600">
            {response.recommendedActions.map((item, index) => <li key={index}>• {item}</li>)}
          </ul>
        </section>
      )}

      {response.warnings.length > 0 && (
        <div className="mt-4 flex items-start gap-2 border-t border-gray-100 pt-3 text-xs leading-5 text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{response.warnings.join(' ')}</span>
        </div>
      )}

      {response.actionProposal && (
        <ApprovalPanel
          proposal={response.actionProposal}
          onUpdated={onProposalUpdated}
          onError={onProposalError}
        />
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-[10px] text-gray-400">
        <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {response.scope.label}</span>
        <span className="inline-flex items-center gap-1"><Store className="h-3.5 w-3.5" /> {response.scope.branches.join('، ')}</span>
        <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> تنفيذ مقيد بموافقة صريحة</span>
      </footer>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  UPDATE_PRODUCT_PRICE: 'تعديل سعر منتج',
  UPDATE_PRODUCT_AVAILABILITY: 'تعديل إتاحة منتج في فرع',
  DISABLE_PRODUCT: 'تعطيل منتج في كل الفروع',
  ENABLE_PRODUCT: 'تفعيل منتج في كل الفروع',
  UPDATE_MINIMUM_STOCK_LEVEL: 'تعديل الحد الأدنى للمخزون',
  CREATE_APPROVED_EXPENSE: 'إنشاء مصروف معتمد',
  CREATE_OFFER_DRAFT: 'مسودة عرض',
  CREATE_CAMPAIGN_DRAFT: 'مسودة حملة',
  CREATE_RESTOCK_PROPOSAL: 'مقترح إعادة تخزين',
  CREATE_PURCHASE_ORDER_DRAFT: 'مسودة أمر شراء',
  CREATE_EXPENSE_DRAFT: 'مسودة مصروف',
  CREATE_STAFF_SCHEDULE_DRAFT: 'مسودة جدول موظفين',
  CREATE_CUSTOMER_COMPENSATION_DRAFT: 'مسودة تعويض عميل',
};

const STATUS_LABELS: Record<ActionStatus, string> = {
  DRAFT: 'مسودة فقط',
  AWAITING_APPROVAL: 'بانتظار الموافقة',
  APPROVED: 'تمت الموافقة',
  REJECTED: 'مرفوض',
  EXPIRED: 'منتهي الصلاحية',
  STALE: 'البيانات تغيرت',
  EXECUTING: 'جارٍ التنفيذ',
  EXECUTED: 'تم التنفيذ والتحقق',
  FAILED: 'فشل التنفيذ',
  ROLLED_BACK: 'فشل وتم التراجع',
  CANCELLED: 'ملغي',
};

const RISK_STYLES: Record<ActionProposal['riskLevel'], string> = {
  LOW: 'bg-emerald-50 text-emerald-700',
  MEDIUM: 'bg-amber-50 text-amber-800',
  HIGH: 'bg-rose-50 text-rose-700',
  CRITICAL: 'bg-red-100 text-red-800',
};

function ApprovalPanel({
  proposal,
  onUpdated,
  onError,
}: {
  proposal: ActionProposal;
  onUpdated: (proposal: ActionProposal) => void;
  onError: (message: string) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>(() => stringValues(proposal.proposedState));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setEditValues(stringValues(proposal.proposedState));
    setConfirmationCode('');
    setEditing(false);
  }, [proposal.proposalId, proposal.proposedState]);

  const remainingMs = Math.max(0, Date.parse(proposal.expiresAt) - now);
  const canDecide = proposal.status === 'AWAITING_APPROVAL';
  const canEdit = ['DRAFT', 'AWAITING_APPROVAL'].includes(proposal.status);
  const highCodeReady = proposal.riskLevel !== 'HIGH' || confirmationCode.trim().toUpperCase() === proposal.proposalId;

  const perform = async (action: () => Promise<ActionProposal>) => {
    setBusy(true);
    onError('');
    try {
      onUpdated(await action());
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        const payload = requestError.response?.data;
        onError(String(payload?.message?.message || payload?.message || 'تعذر تنفيذ القرار. لم يتم تسجيل نجاح جزئي.'));
        const returnedProposal = payload?.message?.refreshedProposal || payload?.refreshedProposal || payload?.message?.proposal || payload?.proposal;
        if (returnedProposal?.proposalId) onUpdated(returnedProposal as ActionProposal);
      } else {
        onError('تعذر تنفيذ القرار. لم يتم تغيير أي بيانات خارج معاملة مكتملة.');
      }
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = () => {
    const nextState = Object.fromEntries(Object.entries(proposal.proposedState).map(([key, original]) => [
      key,
      parseEditedValue(original, editValues[key] ?? ''),
    ]));
    void perform(() => editOwnerAction(proposal.proposalId, nextState, 'تم التعديل من بطاقة موافقة المالك'));
  };

  return (
    <section className="mt-5 border-t-2 border-gray-900 pt-4" aria-label={`مقترح ${proposal.proposalId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold text-gray-500">مقترح رقم {proposal.proposalId} · نسخة {proposal.version}</p>
          <h3 className="mt-1 text-sm font-bold text-gray-950">{ACTION_LABELS[proposal.actionType] || proposal.actionType}</h3>
          <p className="mt-1 text-xs text-gray-600">{proposal.resource.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`px-2 py-1 text-[11px] font-bold ${RISK_STYLES[proposal.riskLevel]}`}>مخاطرة {proposal.riskLevel}</span>
          <span className="bg-gray-100 px-2 py-1 text-[11px] font-bold text-gray-700">{STATUS_LABELS[proposal.status]}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-x-6 gap-y-2 border-y border-gray-200 py-3 sm:grid-cols-2">
        {Object.keys({ ...proposal.currentState, ...proposal.proposedState }).map((key) => (
          <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-xs">
            <span className="truncate font-medium text-gray-600">{fieldLabel(key)}</span>
            <span className="text-gray-500">{displayValue(proposal.currentState[key])}</span>
            <span className="font-bold text-gray-950">← {displayValue(proposal.proposedState[key])}</span>
          </div>
        ))}
      </div>

      {editing && (
        <div className="mt-3 border-b border-gray-200 pb-3">
          <p className="mb-2 text-xs font-bold text-gray-700">تعديل القيم المقترحة سينشئ نسخة جديدة ويلغي القديمة</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(proposal.proposedState).map(([key, value]) => (
              <label key={key} className="text-[11px] font-semibold text-gray-600">
                {fieldLabel(key)}
                {typeof value === 'boolean' ? (
                  <select
                    value={editValues[key]}
                    onChange={(event) => setEditValues((current) => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 h-9 w-full border border-gray-300 bg-white px-2 text-xs text-gray-900 outline-none focus:border-gray-900"
                  >
                    <option value="true">نعم</option>
                    <option value="false">لا</option>
                  </select>
                ) : (
                  <input
                    value={editValues[key] ?? ''}
                    onChange={(event) => setEditValues((current) => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 h-9 w-full border border-gray-300 px-2 text-xs text-gray-900 outline-none focus:border-gray-900"
                  />
                )}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={saveEdit} className="h-9 bg-gray-900 px-3 text-xs font-bold text-white disabled:opacity-50">حفظ نسخة جديدة</button>
            <button type="button" onClick={() => setEditing(false)} className="h-9 border border-gray-300 px-3 text-xs font-bold text-gray-700">رجوع</button>
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-2 text-xs leading-5 text-gray-700 sm:grid-cols-2">
        {proposal.impact.financial && <p><strong>الأثر المالي:</strong> {proposal.impact.financial}</p>}
        {proposal.impact.operational && <p><strong>الأثر التشغيلي:</strong> {proposal.impact.operational}</p>}
        {proposal.impact.customer && <p><strong>أثر العملاء:</strong> {proposal.impact.customer}</p>}
        {proposal.impact.inventory && <p><strong>أثر المخزون:</strong> {proposal.impact.inventory}</p>}
        <p><strong>الفرع:</strong> {proposal.branchNames.join('، ') || 'كل الفروع'}</p>
        <p><strong>قابلية التراجع:</strong> {proposal.reversibility}</p>
      </div>

      {proposal.impact.whatWillNotChange.length > 0 && (
        <p className="mt-3 text-xs leading-5 text-gray-600"><strong>لن يتغير:</strong> {proposal.impact.whatWillNotChange.join('، ')}</p>
      )}

      {proposal.warnings.length > 0 && (
        <div className="mt-3 flex items-start gap-2 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{proposal.warnings.join(' ')}</span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> ينتهي خلال {formatRemaining(remainingMs)}</span>
        <span>أُنشئ {formatDate(proposal.createdAt)}</span>
        {proposal.execution && <span>عملية {proposal.execution.executionId}</span>}
      </div>

      {canDecide && proposal.riskLevel === 'HIGH' && (
        <label className="mt-3 block text-xs font-bold text-rose-800">
          اكتب كود المقترح {proposal.proposalId} للتأكيد
          <input
            value={confirmationCode}
            onChange={(event) => setConfirmationCode(event.target.value)}
            autoComplete="off"
            className="mt-1 h-10 w-full max-w-xs border border-rose-300 bg-white px-3 font-mono text-sm uppercase text-gray-950 outline-none focus:border-rose-600"
          />
        </label>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canDecide && (
          <button
            type="button"
            disabled={busy || !highCodeReady || remainingMs === 0}
            onClick={() => void perform(() => approveOwnerAction(proposal.proposalId, `APPROVE ${proposal.proposalId}`, confirmationCode || undefined))}
            className="inline-flex h-10 items-center gap-2 bg-emerald-700 px-4 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            اعتماد وتنفيذ {proposal.proposalId}
          </button>
        )}
        {canDecide && (
          <button type="button" disabled={busy} onClick={() => void perform(() => rejectOwnerAction(proposal.proposalId, 'رفضه المالك من بطاقة الموافقة'))} className="inline-flex h-10 items-center gap-2 border border-rose-300 px-3 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-40">
            <Ban className="h-4 w-4" /> رفض
          </button>
        )}
        {canEdit && (
          <button type="button" disabled={busy} onClick={() => setEditing((value) => !value)} className="inline-flex h-10 items-center gap-2 border border-gray-300 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            <Pencil className="h-4 w-4" /> تعديل المقترح
          </button>
        )}
        {canEdit && (
          <button type="button" disabled={busy} onClick={() => void perform(() => cancelOwnerAction(proposal.proposalId))} className="inline-flex h-10 items-center gap-2 px-3 text-xs font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-40">
            <XCircle className="h-4 w-4" /> إلغاء
          </button>
        )}
      </div>

      {proposal.failure && <p className="mt-3 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{proposal.failure}</p>}
      {proposal.status === 'EXECUTED' && proposal.execution?.verified && (
        <p className="mt-3 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">تم التنفيذ مرة واحدة والتحقق من النتيجة الفعلية.</p>
      )}
    </section>
  );
}

function stringValues(values: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value ?? '')]));
}

function parseEditedValue(original: unknown, value: string): unknown {
  if (typeof original === 'number') return Number(value);
  if (typeof original === 'boolean') return value === 'true';
  if (Array.isArray(original)) return value.split(',').map((item) => item.trim()).filter(Boolean);
  return value;
}

function displayValue(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'لا يوجد';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function fieldLabel(key: string): string {
  const labels: Record<string, string> = {
    price: 'السعر', cost: 'التكلفة', active: 'مفعّل', isAvailable: 'متاح', minThreshold: 'الحد الأدنى',
    currentQty: 'المخزون الحالي', amount: 'القيمة', category: 'التصنيف', paymentMethod: 'طريقة الدفع',
    expenseDate: 'تاريخ المصروف', description: 'الوصف', discountPercent: 'نسبة الخصم', proposedPrice: 'سعر العرض',
    branchPrice: 'سعر الفرع', activeOrderItems: 'عناصر الطلبات النشطة', version: 'نسخة المخزون', scope: 'النطاق',
  };
  return labels[key] || key;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'انتهت الصلاحية';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return hours > 0 ? `${hours}س ${minutes}د` : `${minutes}د ${seconds}ث`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

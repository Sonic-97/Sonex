'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  Bot,
  Sparkles,
  Save,
  MessageSquare,
  ShieldCheck,
  Zap,
  Terminal,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Send,
  Coffee,
  DollarSign,
  Truck,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface AiConfig {
  id?: string;
  cafeId?: string;
  botName: string;
  tone: string;
  welcomeMessage: string;
  customInstructions: string;
  deliveryNotes: string;
  openingHoursNotes: string;
  enableRecommendations: boolean;
  maxUpsellsPerSession?: number;
  configVersion?: number;
}

interface ToolExecution {
  tool: string;
  input: any;
  result: any;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  toolsCalled?: ToolExecution[];
  verifiedProducts?: string[];
  calculatedQuote?: any;
  modelUsed?: string;
}

const TONE_OPTIONS = [
  {
    id: 'EGYPTIAN_CASUAL',
    label: 'عامية مصرية ودودة',
    badge: 'الأكثر شعبية',
    desc: 'أسلوب شبابي دافئ وترحيبي مثل الباريستا المصري المفضل لديك.',
    sample: '"يا هلا بيك! منورنا يا فندم، تحب تبدأ بيومك بلاتيه مظبوط ولا قهوة تركي تفوق؟"',
  },
  {
    id: 'PROFESSIONAL',
    label: 'عربية فصحى مهنية',
    badge: 'رسمي وراقي',
    desc: 'لغة عربية راقية ورسمية تناسب الكافيهات الفاخرة وأجواء الأعمال.',
    sample: '"أهلاً وسهلاً بك في مقهانا. نسعد بخدمتك، تفضل بالاطلاع على قائمتنا المختارة."',
  },
  {
    id: 'FAST_CONCISE',
    label: 'سريع وموجز',
    badge: 'إنتاجي عالي',
    desc: 'إجابات مباشرة ودقيقة تركز على سرعة تنفيذ الطلبات بدون كلام إضافي.',
    sample: '"مرحباً بك. القائمة والأسعار جاهزة، أرسل طلبك وسنؤكده فوراً."',
  },
];

const QUICK_PROMPTS = [
  'عندكم ايه مشروبات سخنة؟',
  'بكام اللاتيه والكابتشينو؟',
  'عايز اطلب ٢ لاتيه وسط وكرواسون',
  'هل التوصيل شغال دلوقتي؟',
  'عندكم شاي كرك مثلج؟',
];

export default function OwnerAiSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<AiConfig>({
    botName: 'باريستا الكافيه الذكي',
    tone: 'EGYPTIAN_CASUAL',
    welcomeMessage: 'يا هلا بيك في كافيه سونيك! منورنا، تحب تشرب ايه انهاردة؟',
    customInstructions: 'اسأل الزبون دائماً عن درجة تحميص البن المفضلة لديه (فاتح أو وسط أو غامق) ونسبة السكر.',
    deliveryNotes: 'التوصيل متاح في نطاق الحي والأحياء المجاورة بحد أدنى للطلب 50 جنيه.',
    openingHoursNotes: 'شغالين يومياً من 8 صباحاً حتى 12 منتصف الليل.',
    enableRecommendations: true,
  });

  // Simulator state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [expandedDebugId, setExpandedDebugId] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const res = await api.get('/owner/ai-settings');
      if (res.data?.config) {
        setConfig((prev) => ({
          ...prev,
          ...res.data.config,
        }));
      }
      const welcome = res.data?.config?.welcomeMessage || config.welcomeMessage;
      setMessages([
        {
          id: 'welcome-0',
          sender: 'assistant',
          text: welcome,
          timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      toast.error('تعذر تحميل إعدادات الـ AI: ' + (err?.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.post('/owner/ai-settings', config);
      toast.success('تم حفظ إعدادات وتخصيص الـ AI بنجاح');
    } catch (err: any) {
      toast.error('حدث خطأ أثناء الحفظ: ' + (err?.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || simulating) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setSimulating(true);

    try {
      const res = await api.post('/owner/ai-settings/simulate', {
        message: text,
        phone: '+201000000000',
        customerName: 'عميل تجريبي',
      });

      const data = res.data;
      const assistantMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        text: data.reply,
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        toolsCalled: data.toolsCalled,
        verifiedProducts: data.verifiedProducts,
        calculatedQuote: data.calculatedQuote,
        modelUsed: data.modelUsed,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      if (data.toolsCalled && data.toolsCalled.length > 0) {
        setExpandedDebugId(assistantMsg.id);
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: 'عذراً، حدث خطأ أثناء المحاكاة: ' + (err?.response?.data?.message || err.message),
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSimulating(false);
    }
  };

  const resetChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'assistant',
        text: config.welcomeMessage || 'أهلاً بك! كيف يمكنني مساعدتك؟',
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setExpandedDebugId(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#8C6239] border-t-transparent" />
          <p className="text-sm font-medium text-stone-600">جاري تحميل إعدادات الذكاء الاصطناعي...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#17100e] via-[#2a1c18] to-[#17100e] p-6 text-white shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#8C6239] shadow-lg shadow-[#8C6239]/40">
              <Bot className="h-8 w-8 text-[#FDFBF7]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-[#FDFBF7]">
                  تخصيص مساعد الذكاء الاصطناعي للكافيه
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-500/30">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  مربوط بقاعدة البيانات المباشرة
                </span>
              </div>
              <p className="mt-1 text-sm text-stone-300">
                درّب المساعد ليتحدث بأسلوب كافيهك الخاص، ويفهم زبائنك، مع معرفة حية فورية بالمنيو والأسعار بدون أي هلاوس.
              </p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#8C6239] px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-[#a67545] transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ التخصيص
          </button>
        </div>
      </div>

      {/* Main Grid: Left Settings Form, Right Live Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Settings Form (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Persona Card */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-4 mb-5">
              <Sparkles className="h-5 w-5 text-[#8C6239]" />
              <h2 className="text-lg font-bold text-stone-900">هوية وأسلوب المساعد (Persona & Tone)</h2>
            </div>

            <div className="space-y-5">
              {/* Bot Name */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                  اسم المساعد (Bot Name)
                </label>
                <input
                  type="text"
                  value={config.botName}
                  onChange={(e) => setConfig({ ...config, botName: e.target.value })}
                  placeholder="مثال: باريستا سونيك، مساعد قهوتك"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-medium text-stone-900 focus:bg-white focus:border-[#8C6239] focus:outline-none transition-colors"
                />
              </div>

              {/* Tone Selection */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                  نبرة وأسلوب الحوار (Tone)
                </label>
                <div className="grid grid-cols-1 gap-3">
                  {TONE_OPTIONS.map((opt) => {
                    const isSelected = config.tone === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => setConfig({ ...config, tone: opt.id })}
                        className={`cursor-pointer rounded-xl border p-4 transition-all ${
                          isSelected
                            ? 'border-[#8C6239] bg-[#8C6239]/5 ring-1 ring-[#8C6239]'
                            : 'border-stone-200 hover:border-stone-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                                isSelected ? 'border-[#8C6239] bg-[#8C6239]' : 'border-stone-300'
                              }`}
                            >
                              {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </div>
                            <span className="font-bold text-sm text-stone-900">{opt.label}</span>
                          </div>
                          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                            {opt.badge}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-stone-500 mr-6">{opt.desc}</p>
                        <div className="mt-2.5 mr-6 rounded-lg bg-stone-100/70 p-2 text-xs italic text-stone-600">
                          {opt.sample}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Welcome Message */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                  رسالة الترحيب الأولى للعميل (Welcome Message)
                </label>
                <textarea
                  rows={2}
                  value={config.welcomeMessage}
                  onChange={(e) => setConfig({ ...config, welcomeMessage: e.target.value })}
                  placeholder="أدخل رسالة الترحيب التي تُرسل للعميل عند بدء المحادثة..."
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-medium text-stone-900 focus:bg-white focus:border-[#8C6239] focus:outline-none transition-colors"
                />
              </div>

              {/* Custom Instructions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                    تعليمات وتوجيهات خاصة بالباريستا (Custom Prompt Guidance)
                  </label>
                  <span className="text-[11px] text-stone-400">توجيهات حوارية آمنة</span>
                </div>
                <textarea
                  rows={3}
                  value={config.customInstructions}
                  onChange={(e) => setConfig({ ...config, customInstructions: e.target.value })}
                  placeholder="مثال: تأكد من سؤال الزبون دائماً عن نوع البن فاتح ولا غامق، واقترح عليه إضافة كوكيز مع المشروبات الساخنة..."
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-medium text-stone-900 focus:bg-white focus:border-[#8C6239] focus:outline-none transition-colors"
                />
                <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200/60">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                  <p>
                    <strong>ضمان الأمان:</strong> هذه التعليمات تحكم نبرة وأسلوب الحوار فقط. لن يتمكن المساعد من تعديل الأسعار، إعطاء خصومات غير مسجلة، أو بيع منتجات غير موجودة بقاعدة البيانات.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Operational Knowledge Card */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-4 mb-5">
              <Coffee className="h-5 w-5 text-[#8C6239]" />
              <h2 className="text-lg font-bold text-stone-900">معلومات التشغيل والتوصيل (Operational Knowledge)</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                  <Truck className="h-3.5 w-3.5 text-[#8C6239]" />
                  ملاحظات التوصيل ونطاقه (Delivery Notes)
                </label>
                <input
                  type="text"
                  value={config.deliveryNotes}
                  onChange={(e) => setConfig({ ...config, deliveryNotes: e.target.value })}
                  placeholder="مثال: التوصيل متاح لمناطق وسط البلد والجامعة بحد أدنى 40 ج"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-medium text-stone-900 focus:bg-white focus:border-[#8C6239] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                  <Clock className="h-3.5 w-3.5 text-[#8C6239]" />
                  ملاحظات مواعيد العمل (Opening Hours Notes)
                </label>
                <input
                  type="text"
                  value={config.openingHoursNotes}
                  onChange={(e) => setConfig({ ...config, openingHoursNotes: e.target.value })}
                  placeholder="مثال: شغالين كل يوم من 8 صباحاً حتى 12 بالليل، ويوم الجمعة بعد الصلاة"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-medium text-stone-900 focus:bg-white focus:border-[#8C6239] focus:outline-none transition-colors"
                />
              </div>

              {/* Upselling Toggle */}
              <div className="flex items-center justify-between rounded-xl bg-stone-50 p-4 border border-stone-200">
                <div className="space-y-0.5">
                  <span className="text-sm font-bold text-stone-900">تفعيل اقتراحات البيع الإضافي الذكية (Upselling)</span>
                  <p className="text-xs text-stone-500">
                    يقترح المساعد منتجات مكملة (مثل مخبوزات أو كوكيز) بحد أقصى اقتراح واحد في الجلسة دون إزعاج.
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={config.enableRecommendations}
                    onChange={(e) => setConfig({ ...config, enableRecommendations: e.target.checked })}
                    className="peer sr-only"
                  />
                  <div className="peer h-6 w-11 rounded-full bg-stone-300 after:absolute after:top-[2px] after:right-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-stone-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#8C6239] peer-checked:after:translate-x-[-20px] peer-checked:after:border-white"></div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Live Simulator Column (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden flex flex-col h-[740px]">
            {/* Simulator Header */}
            <div className="bg-[#17100e] p-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="h-9 w-9 rounded-full bg-[#8C6239] flex items-center justify-center font-bold text-white text-xs shadow-inner">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-[#17100e]" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#FDFBF7] flex items-center gap-1.5">
                    {config.botName || 'المساعد الذكي'}
                    <span className="rounded bg-white/10 px-1.5 py-0.2 text-[10px] text-stone-300 font-normal">
                      محاكي حي
                    </span>
                  </h3>
                  <p className="text-[11px] text-stone-400">متصل بمنيو الكافيه الفعلي</p>
                </div>
              </div>
              <button
                onClick={resetChat}
                title="إعادة ضبط المحادثة"
                className="rounded-lg p-2 text-stone-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            {/* Simulation Warning Banner */}
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-[11px] text-amber-800 flex items-center gap-1.5 shrink-0">
              <Zap className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span>وضع المحاكاة: يتم استخدام منيو كافيهك الحقيقي بدون إرسال رسائل حقيقية للعملاء.</span>
            </div>

            {/* Quick Prompts Bar */}
            <div className="border-b border-stone-100 bg-stone-50/70 p-2.5 overflow-x-auto flex gap-1.5 shrink-0 scrollbar-none">
              {QUICK_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(prompt)}
                  disabled={simulating}
                  className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-medium text-stone-700 hover:border-[#8C6239] hover:text-[#8C6239] transition-all disabled:opacity-50 cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Chat Messages Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#FDFBF7]/50">
              {messages.map((msg) => {
                const isUser = msg.sender === 'user';
                const hasDebug = msg.toolsCalled && msg.toolsCalled.length > 0;
                const isExpanded = expandedDebugId === msg.id;

                return (
                  <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl p-3.5 text-sm leading-relaxed shadow-xs ${
                        isUser
                          ? 'bg-[#8C6239] text-white rounded-br-xs'
                          : 'bg-white text-stone-800 border border-stone-200 rounded-bl-xs'
                      }`}
                    >
                      <p className="whitespace-pre-line">{msg.text}</p>
                      <div
                        className={`mt-1.5 text-[10px] ${
                          isUser ? 'text-stone-200 text-left' : 'text-stone-400 text-right'
                        }`}
                      >
                        {msg.timestamp}
                      </div>
                    </div>

                    {/* Debug Inspector Button & Panel (for Assistant messages with DB tools) */}
                    {!isUser && (hasDebug || msg.calculatedQuote || msg.verifiedProducts) && (
                      <div className="mt-1.5 max-w-[90%] w-full">
                        <button
                          onClick={() => setExpandedDebugId(isExpanded ? null : msg.id)}
                          className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-100/90 px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-200 transition-colors cursor-pointer"
                        >
                          <Terminal className="h-3 w-3 text-[#8C6239]" />
                          <span>فاحص الأدوات وقاعدة البيانات ({msg.toolsCalled?.length || 0})</span>
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="mt-2 space-y-2.5 rounded-xl border border-stone-200 bg-white p-3 text-xs shadow-sm">
                            {/* Model Used */}
                            <div className="flex items-center justify-between text-[11px] border-b border-stone-100 pb-1.5">
                              <span className="font-semibold text-stone-500">المحرك:</span>
                              <span className="rounded bg-stone-100 px-2 py-0.5 font-mono text-[10px] text-stone-700">
                                {msg.modelUsed || 'Grounded Engine'}
                              </span>
                            </div>

                            {/* Verified Products */}
                            {msg.verifiedProducts && msg.verifiedProducts.length > 0 && (
                              <div className="text-[11px]">
                                <span className="font-semibold text-emerald-700 block mb-1">
                                  ✓ منتجات تم التحقق منها في المنيو:
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {msg.verifiedProducts.map((p, i) => (
                                    <span
                                      key={i}
                                      className="rounded bg-emerald-50 text-emerald-800 px-2 py-0.5 text-[10px] font-medium border border-emerald-200"
                                    >
                                      {p}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Deterministic Order Quote */}
                            {msg.calculatedQuote && (
                              <div className="rounded-lg bg-stone-50 p-2.5 border border-stone-200 text-[11px] space-y-1">
                                <span className="font-bold text-stone-800 block">
                                  حسبة الفاتورة المعتمدة (Calculated Quote):
                                </span>
                                <div className="flex justify-between">
                                  <span className="text-stone-500">إجمالي الأصناف:</span>
                                  <span className="font-semibold">{msg.calculatedQuote.subtotal} ج</span>
                                </div>
                                {msg.calculatedQuote.discountAmount > 0 && (
                                  <div className="flex justify-between text-emerald-600">
                                    <span>الخصم المطبق:</span>
                                    <span>-{msg.calculatedQuote.discountAmount} ج</span>
                                  </div>
                                )}
                                <div className="flex justify-between">
                                  <span className="text-stone-500">رسوم التوصيل:</span>
                                  <span className="font-semibold">{msg.calculatedQuote.deliveryFee} ج</span>
                                </div>
                                <div className="flex justify-between border-t border-stone-200 pt-1 font-bold text-stone-900">
                                  <span>الإجمالي النهائي:</span>
                                  <span>{msg.calculatedQuote.total} ج</span>
                                </div>
                              </div>
                            )}

                            {/* Tools Execution Log */}
                            {msg.toolsCalled && msg.toolsCalled.length > 0 && (
                              <div className="space-y-1.5 text-[11px]">
                                <span className="font-semibold text-stone-700 block">الأدوات المستدعاة:</span>
                                {msg.toolsCalled.map((t, i) => (
                                  <div key={i} className="rounded-md bg-stone-900 text-stone-200 p-2 font-mono text-[10px]">
                                    <div className="text-amber-400 font-bold">tool: {t.tool}</div>
                                    <div className="text-stone-400">args: {JSON.stringify(t.input)}</div>
                                    <div className="text-emerald-400 truncate">
                                      res: {JSON.stringify(t.result).substring(0, 120)}...
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {simulating && (
                <div className="flex items-center gap-2 text-stone-400 text-xs">
                  <div className="h-2 w-2 animate-ping rounded-full bg-[#8C6239]" />
                  <span>المساعد يستعلم من قاعدة البيانات ويولد الرد...</span>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-stone-200 bg-white shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="اكتب رسالة تجريبية كأنك زبون..."
                  disabled={simulating}
                  className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-medium text-stone-900 focus:bg-white focus:border-[#8C6239] focus:outline-none transition-colors"
                />
                <button
                  type="submit"
                  disabled={simulating || !inputText.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#8C6239] text-white shadow-sm hover:bg-[#a67545] transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <Send className="h-4 w-4 rtl:rotate-180" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

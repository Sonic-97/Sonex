import { Injectable } from '@nestjs/common';
import {
  OwnerCopilotContextState,
  OwnerCopilotIntent,
  OwnerCopilotPermission,
  OwnerCopilotToolName,
  OwnerIntentResult,
  OwnerResolvedDateRange,
} from './owner-copilot.types';

@Injectable()
export class OwnerCopilotUnderstandingService {
  private readonly intentTools: Record<OwnerCopilotIntent, OwnerCopilotToolName[]> = {
    OWNER_GREETING: [],
    OWNER_HELP: [],
    OWNER_SALES_SUMMARY: ['getSalesSummary'],
    OWNER_REVENUE_ANALYSIS: ['getRevenueBreakdown'],
    OWNER_GROSS_PROFIT_ANALYSIS: ['getProfitSummary'],
    OWNER_NET_PROFIT_ANALYSIS: ['getProfitSummary', 'getExpenseSummary'],
    OWNER_EXPENSE_ANALYSIS: ['getExpenseSummary'],
    OWNER_PRODUCT_PERFORMANCE: ['getProductPerformance'],
    OWNER_PRODUCT_PROFITABILITY: ['getProductProfitability'],
    OWNER_CATEGORY_ANALYSIS: ['getCategoryPerformance'],
    OWNER_ORDER_ANALYSIS: ['getOrderMetrics'],
    OWNER_CANCELLATION_ANALYSIS: ['getCancellationMetrics'],
    OWNER_CUSTOMER_ANALYSIS: ['getCustomerMetrics'],
    OWNER_CUSTOMER_RETENTION: ['getCustomerRetention'],
    OWNER_INVENTORY_HEALTH: ['getInventoryHealth'],
    OWNER_STOCKOUT_RISK: ['getStockoutRisk'],
    OWNER_WASTE_ANALYSIS: ['getWasteMetrics', 'getConsumptionMetrics'],
    OWNER_BRANCH_COMPARISON: ['getBranchComparison'],
    OWNER_STAFF_PERFORMANCE: ['getStaffPerformance'],
    OWNER_ATTENDANCE_ANALYSIS: ['getAttendanceMetrics'],
    OWNER_DRIVER_ANALYSIS: ['getDriverMetrics'],
    OWNER_DEBT_ANALYSIS: ['getDebtSummary'],
    OWNER_PAYMENT_ANALYSIS: ['getPaymentSummary'],
    OWNER_SETTLEMENT_ANALYSIS: ['getSettlementSummary'],
    OWNER_PEAK_HOURS: ['getPeakHours'],
    OWNER_ALERT_SUMMARY: ['getBusinessAlerts'],
    OWNER_EXPLAIN_CHANGE: ['getSalesSummary', 'getProfitSummary', 'getExpenseSummary'],
    OWNER_RECOMMEND_ACTION: ['getBusinessAlerts', 'getSalesSummary', 'getInventoryHealth'],
    OWNER_OFFER_PROPOSAL: ['getProductPerformance', 'getProductProfitability', 'getInventoryHealth'],
    OWNER_FORECAST_REQUEST: [],
    OWNER_SALES_FORECAST: ['getSalesForecast'],
    OWNER_ORDER_FORECAST: ['getOrderVolumeForecast'],
    OWNER_PRODUCT_DEMAND_FORECAST: ['getProductDemandForecast'],
    OWNER_INVENTORY_FORECAST: ['getIngredientConsumptionForecast'],
    OWNER_STAFFING_ESTIMATE: ['getStaffingDemandEstimate'],
    OWNER_WASTE_RISK: ['getWasteRiskEstimate'],
    OWNER_OFFER_SIMULATION: ['simulateDiscount'],
    OWNER_COMBO_SIMULATION: ['simulateCombo'],
    OWNER_PRICE_SIMULATION: ['simulatePriceChange'],
    OWNER_SCENARIO_COMPARISON: ['compareOfferScenarios'],
    OWNER_EXPORT_REQUEST: [],
    OWNER_WRITE_ACTION_REQUEST: [],
    OWNER_UNKNOWN: ['getSalesSummary', 'getProfitSummary', 'getBusinessAlerts'],
  };

  classify(
    question: string,
    timezone = 'Africa/Cairo',
    now = new Date(),
    previous?: OwnerCopilotContextState,
  ): OwnerIntentResult {
    const normalized = this.normalize(question);
    const securityViolation = this.detectSecurityViolation(normalized);
    const branchReference = this.extractBranchReference(question);
    const isFollowUp = Boolean(previous) && this.isFollowUp(normalized, branchReference);
    const comparison = this.requestsComparison(normalized) ? 'PREVIOUS_PERIOD' : 'NONE';
    const writeActionRequested = this.isWriteAction(normalized) && !/(محاكاة|simulate|simulation|لو)/.test(normalized);

    let intent = securityViolation ? 'OWNER_UNKNOWN' : this.classifyIntent(normalized, writeActionRequested);
    if (
      previous
      && isFollowUp
      && intent === 'OWNER_UNKNOWN'
      && !securityViolation
      && !writeActionRequested
    ) {
      intent = previous.intent;
    }

    const hasDate = this.hasDateExpression(normalized);
    let dateRange = hasDate
      ? this.resolveDateRange(normalized, timezone, now, comparison === 'PREVIOUS_PERIOD')
      : previous && isFollowUp
        ? this.cloneDateRange(previous.dateRange, comparison === 'PREVIOUS_PERIOD')
        : this.resolveDefaultDateRange(intent, timezone, now);

    if (comparison === 'PREVIOUS_PERIOD' && !dateRange.comparison) {
      dateRange = this.addComparison(dateRange);
    }

    return {
      intent,
      confidence: securityViolation ? 1 : this.intentConfidence(intent),
      dateRange,
      branchReference,
      comparison: comparison === 'PREVIOUS_PERIOD'
        ? comparison
        : previous && isFollowUp ? previous.comparison : 'NONE',
      requestedMetrics: this.requestedMetrics(intent),
      writeActionRequested,
      requestedAction: writeActionRequested ? question.trim().slice(0, 300) : undefined,
      securityViolation,
      isFollowUp,
      rawQuestion: question,
    };
  }

  toolsForIntent(intent: OwnerCopilotIntent): OwnerCopilotToolName[] {
    return [...this.intentTools[intent]];
  }

  permissionForIntent(intent: OwnerCopilotIntent): OwnerCopilotPermission | null {
    if (['OWNER_NET_PROFIT_ANALYSIS', 'OWNER_GROSS_PROFIT_ANALYSIS', 'OWNER_REVENUE_ANALYSIS', 'OWNER_EXPENSE_ANALYSIS', 'OWNER_DEBT_ANALYSIS', 'OWNER_PAYMENT_ANALYSIS', 'OWNER_SETTLEMENT_ANALYSIS', 'OWNER_OFFER_PROPOSAL', 'OWNER_OFFER_SIMULATION', 'OWNER_COMBO_SIMULATION', 'OWNER_PRICE_SIMULATION', 'OWNER_SCENARIO_COMPARISON'].includes(intent)) {
      return 'FINANCE_READ';
    }
    if (['OWNER_PRODUCT_PERFORMANCE', 'OWNER_PRODUCT_PROFITABILITY', 'OWNER_CATEGORY_ANALYSIS'].includes(intent)) return 'PRODUCT_READ';
    if (['OWNER_CUSTOMER_ANALYSIS', 'OWNER_CUSTOMER_RETENTION'].includes(intent)) return 'CUSTOMER_AGGREGATE_READ';
    if (['OWNER_INVENTORY_HEALTH', 'OWNER_STOCKOUT_RISK', 'OWNER_WASTE_ANALYSIS', 'OWNER_INVENTORY_FORECAST', 'OWNER_WASTE_RISK'].includes(intent)) return 'INVENTORY_READ';
    if (['OWNER_STAFF_PERFORMANCE', 'OWNER_ATTENDANCE_ANALYSIS', 'OWNER_STAFFING_ESTIMATE'].includes(intent)) return 'STAFF_READ';
    if (['OWNER_PRODUCT_DEMAND_FORECAST'].includes(intent)) return 'PRODUCT_READ';
    if (['OWNER_DRIVER_ANALYSIS', 'OWNER_ALERT_SUMMARY', 'OWNER_RECOMMEND_ACTION'].includes(intent)) return 'OPERATIONS_READ';
    if (['OWNER_GREETING', 'OWNER_HELP', 'OWNER_FORECAST_REQUEST', 'OWNER_EXPORT_REQUEST', 'OWNER_WRITE_ACTION_REQUEST'].includes(intent)) return null;
    return 'SALES_READ';
  }

  hasDateExpression(text: string): boolean {
    return /(النهارده|اليوم|امس|اول امبارح|الاسبوع|الشهر|اخر\s*\d+|آخر\s*\d+|من اول الشهر|من يوم|الورديه|الصبح)/.test(this.normalize(text));
  }

  resolveDateRange(
    normalizedQuestion: string,
    timezone: string,
    now = new Date(),
    withComparison = false,
  ): OwnerResolvedDateRange {
    const text = this.normalize(normalizedQuestion);
    const today = this.zonedCalendarDate(now, timezone);
    let type: OwnerResolvedDateRange['type'] = 'TODAY';
    let start = today;
    let end: { year: number; month: number; day: number } | null = null;
    let fromHour = 0;
    let toHour = 24;
    let isIncomplete = true;

    if (/اول امبارح/.test(text)) {
      type = 'DAY_BEFORE_YESTERDAY';
      start = this.addCalendarDays(today, -2);
      end = this.addCalendarDays(start, 1);
      isIncomplete = false;
    } else if (/امس/.test(text)) {
      type = 'YESTERDAY';
      start = this.addCalendarDays(today, -1);
      end = this.addCalendarDays(start, 1);
      isIncomplete = false;
    } else if (/الاسبوع اللي فات|الاسبوع الماضي/.test(text)) {
      type = 'LAST_WEEK';
      const thisWeek = this.startOfWeek(today);
      start = this.addCalendarDays(thisWeek, -7);
      end = thisWeek;
      isIncomplete = false;
    } else if (/الاسبوع ده|هذا الاسبوع|الاسبوع الحالي/.test(text)) {
      type = 'THIS_WEEK';
      start = this.startOfWeek(today);
    } else if (/الشهر اللي فات|الشهر الماضي/.test(text)) {
      type = 'LAST_MONTH';
      const thisMonth = { year: today.year, month: today.month, day: 1 };
      start = this.addCalendarMonths(thisMonth, -1);
      end = thisMonth;
      isIncomplete = false;
    } else if (/الشهر ده|هذا الشهر|من اول الشهر|الشهر الحالي/.test(text)) {
      type = 'THIS_MONTH';
      start = { year: today.year, month: today.month, day: 1 };
    } else if (/اخر\s*30\s*يوم/.test(text)) {
      type = 'LAST_30_DAYS';
      start = this.addCalendarDays(today, -29);
    } else if (/اخر\s*7\s*ايام|اخر\s*7\s*يوم/.test(text)) {
      type = 'LAST_7_DAYS';
      start = this.addCalendarDays(today, -6);
    } else if (/من يوم\s*(\d{1,2})\s*(?:ل|الى|الي)\s*(?:يوم\s*)?(\d{1,2})/.test(text)) {
      const match = text.match(/من يوم\s*(\d{1,2})\s*(?:ل|الى|الي)\s*(?:يوم\s*)?(\d{1,2})/)!;
      const firstDay = Math.max(1, Math.min(31, Number(match[1])));
      const lastDay = Math.max(firstDay, Math.min(31, Number(match[2])));
      type = 'MONTH_DAYS';
      start = { year: today.year, month: today.month, day: firstDay };
      end = this.addCalendarDays({ year: today.year, month: today.month, day: lastDay }, 1);
      isIncomplete = this.compareCalendar(end, this.addCalendarDays(today, 1)) > 0;
    } else if (/الورديه الحاليه/.test(text)) {
      type = 'CURRENT_SHIFT';
      fromHour = 6;
    } else if (/وقت الصبح|الصبح/.test(text)) {
      type = 'MORNING';
      fromHour = 6;
      toHour = 12;
    }

    const from = this.zonedDateToUtc(start, fromHour, 0, 0, timezone);
    const to = end
      ? new Date(this.zonedDateToUtc(end, 0, 0, 0, timezone).getTime() - 1)
      : type === 'MORNING'
        ? new Date(this.zonedDateToUtc(today, toHour, 0, 0, timezone).getTime() - 1)
        : now;
    let result: OwnerResolvedDateRange = {
      type,
      from,
      to: to.getTime() > now.getTime() && isIncomplete ? now : to,
      label: this.formatRange(from, to.getTime() > now.getTime() && isIncomplete ? now : to, timezone),
      isIncomplete,
    };
    if (withComparison) result = this.addComparison(result);
    return result;
  }

  private resolveDefaultDateRange(intent: OwnerCopilotIntent, timezone: string, now: Date): OwnerResolvedDateRange {
    const trendIntents: OwnerCopilotIntent[] = [
      'OWNER_EXPLAIN_CHANGE',
      'OWNER_CUSTOMER_RETENTION',
      'OWNER_RECOMMEND_ACTION',
      'OWNER_BRANCH_COMPARISON',
      'OWNER_PRODUCT_PERFORMANCE',
      'OWNER_PRODUCT_PROFITABILITY',
    ];
    if (trendIntents.includes(intent)) {
      return this.resolveDateRange('اخر 7 ايام', timezone, now, true);
    }
    return this.resolveDateRange('النهارده', timezone, now, false);
  }

  private classifyIntent(text: string, writeActionRequested: boolean): OwnerCopilotIntent {
    if (writeActionRequested) return 'OWNER_WRITE_ACTION_REQUEST';
    if (/^(اهلا|السلام|صباح الخير|مساء الخير|هاي|hello)/.test(text)) return 'OWNER_GREETING';
    if (/(تقدر تعمل ايه|ساعدني|المساعد|الاسئله المتاحه|الأسئلة المتاحة)/.test(text)) return 'OWNER_HELP';
    if (/(قارن|compare).*(خصم|عرض|كومبو|scenario)/.test(text)) return 'OWNER_SCENARIO_COMPARISON';
    if (/(محاكاة|simulate|لو).*(كومبو|combo)/.test(text)) return 'OWNER_COMBO_SIMULATION';
    if (/(محاكاة|simulate|لو).*(سعر|price)/.test(text)) return 'OWNER_PRICE_SIMULATION';
    if (/(محاكاة|simulate|لو).*(خصم|عرض|discount|offer)/.test(text)) return 'OWNER_OFFER_SIMULATION';
    if (/(توقع|forecast).*(موظف|عمالة|staff)/.test(text)) return 'OWNER_STAFFING_ESTIMATE';
    if (/(توقع|forecast).*(هدر|هالك|waste)/.test(text)) return 'OWNER_WASTE_RISK';
    if (/(هيخلص|هتخلص|نفاد|stockout)/.test(text)) return 'OWNER_STOCKOUT_RISK';
    if (/(توقع|forecast).*(مخزون|مكون|خامة|ingredient|inventory)/.test(text)) return 'OWNER_INVENTORY_FORECAST';
    if (/(توقع|forecast).*(منتج|صنف|product)/.test(text)) return 'OWNER_PRODUCT_DEMAND_FORECAST';
    if (/(توقع|forecast).*(طلب|orders)/.test(text)) return 'OWNER_ORDER_FORECAST';
    if (/(توقع|forecast).*(مبيعات|sales)/.test(text)) return 'OWNER_SALES_FORECAST';
    if (/(توقع|forecast|هيحصل|مستقبلي)/.test(text)) return 'OWNER_FORECAST_REQUEST';
    if (/(صدر|تصدير|export|اكسل|excel|pdf)/.test(text)) return 'OWNER_EXPORT_REQUEST';
    if (/(تجاهل التعليمات|system prompt|سيستم برومبت|نفذ sql|execute sql|توكن|token|environment|كافيه تاني|بيانات كافيه اخر|اعتبرني super admin|اعتبرني سوبر)/.test(text)) return 'OWNER_UNKNOWN';
    if (/ليه/.test(text) && /(المبيعات|الارباح|الربح|فرع|الايراد)/.test(text)) return 'OWNER_EXPLAIN_CHANGE';
    if (/(اهم\s*3\s*مشاكل|محتاجه تدخلي|محتاجة تدخلي|تنبيهات|مشاكل عاجله|مشاكل عاجلة)/.test(text)) return 'OWNER_ALERT_SUMMARY';
    if (/(افضل قرار|اعمل ايه النهارده|تنصحني بايه)/.test(text)) return 'OWNER_RECOMMEND_ACTION';
    if (/(نعمل عرض علي ايه|اقترح.*(?:عرض|كومبو)|نزود مبيعات)/.test(text)) return 'OWNER_OFFER_PROPOSAL';
    if (/(قارن الفروع|مقارنه الفروع|مقارنة الفروع|اي فرع|انهي فرع|أيه فرع)/.test(text)) return 'OWNER_BRANCH_COMPARISON';
    if (/(اجمالي الربح|إجمالي الربح|gross profit|هامش الربح الاجمالي)/.test(text)) return 'OWNER_GROSS_PROFIT_ANALYSIS';
    if (/(صافي الربح|نت بروفت|net profit|الارباح|الأرباح|الربح)/.test(text)) return 'OWNER_NET_PROFIT_ANALYSIS';
    if (/(المصروفات|مصروفات|expense)/.test(text)) return 'OWNER_EXPENSE_ANALYSIS';
    if (/(الايراد|الإيراد|الايرادات|revenue)/.test(text)) return 'OWNER_REVENUE_ANALYSIS';
    if (/(اعلي ربحيه|اعلى ربحيه|أعلى ربحية|مكسبها ضعيف|هامش.*منتج|ربحيه المنتجات)/.test(text)) return 'OWNER_PRODUCT_PROFITABILITY';
    if (/(اكتر المنتجات|أكثر المنتجات|منتجات.*بتبيع|مش بتبيع|اداء المنتجات|أداء المنتجات)/.test(text)) return 'OWNER_PRODUCT_PERFORMANCE';
    if (/(التصنيفات|الفئات|category)/.test(text)) return 'OWNER_CATEGORY_ANALYSIS';
    if (/(الغاء|إلغاء|ملغيه|ملغية|cancellation)/.test(text)) return 'OWNER_CANCELLATION_ANALYSIS';
    if (/(الطلبات|عدد الطلبات|متوسط الطلب)/.test(text)) return 'OWNER_ORDER_ANALYSIS';
    if (/(العملاء العائدين|الاحتفاظ|مبقوش يطلبوا|مش نشطين|retention|churn)/.test(text)) return 'OWNER_CUSTOMER_RETENTION';
    if (/(العملاء|عميل جديد|عملاء جدد)/.test(text)) return 'OWNER_CUSTOMER_ANALYSIS';
    if (/(هيخلص قريب|هتخلص قريب|تخلص قريب|نفاد|stockout)/.test(text)) return 'OWNER_STOCKOUT_RISK';
    if (/(هالك|اهدار|إهدار|waste)/.test(text)) return 'OWNER_WASTE_ANALYSIS';
    if (/(المخزون|الاصناف الحرجه|الأصناف الحرجة|الخامات|ناقص في ايه)/.test(text)) return 'OWNER_INVENTORY_HEALTH';
    if (/(الحضور|التاخير|التأخير|الورديات)/.test(text)) return 'OWNER_ATTENDANCE_ANALYSIS';
    if (/(الموظفين|اداء الموظف|أداء الموظف|الباريستا)/.test(text)) return 'OWNER_STAFF_PERFORMANCE';
    if (/(السواقين|السائقين|التوصيل|driver)/.test(text)) return 'OWNER_DRIVER_ANALYSIS';
    if (/(الديون|الدين|مديونيه|مديونية)/.test(text)) return 'OWNER_DEBT_ANALYSIS';
    if (/(التسويات|التسويه|settlement)/.test(text)) return 'OWNER_SETTLEMENT_ANALYSIS';
    if (/(المدفوعات|طرق الدفع|كاش|فيزا|payment)/.test(text)) return 'OWNER_PAYMENT_ANALYSIS';
    if (/(وقت الذروه|وقت الذروة|احسن ساعه|أحسن ساعة|peak)/.test(text)) return 'OWNER_PEAK_HOURS';
    if (/(المبيعات|بيعنا|بعنا|sales)/.test(text)) return 'OWNER_SALES_SUMMARY';
    return 'OWNER_UNKNOWN';
  }

  private detectSecurityViolation(text: string): string | undefined {
    if (/(تجاهل التعليمات|ignore instructions|system prompt|سيستم برومبت)/.test(text)) return 'PROMPT_INJECTION';
    if (/(نفذ sql|execute sql|select \*|drop table|قاعدة البيانات مباشره)/.test(text)) return 'ARBITRARY_SQL';
    if (/(توكن|token|كلمه السر|كلمة السر|password|secret|environment|env)/.test(text)) return 'SECRET_EXTRACTION';
    if (/(كافيه تاني|كافيه اخر|بيانات كافيه|foreign cafe|cross tenant)/.test(text)) return 'CROSS_TENANT_EXTRACTION';
    if (/(اعتبرني super admin|اعتبرني سوبر|انا سوبر ادمن|grant permission)/.test(text)) return 'ROLE_ESCALATION';
    return undefined;
  }

  private isWriteAction(text: string): boolean {
    return /(غير السعر|غيّر السعر|عدل السعر|اعمل خصم|اعمل عرض|فعل العرض|ابعت رساله|ابعت رسالة|شيل المنتج|عطل المنتج|زود المخزون|سجل مصروف|اقفل الورديه|اقفل الوردية|خصم للعميل|عدل المرتب|سجل دفع|اعمل ريفاند|نفذ)/.test(text);
  }

  private requestsComparison(text: string): boolean {
    return /(قارن|مقارنه|مقارنة|مقارنه ب|عن الاسبوع اللي فات|عن الشهر اللي فات|زاد ولا قل|اتغير|تغير)/.test(text);
  }

  private isFollowUp(text: string, branchReference: string | null): boolean {
    return Boolean(branchReference) || /^(طب|طيب|و|وقارنه|وقارنها|والفرع|طب فرع)/.test(text) || text.split(' ').length <= 5;
  }

  private extractBranchReference(question: string): string | null {
    const match = question.match(/فرع\s+([\p{L}\p{N}_ -]{2,50})/u);
    if (!match) return null;
    return match[1]
      .split(/[؟?،,]|\s+(?:النهارده|أمس|امس|الأسبوع|الاسبوع|الشهر|وقارن|مقارنة|مقارنه)/)[0]
      .trim()
      .slice(0, 50) || null;
  }

  private requestedMetrics(intent: OwnerCopilotIntent): string[] {
    const map: Partial<Record<OwnerCopilotIntent, string[]>> = {
      OWNER_SALES_SUMMARY: ['netSales', 'validOrders', 'averageOrderValue'],
      OWNER_REVENUE_ANALYSIS: ['revenue', 'validOrders'],
      OWNER_GROSS_PROFIT_ANALYSIS: ['grossProfit', 'grossMargin', 'costOfGoodsSold'],
      OWNER_NET_PROFIT_ANALYSIS: ['netProfit', 'grossProfit', 'expenses'],
      OWNER_EXPENSE_ANALYSIS: ['expenses'],
      OWNER_CANCELLATION_ANALYSIS: ['cancelledOrders', 'cancellationRate'],
      OWNER_CUSTOMER_RETENTION: ['repeatCustomerRate', 'inactiveCustomers'],
      OWNER_INVENTORY_HEALTH: ['currentQuantity', 'minimumLevel'],
      OWNER_DEBT_ANALYSIS: ['outstandingDebt', 'recentCollections'],
    };
    return map[intent] || [];
  }

  private intentConfidence(intent: OwnerCopilotIntent): number {
    if (intent === 'OWNER_UNKNOWN') return 0.45;
    if (intent === 'OWNER_WRITE_ACTION_REQUEST') return 0.99;
    return 0.92;
  }

  private addComparison(range: OwnerResolvedDateRange): OwnerResolvedDateRange {
    const duration = Math.max(1, range.to.getTime() - range.from.getTime() + 1);
    const comparisonTo = new Date(range.from.getTime() - 1);
    const comparisonFrom = new Date(comparisonTo.getTime() - duration + 1);
    return {
      ...range,
      comparison: {
        from: comparisonFrom,
        to: comparisonTo,
        label: this.formatRange(comparisonFrom, comparisonTo, 'Africa/Cairo'),
      },
    };
  }

  private cloneDateRange(range: OwnerResolvedDateRange, withComparison: boolean): OwnerResolvedDateRange {
    const clone: OwnerResolvedDateRange = {
      ...range,
      from: new Date(range.from),
      to: new Date(range.to),
      comparison: range.comparison ? {
        ...range.comparison,
        from: new Date(range.comparison.from),
        to: new Date(range.comparison.to),
      } : undefined,
    };
    return withComparison && !clone.comparison ? this.addComparison(clone) : clone;
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[ًٌٍَُِّْـ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private zonedCalendarDate(date: Date, timezone: string) {
    const parts = this.zonedParts(date, timezone);
    return { year: parts.year, month: parts.month, day: parts.day };
  }

  private zonedParts(date: Date, timezone: string) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    });
    const values: Record<string, number> = {};
    for (const part of formatter.formatToParts(date)) {
      if (part.type !== 'literal') values[part.type] = Number(part.value);
    }
    return values as { year: number; month: number; day: number; hour: number; minute: number; second: number };
  }

  private zonedDateToUtc(
    calendar: { year: number; month: number; day: number },
    hour: number,
    minute: number,
    second: number,
    timezone: string,
  ): Date {
    const utcGuess = Date.UTC(calendar.year, calendar.month - 1, calendar.day, hour, minute, second);
    const firstOffset = this.timezoneOffset(new Date(utcGuess), timezone);
    const first = new Date(utcGuess - firstOffset);
    const secondOffset = this.timezoneOffset(first, timezone);
    return new Date(utcGuess - secondOffset);
  }

  private timezoneOffset(date: Date, timezone: string): number {
    const parts = this.zonedParts(date, timezone);
    const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return representedAsUtc - Math.floor(date.getTime() / 1000) * 1000;
  }

  private addCalendarDays(date: { year: number; month: number; day: number }, amount: number) {
    const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + amount));
    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
  }

  private addCalendarMonths(date: { year: number; month: number; day: number }, amount: number) {
    const shifted = new Date(Date.UTC(date.year, date.month - 1 + amount, 1));
    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: 1 };
  }

  private startOfWeek(date: { year: number; month: number; day: number }) {
    const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    return this.addCalendarDays(date, -weekday);
  }

  private compareCalendar(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }) {
    return Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day);
  }

  private formatRange(from: Date, to: Date, timezone: string): string {
    const formatter = new Intl.DateTimeFormat('ar-EG', {
      timeZone: timezone,
      day: 'numeric', month: 'long', year: 'numeric',
    });
    return `من ${formatter.format(from)} إلى ${formatter.format(to)}`;
  }
}

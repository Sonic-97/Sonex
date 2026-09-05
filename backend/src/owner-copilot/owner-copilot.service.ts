import { BadRequestException, ForbiddenException, Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnerActionsService } from '../owner-actions/owner-actions.service';
import { OwnerActionProposal } from '../owner-actions/owner-action.types';
import { OwnerCopilotAskDto, OwnerCopilotFeedbackDto } from './owner-copilot.dto';
import { percentageChange, roundMoney, roundRate } from './owner-business-metrics';
import { OwnerCopilotToolsService } from './owner-copilot-tools.service';
import { OwnerCopilotUnderstandingService } from './owner-copilot-understanding.service';
import {
  OwnerCopilotContextState,
  OwnerCopilotIntent,
  OwnerCopilotKeyNumber,
  OwnerCopilotMetrics,
  OwnerCopilotPermission,
  OwnerCopilotResponse,
  OwnerCopilotScope,
  OwnerCopilotToolName,
  OwnerCopilotUser,
  OwnerIntentResult,
  OwnerToolResult,
} from './owner-copilot.types';

interface ResponseParts {
  directAnswer: string;
  keyNumbers?: OwnerCopilotKeyNumber[];
  why?: string[];
  recommendedActions?: string[];
  warnings?: string[];
  proposalOnly?: boolean;
  actionProposal?: OwnerActionProposal;
}

const CONTEXT_TTL_MS = 30 * 60 * 1000;
const TOOL_TIMEOUT_MS = 5000;

@Injectable()
export class OwnerCopilotService {
  private readonly logger = new Logger(OwnerCopilotService.name);
  private readonly contexts = new Map<string, OwnerCopilotContextState>();
  private readonly metrics: OwnerCopilotMetrics = {
    questions: 0,
    toolCalls: 0,
    toolFailures: 0,
    permissionDenials: 0,
    unsupportedRequests: 0,
    writeActionRequestsBlocked: 0,
    followUps: 0,
    providerFailures: 0,
    fallbackResponses: 0,
    hallucinationFlags: 0,
    dataMismatchIncidents: 0,
    feedbackUseful: 0,
    feedbackNotUseful: 0,
    averageResponseTimeMs: 0,
  };
  private totalLatencyMs = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly understanding: OwnerCopilotUnderstandingService,
    private readonly tools: OwnerCopilotToolsService,
    @Optional() private readonly ownerActions?: OwnerActionsService,
  ) {}

  async ask(
    user: OwnerCopilotUser | null | undefined,
    dto: OwnerCopilotAskDto,
    requestBranchId?: string,
  ): Promise<OwnerCopilotResponse> {
    const startedAt = Date.now();
    this.metrics.questions += 1;
    const safeUser = this.requireAuthenticatedUser(user);
    const sessionId = this.safeSessionId(dto.sessionId);
    const contextKey = `${safeUser.cafeId}:${safeUser.id}:${sessionId}`;
    const previous = this.getContext(contextKey, safeUser);
    let scope = await this.resolveScope(safeUser, requestBranchId);
    const intent = this.understanding.classify(dto.question, scope.timezone, new Date(), previous);

    if (intent.isFollowUp) this.metrics.followUps += 1;
    if (intent.securityViolation) {
      this.metrics.permissionDenials += 1;
      const response = this.completeResponse(
        scope,
        intent,
        sessionId,
        startedAt,
        {
          directAnswer: 'الطلب ده غير مسموح. مش هعرض تعليمات داخلية أو أسرار أو بيانات كافيه تاني، ومش هنفذ SQL.',
          warnings: ['تم رفض الطلب لحماية بيانات الكافيه وصلاحيات المستخدم.'],
        },
        [],
      );
      this.audit(safeUser, intent, [], 'DENIED_SECURITY', response.latencyMs);
      return response;
    }

    scope = await this.applyConversationScope(scope, intent, previous);
    this.enforceIntentPermission(scope, intent.intent);

    if (intent.writeActionRequested) {
      const preparation = this.ownerActions
        ? await this.ownerActions.prepareFromNaturalLanguage(safeUser, dto.question, scope.selectedBranchIds[0])
        : {
          blocked: true,
          message: 'أداة المقترحات غير متاحة في هذا السياق، ومش هنفذ أي تغيير.',
          warnings: ['No business data changed.'],
          proposal: undefined,
        };
      if (preparation.blocked) this.metrics.writeActionRequestsBlocked += 1;
      const response = this.completeResponse(
        scope,
        intent,
        sessionId,
        startedAt,
        {
          directAnswer: preparation.message,
          recommendedActions: preparation.proposal
            ? [`راجع المقترح ${preparation.proposal.proposalId} والتغييرات والمخاطر ووقت الانتهاء قبل القرار.`]
            : [],
          warnings: preparation.warnings,
          proposalOnly: true,
          actionProposal: preparation.proposal,
        },
        [],
      );
      this.saveContext(contextKey, scope, intent);
      this.audit(safeUser, intent, [], preparation.proposal ? 'ACTION_PROPOSED' : 'WRITE_BLOCKED', response.latencyMs);
      return response;
    }

    if (intent.intent === 'OWNER_FORECAST_REQUEST') {
      this.metrics.unsupportedRequests += 1;
      const response = this.completeResponse(
        scope,
        intent,
        sessionId,
        startedAt,
        {
          directAnswer: 'أقدر أعرض الاستهلاك والمخزون الحالي، لكن التوقع المستقبلي الدقيق هيكون ضمن Stage 5.',
          proposalOnly: true,
        },
        [],
      );
      this.saveContext(contextKey, scope, intent);
      this.audit(safeUser, intent, [], 'FORECAST_DEFERRED', response.latencyMs);
      return response;
    }

    if (intent.intent === 'OWNER_EXPORT_REQUEST') {
      this.metrics.unsupportedRequests += 1;
      const response = this.completeResponse(
        scope,
        intent,
        sessionId,
        startedAt,
        {
          directAnswer: 'التصدير مش متاح من محادثة Stage 4. تقدر تستخدم صفحة التقارير الحالية بدون ما أغيّر أي بيانات.',
          recommendedActions: ['افتح صفحة التقارير وحدد الفترة والفرع المطلوبين.'],
        },
        [],
      );
      this.saveContext(contextKey, scope, intent);
      this.audit(safeUser, intent, [], 'EXPORT_DEFERRED', response.latencyMs);
      return response;
    }

    const toolNames = this.understanding.toolsForIntent(intent.intent)
      .filter((tool) => {
        const required = this.permissionForTool(tool);
        return !required || scope.permissions.includes(required);
      });
    const toolResults = await this.runTools(toolNames, scope, intent);
    const parts = this.compose(intent, scope, toolResults);
    const response = this.completeResponse(scope, intent, sessionId, startedAt, parts, toolResults.map((result) => result.tool));
    this.saveContext(contextKey, scope, intent);
    this.audit(safeUser, intent, response.sources, toolResults.length ? 'OK' : 'DETERMINISTIC', response.latencyMs);
    return response;
  }

  async suggestedQuestions(user: OwnerCopilotUser | null | undefined, requestBranchId?: string) {
    const scope = await this.resolveScope(this.requireAuthenticatedUser(user), requestBranchId);
    const suggestions = [
      'المبيعات عملت إيه النهارده؟',
      'إيه أهم 3 مشاكل محتاجة تدخلي؟',
      'إيه المنتجات الأعلى ربحية؟',
      'قارن الفروع الأسبوع ده.',
      'إيه المخزون الحرج؟',
    ];
    if (scope.permissions.includes('FINANCE_READ')) suggestions.push('ليه صافي الربح اتغير آخر 7 أيام؟');
    return { suggestions, readOnly: true, branches: scope.selectedBranchNames };
  }

  recordFeedback(user: OwnerCopilotUser | null | undefined, dto: OwnerCopilotFeedbackDto) {
    const safeUser = this.requireAuthenticatedUser(user);
    if (dto.feedback === 'USEFUL') this.metrics.feedbackUseful += 1;
    else this.metrics.feedbackNotUseful += 1;
    if (dto.feedback === 'WRONG_NUMBERS') this.metrics.dataMismatchIncidents += 1;
    this.logger.warn(JSON.stringify({
      event: 'owner_copilot_feedback',
      userId: safeUser.id,
      cafeId: safeUser.cafeId,
      contextId: dto.contextId.slice(0, 80),
      feedback: dto.feedback,
    }));
    return { accepted: true, persisted: false, message: 'تم تسجيل الملاحظة للمراجعة بدون تغيير أي منطق أو بيانات عمل.' };
  }

  getMetricsSnapshot(): OwnerCopilotMetrics {
    return { ...this.metrics };
  }

  private requireAuthenticatedUser(user: OwnerCopilotUser | null | undefined): OwnerCopilotUser & { cafeId: string } {
    if (!user?.id) throw new UnauthorizedException('Authentication required');
    if (!user.cafeId) throw new ForbiddenException('Trusted cafe context is required');
    const role = user.role?.toUpperCase();
    if (!['OWNER', 'MANAGER'].includes(role)) {
      this.metrics.permissionDenials += 1;
      throw new ForbiddenException('Owner Copilot access is restricted');
    }
    return { ...user, role, cafeId: user.cafeId };
  }

  private async resolveScope(
    user: OwnerCopilotUser & { cafeId: string },
    requestBranchId?: string,
  ): Promise<OwnerCopilotScope> {
    const role = user.role.toUpperCase() as 'OWNER' | 'MANAGER';
    const branches = await this.prisma.branch.findMany({
      where: { cafeId: user.cafeId, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const allowedBranches = role === 'MANAGER'
      ? branches.filter((branch) => branch.id === user.branchId)
      : branches;
    if (role === 'MANAGER' && !allowedBranches.length) {
      this.metrics.permissionDenials += 1;
      throw new ForbiddenException('Manager has no authorized branch');
    }
    const requested = requestBranchId && requestBranchId !== 'all' ? requestBranchId : undefined;
    if (requested && !allowedBranches.some((branch) => branch.id === requested)) {
      this.metrics.permissionDenials += 1;
      this.logger.warn(JSON.stringify({ event: 'owner_copilot_branch_denied', userId: user.id, cafeId: user.cafeId, requestedBranchId: requested }));
      throw new ForbiddenException('Unauthorized branch');
    }
    const selected = requested ? allowedBranches.filter((branch) => branch.id === requested) : allowedBranches;
    return {
      userId: user.id,
      role,
      cafeId: user.cafeId,
      allowedBranchIds: allowedBranches.map((branch) => branch.id),
      selectedBranchIds: selected.map((branch) => branch.id),
      selectedBranchNames: selected.map((branch) => branch.name),
      permissions: role === 'OWNER'
        ? ['SALES_READ', 'FINANCE_READ', 'PRODUCT_READ', 'CUSTOMER_AGGREGATE_READ', 'INVENTORY_READ', 'STAFF_READ', 'OPERATIONS_READ']
        : ['SALES_READ', 'PRODUCT_READ', 'CUSTOMER_AGGREGATE_READ', 'INVENTORY_READ', 'OPERATIONS_READ'],
      timezone: 'Africa/Cairo',
      currency: 'EGP',
    };
  }

  private async applyConversationScope(
    scope: OwnerCopilotScope,
    intent: OwnerIntentResult,
    previous?: OwnerCopilotContextState,
  ): Promise<OwnerCopilotScope> {
    if (intent.branchReference) {
      const branches = await this.prisma.branch.findMany({
        where: { cafeId: scope.cafeId, id: { in: scope.allowedBranchIds }, active: true },
        select: { id: true, name: true },
      });
      const normalizedReference = this.normalizeName(intent.branchReference);
      const matches = branches.filter((branch) => {
        const name = this.normalizeName(branch.name);
        return name === normalizedReference || name.includes(normalizedReference) || normalizedReference.includes(name);
      });
      if (matches.length === 0) throw new BadRequestException('مش لاقي فرع بالاسم ده ضمن الفروع المسموح بها. حدد اسم الفرع بدقة.');
      if (matches.length > 1) throw new BadRequestException('في أكتر من فرع قريب من الاسم ده. حدد الفرع بدقة.');
      return { ...scope, selectedBranchIds: [matches[0].id], selectedBranchNames: [matches[0].name] };
    }
    if (previous && intent.isFollowUp && previous.cafeId === scope.cafeId) {
      const ids = previous.selectedBranchIds.filter((id) => scope.allowedBranchIds.includes(id));
      if (ids.length) return { ...scope, selectedBranchIds: ids, selectedBranchNames: previous.selectedBranchNames.slice(0, ids.length) };
    }
    return scope;
  }

  private enforceIntentPermission(scope: OwnerCopilotScope, intent: OwnerCopilotIntent) {
    const required = this.understanding.permissionForIntent(intent);
    if (required && !scope.permissions.includes(required)) {
      this.metrics.permissionDenials += 1;
      this.logger.warn(JSON.stringify({ event: 'owner_copilot_permission_denied', userId: scope.userId, cafeId: scope.cafeId, intent, required }));
      throw new ForbiddenException('You do not have permission to view this business topic');
    }
  }

  private permissionForTool(tool: OwnerCopilotToolName): OwnerCopilotPermission | null {
    if (['simulateDiscount', 'simulateCombo', 'simulatePriceChange', 'compareOfferScenarios'].includes(tool)) return 'FINANCE_READ';
    if (['getProductDemandForecast'].includes(tool)) return 'PRODUCT_READ';
    if (['getIngredientConsumptionForecast', 'getStockoutRisk', 'getWasteRiskEstimate'].includes(tool)) return 'INVENTORY_READ';
    if (['getStaffingDemandEstimate'].includes(tool)) return 'STAFF_READ';
    if (['getProfitSummary', 'getExpenseSummary', 'getDebtSummary', 'getPaymentSummary', 'getSettlementSummary'].includes(tool)) return 'FINANCE_READ';
    if (['getProductPerformance', 'getProductProfitability', 'getCategoryPerformance'].includes(tool)) return 'PRODUCT_READ';
    if (['getCustomerMetrics', 'getCustomerRetention'].includes(tool)) return 'CUSTOMER_AGGREGATE_READ';
    if (['getInventoryHealth', 'getLowStockItems', 'getConsumptionMetrics', 'getWasteMetrics'].includes(tool)) return 'INVENTORY_READ';
    if (['getStaffPerformance', 'getAttendanceMetrics'].includes(tool)) return 'STAFF_READ';
    if (['getDriverMetrics', 'getBusinessAlerts'].includes(tool)) return 'OPERATIONS_READ';
    return 'SALES_READ';
  }

  private async runTools(
    names: OwnerCopilotToolName[],
    scope: OwnerCopilotScope,
    intent: OwnerIntentResult,
  ): Promise<OwnerToolResult[]> {
    const results: OwnerToolResult[] = [];
    for (const name of names) {
      try {
        this.metrics.toolCalls += 1;
        const result = await this.withTimeout(this.tools.execute(name, scope, intent.dateRange, intent.rawQuestion), TOOL_TIMEOUT_MS);
        results.push(this.sanitizeToolResult(result));
      } catch (error) {
        this.metrics.toolFailures += 1;
        this.logger.error(JSON.stringify({ event: 'owner_copilot_tool_failed', cafeId: scope.cafeId, tool: name, error: error instanceof Error ? error.message : 'unknown' }));
      }
    }
    if (names.length && !results.length) this.metrics.fallbackResponses += 1;
    return results;
  }

  private compose(intent: OwnerIntentResult, scope: OwnerCopilotScope, results: OwnerToolResult[]): ResponseParts {
    if (intent.intent === 'OWNER_GREETING') {
      return { directAnswer: 'أهلًا، اسألني عن المبيعات أو الربح أو المنتجات أو المخزون أو التشغيل. كل الإجابات قراءة فقط.' };
    }
    if (intent.intent === 'OWNER_HELP') {
      return {
        directAnswer: 'أقدر ألخص المبيعات والربح والمصروفات والمنتجات والمخزون والفروع والعملاء والتشغيل من بيانات Sonex الفعلية.',
        recommendedActions: ['ابدأ بسؤال محدد مثل: المبيعات عملت إيه النهارده؟'],
      };
    }
    if (!results.length) {
      return {
        directAnswer: 'مقدرتش أقرأ البيانات المطلوبة دلوقتي. مفيش أي تغيير اتنفذ.',
        warnings: ['تعذر تحميل مصدر البيانات المعتمد.'],
      };
    }

    const data = new Map(results.map((result) => [result.tool, result.data as any]));
    const warnings = [...new Set(results.flatMap((result) => result.warnings))];
    const money = (value: number) => this.money(value, scope.currency);
    const number = (value: number) => this.number(value);

    const forecastingIntents: OwnerCopilotIntent[] = [
      'OWNER_SALES_FORECAST', 'OWNER_ORDER_FORECAST', 'OWNER_PRODUCT_DEMAND_FORECAST',
      'OWNER_INVENTORY_FORECAST', 'OWNER_STOCKOUT_RISK', 'OWNER_STAFFING_ESTIMATE', 'OWNER_WASTE_RISK',
    ];
    if (forecastingIntents.includes(intent.intent)) {
      const result: any = results[0]?.data;
      const source = results[0]?.tool;
      if (!result || result.expected === null || result.confidence === 'INSUFFICIENT_DATA') {
        return { directAnswer: 'مش قادر أطلع توقع موثوق حاليًا لأن البيانات المتاحة أقل من حد الأهلية.', why: result?.eligibility?.reason ? [result.eligibility.reason] : [], warnings: result?.warnings || warnings, proposalOnly: true };
      }
      return {
        directAnswer: `التوقع الأقرب هو ${number(result.expected)} ${result.unit}، والنطاق المحتمل من ${number(result.lower)} إلى ${number(result.upper)}. الثقة ${result.confidence}.`,
        keyNumbers: source ? [
          this.key('المتوقع', `${number(result.expected)} ${result.unit}`, source),
          this.key('الحد الأدنى', `${number(result.lower)} ${result.unit}`, source),
          this.key('الحد الأعلى', `${number(result.upper)} ${result.unit}`, source),
        ] : [],
        why: [`الطريقة: ${result.method}.`, `الفترة التاريخية: ${result.historicalPeriod?.from || '-'} إلى ${result.historicalPeriod?.to || '-'}.`],
        warnings: result.warnings || warnings,
        proposalOnly: true,
      };
    }

    if (intent.intent === 'OWNER_SCENARIO_COMPARISON') {
      const result: any = results[0]?.data;
      const runs = Array.isArray(result?.scenarios) ? result.scenarios : [];
      const summaries = runs.map((run: any) => {
        const expected = run.scenarios?.find((row: any) => row.name === 'EXPECTED') || run.scenarios?.[0];
        return expected ? `${run.type}: إيراد ${money(expected.expectedRevenue)} وربح ${money(expected.expectedGrossProfit)} وهامش ${number(expected.marginPercent)}%` : null;
      }).filter(Boolean);
      return { directAnswer: summaries.length ? `المقارنة: ${summaries.join('، ')}. دي محاكاة فقط، ولم يتم تطبيق أي تغييرات.` : 'المقارنة محتاجة منتجات وسيناريوهات صحيحة.', why: ['كل سيناريو حسب السعر والتكلفة والطلب التاريخي المتاح.'], warnings: [...warnings, 'This is a simulation only. No changes were applied.'], proposalOnly: true };
    }

    const simulationIntents: OwnerCopilotIntent[] = ['OWNER_OFFER_SIMULATION', 'OWNER_COMBO_SIMULATION', 'OWNER_PRICE_SIMULATION'];
    if (simulationIntents.includes(intent.intent)) {
      const result: any = results[0]?.data;
      const source = results[0]?.tool;
      if (!result?.scenarios) return { directAnswer: 'المحاكاة محتاجة اسم منتج وسعر أو نسبة صحيحة.', warnings, proposalOnly: true };
      const scenario = result.scenarios.find((row: any) => row.name === 'EXPECTED') || result.scenarios[0];
      return {
        directAnswer: `في السيناريو المتوقع: الإيراد ${money(scenario.expectedRevenue)} وإجمالي الربح ${money(scenario.expectedGrossProfit)} بهامش ${number(scenario.marginPercent)}%. دي محاكاة فقط، ولم يتم تطبيق أي تغييرات.`,
        keyNumbers: source ? [
          this.key('السعر المقترح', money(result.proposedPrice), source),
          this.key('وحدات التعادل', result.breakEvenUnits === null ? 'غير ممكن بهامش سلبي' : number(result.breakEvenUnits), source),
          this.key('أقصى تعرض', money(result.totalExposure), source),
        ] : [],
        why: result.assumptions || [], warnings: [...(result.warnings || warnings), result.notice], proposalOnly: true,
      };
    }

    if (intent.intent === 'OWNER_SALES_SUMMARY' || intent.intent === 'OWNER_REVENUE_ANALYSIS') {
      const summary = data.get('getSalesSummary') || data.get('getRevenueBreakdown');
      const metrics = summary.metrics || summary;
      const comparison = summary.comparison;
      const change = comparison?.netSalesChangePercent;
      return {
        directAnswer: `المبيعات في الفترة دي ${money(metrics.netSales ?? metrics.revenue ?? 0)} من ${number(metrics.validOrders || 0)} طلب صالح.`,
        keyNumbers: [
          this.key('صافي المبيعات', money(metrics.netSales ?? metrics.revenue ?? 0), results[0].tool),
          this.key('عدد الطلبات', number(metrics.validOrders || 0), results[0].tool),
          this.key('متوسط الطلب', money(metrics.averageOrderValue || 0), results[0].tool),
        ],
        why: change === null || change === undefined ? [] : [`التغير عن الفترة السابقة ${this.signedPercent(change)}.`],
        recommendedActions: metrics.validOrders ? ['راجع الساعات والمنتجات الأعلى مساهمة قبل اتخاذ قرار.'] : ['راجع الفترة والفرع؛ مفيش طلبات مدفوعة صالحة مسجلة.'],
        warnings,
      };
    }

    if (['OWNER_NET_PROFIT_ANALYSIS', 'OWNER_GROSS_PROFIT_ANALYSIS'].includes(intent.intent)) {
      const profit = data.get('getProfitSummary');
      const change = profit.comparison?.netProfitChangePercent;
      return {
        directAnswer: intent.intent === 'OWNER_NET_PROFIT_ANALYSIS'
          ? `صافي الربح المحسوب ${money(profit.netProfit || 0)}.`
          : `إجمالي الربح المحسوب ${money(profit.grossProfit || 0)}.`,
        keyNumbers: [
          this.key('الإيراد', money(profit.revenue || 0), 'getProfitSummary'),
          this.key('إجمالي الربح', money(profit.grossProfit || 0), 'getProfitSummary'),
          this.key('المصروفات', money(profit.expenses || 0), 'getProfitSummary'),
          this.key('صافي الربح', money(profit.netProfit || 0), 'getProfitSummary'),
          this.key('هامش الربح الإجمالي', `${number(profit.grossMarginPercent || 0)}%`, 'getProfitSummary'),
        ],
        why: change === null || change === undefined ? [] : [`صافي الربح اتغير ${this.signedPercent(change)} عن الفترة السابقة المماثلة.`],
        recommendedActions: ['راجع تغير المبيعات والمصروفات وتكلفة المنتجات كل عامل لوحده.'],
        warnings,
      };
    }

    if (intent.intent === 'OWNER_EXPENSE_ANALYSIS') {
      const expenses = data.get('getExpenseSummary');
      const top = expenses.byCategory?.[0];
      return {
        directAnswer: `إجمالي المصروفات المسجلة ${money(expenses.total || 0)}.`,
        keyNumbers: [this.key('المصروفات', money(expenses.total || 0), 'getExpenseSummary')],
        why: top ? [`أكبر تصنيف مصروف هو ${top.name} بقيمة ${money(top.amount)}.`] : [],
        recommendedActions: expenses.changePercent >= 30 ? ['راجع تفاصيل أعلى تصنيف قبل اعتماد أي إجراء.'] : [],
        warnings,
      };
    }

    if (intent.intent === 'OWNER_PRODUCT_PERFORMANCE' || intent.intent === 'OWNER_PRODUCT_PROFITABILITY') {
      const products = data.get(intent.intent === 'OWNER_PRODUCT_PROFITABILITY' ? 'getProductProfitability' : 'getProductPerformance');
      const rows = intent.intent === 'OWNER_PRODUCT_PROFITABILITY'
        ? products.highestProfit || []
        : products.topByQuantity || [];
      const top = rows[0];
      return {
        directAnswer: top
          ? `${top.productName} هو الأول حسب ${products.rankingBasis}.`
          : 'مفيش مبيعات منتجات كافية في الفترة المحددة.',
        keyNumbers: rows.slice(0, 5).map((row: any) => this.key(
          row.productName,
          intent.intent === 'OWNER_PRODUCT_PROFITABILITY' ? money(row.profit) : `${number(row.quantity)} وحدة`,
          intent.intent === 'OWNER_PRODUCT_PROFITABILITY' ? 'getProductProfitability' : 'getProductPerformance',
        )),
        why: intent.intent === 'OWNER_PRODUCT_PROFITABILITY' && products.highSellingLowMargin?.[0]
          ? [`منتج عالي البيع منخفض الهامش: ${products.highSellingLowMargin[0].productName} بهامش ${products.highSellingLowMargin[0].marginPercent}%.`]
          : [],
        recommendedActions: ['اعتمد على أساس الترتيب الظاهر، ومتقارنش الكمية بالربح كأنهم نفس المؤشر.'],
        warnings,
      };
    }

    if (intent.intent === 'OWNER_CATEGORY_ANALYSIS') {
      const categories = data.get('getCategoryPerformance')?.categories || [];
      return {
        directAnswer: categories[0] ? `${categories[0].category} هو التصنيف الأعلى بالإيراد.` : 'مفيش بيانات تصنيفات كافية.',
        keyNumbers: categories.slice(0, 5).map((row: any) => this.key(row.category, money(row.revenue), 'getCategoryPerformance')),
        warnings,
      };
    }

    if (intent.intent === 'OWNER_ORDER_ANALYSIS' || intent.intent === 'OWNER_CANCELLATION_ANALYSIS') {
      const orders = data.get(intent.intent === 'OWNER_CANCELLATION_ANALYSIS' ? 'getCancellationMetrics' : 'getOrderMetrics');
      return {
        directAnswer: intent.intent === 'OWNER_CANCELLATION_ANALYSIS'
          ? `معدل الإلغاء ${number(orders.cancellationRate || 0)}% من ${number(orders.totalRelevantOrders || 0)} طلب.`
          : `عندك ${number(orders.validOrders || 0)} طلب صالح بمتوسط ${money(orders.averageOrderValue || 0)}.`,
        keyNumbers: [
          this.key('الطلبات الصالحة', number(orders.validOrders || 0), intent.intent === 'OWNER_CANCELLATION_ANALYSIS' ? 'getCancellationMetrics' : 'getOrderMetrics'),
          this.key('الإلغاءات', number(orders.cancelledOrders || 0), intent.intent === 'OWNER_CANCELLATION_ANALYSIS' ? 'getCancellationMetrics' : 'getOrderMetrics'),
          this.key('معدل الإلغاء', `${number(orders.cancellationRate || 0)}%`, intent.intent === 'OWNER_CANCELLATION_ANALYSIS' ? 'getCancellationMetrics' : 'getOrderMetrics'),
        ],
        warnings,
      };
    }

    if (intent.intent === 'OWNER_CUSTOMER_ANALYSIS' || intent.intent === 'OWNER_CUSTOMER_RETENTION') {
      const customers = data.get(intent.intent === 'OWNER_CUSTOMER_RETENTION' ? 'getCustomerRetention' : 'getCustomerMetrics');
      return {
        directAnswer: intent.intent === 'OWNER_CUSTOMER_RETENTION'
          ? `نسبة العملاء العائدين ${number(customers.repeatCustomerRate || 0)}%.`
          : `عندك ${number(customers.newCustomers || 0)} عميل جديد في الفترة.`,
        keyNumbers: [
          this.key('إجمالي العملاء', number(customers.totalCustomers || 0), intent.intent === 'OWNER_CUSTOMER_RETENTION' ? 'getCustomerRetention' : 'getCustomerMetrics'),
          this.key('العملاء العائدون', number(customers.repeatCustomers || 0), intent.intent === 'OWNER_CUSTOMER_RETENTION' ? 'getCustomerRetention' : 'getCustomerMetrics'),
          ...(customers.inactiveCustomers !== undefined ? [this.key('غير النشطين', number(customers.inactiveCustomers), 'getCustomerRetention')] : []),
        ],
        recommendedActions: customers.inactiveCustomers ? ['راجع الشريحة غير النشطة بصورة مجمعة؛ أي تواصل مستقبلي يحتاج موافقة منفصلة.'] : [],
        warnings,
      };
    }

    if (['OWNER_INVENTORY_HEALTH', 'OWNER_STOCKOUT_RISK', 'OWNER_WASTE_ANALYSIS'].includes(intent.intent)) {
      if (intent.intent === 'OWNER_WASTE_ANALYSIS') {
        const waste = data.get('getWasteMetrics');
        const top = waste.configuredRecipeWaste?.[0];
        return {
          directAnswer: top ? `أعلى نسبة هالك مضبوطة في الوصفات هي ${top.productName}: ${top.wastePercent}%.` : 'مفيش نسب هالك مضبوطة في الوصفات الحالية.',
          recommendedActions: ['راجع الهالك الفعلي يدويًا لأن النظام لا يملك سجل هالك موحدًا بعد.'],
          warnings,
        };
      }
      const inventory = data.get(intent.intent === 'OWNER_STOCKOUT_RISK' ? 'getLowStockItems' : 'getInventoryHealth');
      const matched = inventory.matchedItems || [];
      if (matched.length > 0) {
        const first = matched[0];
        return {
          directAnswer: `صنف "${first.itemName}" متاح منه ${first.availableQuantity} ${first.unit} في فرع ${first.branchName} (الحد الأدنى ${first.minimumLevel}).`,
          keyNumbers: matched.slice(0, 5).map((row: any) => this.key(row.itemName, `${number(row.availableQuantity)} ${row.unit}`, 'getInventoryHealth')),
          why: [`الحالة: ${first.severity === 'LOW' ? 'آمنة وكافية' : first.severity === 'CRITICAL' ? 'حرجة جدًا' : 'أقل من أو قريبة من الحد الأدنى'}.`],
          warnings,
          proposalOnly: true,
        };
      }
      const critical = inventory.criticalItems || [];
      return {
        directAnswer: critical.length ? `في ${critical.length} صنف مخزون حرج أو أقل من الحد الأدنى.` : 'المخزون المسجل مفيهوش أصناف تحت الحد الأدنى.',
        keyNumbers: critical.slice(0, 5).map((row: any) => this.key(row.itemName, `${number(row.availableQuantity)} ${row.unit}`, intent.intent === 'OWNER_STOCKOUT_RISK' ? 'getLowStockItems' : 'getInventoryHealth')),
        why: critical.slice(0, 3).map((row: any) => `${row.itemName} في ${row.branchName}: المتاح ${row.availableQuantity} والحد الأدنى ${row.minimumLevel}.`),
        recommendedActions: critical.length ? ['راجع الكميات والمشتريات يدويًا؛ لم يتم إنشاء أمر شراء.'] : [],
        warnings,
        proposalOnly: true,
      };
    }

    if (intent.intent === 'OWNER_BRANCH_COMPARISON') {
      const branches = data.get('getBranchComparison')?.branches || [];
      return {
        directAnswer: branches[0] ? `${branches[0].branchName} الأعلى في إجمالي المبيعات خلال الفترة.` : 'مفيش بيانات فروع كافية للمقارنة.',
        keyNumbers: branches.slice(0, 5).map((row: any) => this.key(row.branchName, `${money(row.sales)} | هامش ${row.grossMarginPercent}%`, 'getBranchComparison')),
        why: ['المقارنة تعرض المبيعات والطلبات ومتوسط الطلب والهامش ومعدل الإلغاء بدل الاعتماد على الحجم فقط.'],
        warnings,
      };
    }

    if (intent.intent === 'OWNER_STAFF_PERFORMANCE') {
      const staff = data.get('getStaffPerformance')?.staff || [];
      return {
        directAnswer: staff[0] ? `${staff[0].name} تعامل مع أكبر عدد طلبات مسجل في الفترة.` : 'مفيش مؤشرات أداء موظفين كافية للفترة.',
        keyNumbers: staff.slice(0, 5).map((row: any) => this.key(row.name, `${number(row.ordersHandled)} طلب`, 'getStaffPerformance')),
        recommendedActions: ['استخدم الأرقام لمراجعة التشغيل، مش لإصدار حكم أو عقوبة تلقائية.'],
        warnings,
      };
    }

    if (intent.intent === 'OWNER_ATTENDANCE_ANALYSIS') {
      const attendance = data.get('getAttendanceMetrics');
      return {
        directAnswer: `في ${number(attendance.attendanceRecords || 0)} سجل حضور و${number(attendance.activeShifts || 0)} وردية نشطة.`,
        keyNumbers: [this.key('ساعات مسجلة', number(attendance.totalRecordedHours || 0), 'getAttendanceMetrics')],
        warnings,
      };
    }

    if (intent.intent === 'OWNER_DRIVER_ANALYSIS') {
      const drivers = data.get('getDriverMetrics')?.drivers || [];
      return {
        directAnswer: drivers[0] ? `${drivers[0].name} الأعلى في التوصيلات المكتملة.` : 'مفيش توصيلات مكتملة كافية في الفترة.',
        keyNumbers: drivers.slice(0, 5).map((row: any) => this.key(row.name, `${number(row.deliveries)} توصيل`, 'getDriverMetrics')),
        warnings,
      };
    }

    if (intent.intent === 'OWNER_DEBT_ANALYSIS') {
      const debt = data.get('getDebtSummary');
      return {
        directAnswer: `إجمالي الديون غير المسددة ${money(debt.outstandingAmount || 0)}.`,
        keyNumbers: [
          this.key('ديون قائمة', money(debt.outstandingAmount || 0), 'getDebtSummary'),
          this.key('تحصيلات الفترة', money(debt.recentCollections || 0), 'getDebtSummary'),
        ],
        recommendedActions: ['راجع سجلات الديون من صفحة الديون؛ لم يتم تسجيل أي تحصيل.'],
        warnings,
      };
    }

    if (intent.intent === 'OWNER_PAYMENT_ANALYSIS') {
      const payments = data.get('getPaymentSummary');
      const isDrawerQuery = /(درج|خزنة|خزنه|كاش|فلوس)/.test(intent.rawQuestion);
      const directAnswer = isDrawerQuery && payments.estimatedDrawerCash !== undefined
        ? `صافي الكاش في الدرج حاليًا ${money(payments.estimatedDrawerCash)} (متحصلات نقدية ${money(payments.cashCollected || 0)} - مصروفات وسلف ${money(payments.cashExpenses || 0)}).`
        : `المدفوعات المحصلة والمسجلة ${money(payments.totalCollected || 0)}.`;

      return {
        directAnswer,
        keyNumbers: [
          ...(payments.estimatedDrawerCash !== undefined ? [this.key('صافي كاش الدرج', money(payments.estimatedDrawerCash), 'getPaymentSummary')] : []),
          ...(payments.cashCollected !== undefined ? [this.key('متحصلات نقدية', money(payments.cashCollected), 'getPaymentSummary')] : []),
          ...(payments.cashExpenses !== undefined && payments.cashExpenses > 0 ? [this.key('مصروفات وسلف الدرج', money(payments.cashExpenses), 'getPaymentSummary')] : []),
          ...(payments.byMethod || []).slice(0, 3).map((row: any) => this.key(row.name, money(row.amount), 'getPaymentSummary')),
        ],
        warnings,
      };
    }

    if (intent.intent === 'OWNER_SETTLEMENT_ANALYSIS') {
      const settlements = data.get('getSettlementSummary');
      return {
        directAnswer: `إجمالي التسويات المسجلة ${money(settlements.total || 0)}، والمعلق ${money(settlements.pending || 0)}.`,
        keyNumbers: [
          this.key('معلق', money(settlements.pending || 0), 'getSettlementSummary'),
          this.key('معتمد', money(settlements.approved || 0), 'getSettlementSummary'),
        ],
        warnings,
      };
    }

    if (intent.intent === 'OWNER_PEAK_HOURS') {
      const peaks = data.get('getPeakHours')?.peakHours || [];
      return {
        directAnswer: peaks[0] ? `أعلى ساعة في عدد الطلبات هي ${peaks[0].hour}:00.` : 'مفيش طلبات كافية لتحديد وقت ذروة.',
        keyNumbers: peaks.slice(0, 5).map((row: any) => this.key(`${row.hour}:00`, `${number(row.orders)} طلب`, 'getPeakHours')),
        warnings,
      };
    }

    if (intent.intent === 'OWNER_ALERT_SUMMARY' || intent.intent === 'OWNER_RECOMMEND_ACTION') {
      const alerts = data.get('getBusinessAlerts')?.alerts || [];
      return {
        directAnswer: alerts.length ? `في ${alerts.length} ملاحظة تشغيلية تحتاج مراجعة، أهمها: ${alerts[0].title}.` : 'مفيش تنبيهات قوية مدعومة بالبيانات في الفترة.',
        why: alerts.slice(0, 3).map((alert: any) => `${alert.title}: ${alert.whatHappened}`),
        recommendedActions: alerts.slice(0, 3).map((alert: any) => alert.recommendedAction),
        warnings,
        proposalOnly: true,
      };
    }

    if (intent.intent === 'OWNER_EXPLAIN_CHANGE') {
      const sales = data.get('getSalesSummary');
      const profit = data.get('getProfitSummary');
      const salesChange = sales?.comparison?.netSalesChangePercent;
      const orderChange = sales?.comparison?.orderChangePercent;
      const aovChange = sales?.comparison?.averageOrderValueChangePercent;
      const profitChange = profit?.comparison?.netProfitChangePercent;
      return {
        directAnswer: salesChange === null || salesChange === undefined
          ? 'الفترة السابقة مفيهاش أساس كافي لحساب نسبة تغير موثوقة.'
          : profit
            ? `المبيعات اتغيرت ${this.signedPercent(salesChange)} وصافي الربح اتغير ${this.signedPercent(profitChange || 0)}.`
            : `المبيعات اتغيرت ${this.signedPercent(salesChange)}.`,
        why: [
          ...(orderChange === null || orderChange === undefined ? [] : [`عدد الطلبات اتغير ${this.signedPercent(orderChange)}.`]),
          ...(aovChange === null || aovChange === undefined ? [] : [`متوسط الطلب اتغير ${this.signedPercent(aovChange)}.`]),
          ...(profit ? [`المصروفات الحالية ${money(profit.expenses || 0)}.`] : []),
        ],
        recommendedActions: ['دي أسباب حسابية وارتباطات واضحة؛ راجع الأحداث التشغيلية قبل اعتبار أي عامل سببًا وحيدًا.'],
        warnings,
      };
    }

    if (intent.intent === 'OWNER_OFFER_PROPOSAL') {
      const profitability = data.get('getProductProfitability');
      const candidate = (profitability?.highestProfit || []).find((row: any) => row.marginPercent >= 25 && row.currentPrice > 0);
      if (!candidate) return { directAnswer: 'البيانات الحالية مش كافية لإعداد عرض آمن بهامش واضح.', warnings, proposalOnly: true };
      const proposedPrice = roundMoney(candidate.currentPrice * 0.9);
      const unitCost = candidate.quantity ? candidate.cost / candidate.quantity : 0;
      const expectedMargin = proposedPrice ? roundRate((proposedPrice - unitCost) / proposedPrice * 100) : 0;
      return {
        directAnswer: `مقترح فقط: خصم تجريبي 10% على ${candidate.productName} بسعر ${money(proposedPrice)}، بدون تنفيذ.`,
        keyNumbers: [
          this.key('السعر الحالي', money(candidate.currentPrice), 'getProductProfitability'),
          this.key('السعر المقترح', money(proposedPrice), 'getProductProfitability'),
          this.key('الهامش التقديري', `${expectedMargin}%`, 'getProductProfitability'),
        ],
        recommendedActions: ['اختبر المقترح يدويًا لفترة قصيرة وراقب متوسط الطلب والهامش يوميًا.'],
        warnings: [...warnings, 'لم يتم إنشاء أو تفعيل أي عرض.'],
        proposalOnly: true,
      };
    }

    const sales = data.get('getSalesSummary')?.metrics;
    const profit = data.get('getProfitSummary');
    const alerts = data.get('getBusinessAlerts')?.alerts || [];
    const summaryParts = [
      `المبيعات ${money(sales?.netSales || 0)}`,
      ...(profit ? [`صافي الربح ${money(profit.netProfit || 0)}`] : []),
      `التنبيهات المهمة ${alerts.length}`,
    ];
    return {
      directAnswer: `ملخص سريع: ${summaryParts.join('، ')}.`,
      keyNumbers: [
        this.key('المبيعات', money(sales?.netSales || 0), 'getSalesSummary'),
        ...(profit ? [this.key('صافي الربح', money(profit.netProfit || 0), 'getProfitSummary')] : []),
        this.key('التنبيهات', number(alerts.length), 'getBusinessAlerts'),
      ],
      recommendedActions: alerts[0] ? [alerts[0].recommendedAction] : [],
      warnings,
    };
  }

  private completeResponse(
    scope: OwnerCopilotScope,
    intent: OwnerIntentResult,
    sessionId: string,
    startedAt: number,
    parts: ResponseParts,
    sources: OwnerCopilotToolName[],
  ): OwnerCopilotResponse {
    const latencyMs = Date.now() - startedAt;
    this.totalLatencyMs += latencyMs;
    this.metrics.averageResponseTimeMs = roundRate(this.totalLatencyMs / this.metrics.questions);
    const keyNumbers = (parts.keyNumbers || []).slice(0, 5);
    const why = (parts.why || []).filter(Boolean).slice(0, 5);
    const recommendedActions = (parts.recommendedActions || []).filter(Boolean).slice(0, 3);
    const warnings = [...new Set(parts.warnings || [])].slice(0, 5);
    const answer = [
      parts.directAnswer,
      keyNumbers.length ? `\nالأرقام المهمة:\n${keyNumbers.map((item) => `- ${item.label}: ${item.value}`).join('\n')}` : '',
      why.length ? `\nليه:\n${why.map((item) => `- ${item}`).join('\n')}` : '',
      recommendedActions.length ? `\nالإجراء المقترح:\n${recommendedActions.map((item) => `- ${item}`).join('\n')}` : '',
      `\nالنطاق: ${intent.dateRange.label} | ${scope.selectedBranchNames.join('، ') || 'لا توجد فروع'}.`,
    ].filter(Boolean).join('\n');
    return {
      intent: intent.intent,
      confidence: intent.confidence,
      directAnswer: parts.directAnswer,
      answer,
      keyNumbers,
      why,
      recommendedActions,
      warnings,
      sources: [...new Set(sources)],
      scope: {
        from: intent.dateRange.from.toISOString(),
        to: intent.dateRange.to.toISOString(),
        label: intent.dateRange.label,
        branches: scope.selectedBranchNames,
        timezone: scope.timezone,
        currency: scope.currency,
      },
      readOnly: true,
      proposalOnly: Boolean(parts.proposalOnly),
      contextId: `${sessionId}-${Date.now().toString(36)}`,
      latencyMs,
      actionProposal: parts.actionProposal,
    };
  }

  private sanitizeToolResult(result: OwnerToolResult): OwnerToolResult {
    return JSON.parse(JSON.stringify(result, (_key, value) => typeof value === 'bigint' ? Number(value) : value));
  }

  private saveContext(key: string, scope: OwnerCopilotScope, intent: OwnerIntentResult) {
    this.contexts.set(key, {
      cafeId: scope.cafeId,
      userId: scope.userId,
      intent: intent.intent,
      dateRange: intent.dateRange,
      selectedBranchIds: [...scope.selectedBranchIds],
      selectedBranchNames: [...scope.selectedBranchNames],
      comparison: intent.comparison,
      updatedAt: Date.now(),
    });
    if (this.contexts.size > 500) {
      const oldest = [...this.contexts.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt).slice(0, 50);
      for (const [oldKey] of oldest) this.contexts.delete(oldKey);
    }
  }

  private getContext(key: string, user: OwnerCopilotUser & { cafeId: string }): OwnerCopilotContextState | undefined {
    const context = this.contexts.get(key);
    if (!context) return undefined;
    if (context.cafeId !== user.cafeId || context.userId !== user.id || Date.now() - context.updatedAt > CONTEXT_TTL_MS) {
      this.contexts.delete(key);
      return undefined;
    }
    return context;
  }

  private audit(user: OwnerCopilotUser & { cafeId: string }, intent: OwnerIntentResult, tools: OwnerCopilotToolName[], status: string, latencyMs: number) {
    this.logger.log(JSON.stringify({
      event: 'owner_copilot_audit',
      userId: user.id,
      role: user.role,
      cafeId: user.cafeId,
      intent: intent.intent,
      tools,
      dateRange: { from: intent.dateRange.from.toISOString(), to: intent.dateRange.to.toISOString() },
      status,
      latencyMs,
      model: 'deterministic-read-only-v1',
      promptVersion: 'owner-copilot-stage4-v1',
      tokenUsage: 0,
    }));
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('READ_TOOL_TIMEOUT')), timeoutMs);
      promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
    });
  }

  private key(label: string, value: string, source: OwnerCopilotToolName): OwnerCopilotKeyNumber {
    return { label, value, source };
  }

  private money(value: number, currency: string) {
    return new Intl.NumberFormat('ar-EG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));
  }

  private number(value: number) {
    return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(value || 0));
  }

  private signedPercent(value: number) {
    return `${value > 0 ? '+' : ''}${this.number(value)}%`;
  }

  private normalizeName(value: string) {
    return value.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
  }

  private safeSessionId(value?: string) {
    const sanitized = (value || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    return sanitized || 'default';
  }
}

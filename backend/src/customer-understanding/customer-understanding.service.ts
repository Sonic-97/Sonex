import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClarificationPolicyService } from './clarification-policy.service';
import {
  CustomerNeed,
  CustomerNeedMemory,
  CustomerUnderstandingInput,
  CustomerUnderstandingMetrics,
  CustomerUnderstandingResult,
  NeedRecommendation,
  emptyCustomerNeed,
} from './customer-need.types';
import { EgyptianArabicUnderstandingService } from './egyptian-arabic-understanding.service';
import { NeedProductMapperService } from './need-product-mapper.service';

interface MetricCounters {
  requests: number;
  messagesToSelection: number;
  clarificationCount: number;
  recommendationsShown: number;
  productSelections: number;
  recommendationRejections: number;
  fullMenuDumps: number;
  completedOrders: number;
  completionTimeMs: number;
  abandoned: number;
  misunderstandings: number;
  handoffRequests: number;
  handoffsCreated: number;
  usualRequests: number;
  usualSuccess: number;
  budgetViolations: number;
  urgentSelections: number;
  urgentSuccessful: number;
  feedbackPositive: number;
  feedbackTotal: number;
}

@Injectable()
export class CustomerUnderstandingService {
  private readonly metrics = new Map<string, MetricCounters>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly egyptianArabic: EgyptianArabicUnderstandingService,
    private readonly clarificationPolicy: ClarificationPolicyService,
    private readonly mapper: NeedProductMapperService,
  ) {}

  async understand(input: CustomerUnderstandingInput): Promise<CustomerUnderstandingResult> {
    const counters = this.counters(input.cafeId);
    counters.requests += 1;
    const current = this.egyptianArabic.extract(input.message, {
      now: input.now,
      lastBotQuestion: input.lastBotQuestion,
    });
    const need = this.mergeNeed(current, input.draftNeed, input.memory);
    const vagueRequest = /(?:عايز حاجه|محتاج حاجه|هاتلي الحكايه|هاتلي حاجه|اختارلي)/.test(this.egyptianArabic.normalize(input.message));
    const hasCurrentSignal = current.primaryIntent !== 'UNKNOWN_NEED' || current.evidence.length > 0 || vagueRequest;
    const continuing = Boolean(input.draftNeed || input.lastBotQuestion);
    if (!hasCurrentSignal && !continuing) return this.result(false, 'PASS_THROUGH', need, '', false);

    if (need.primaryIntent === 'HUMAN_ASSISTANCE') {
      const handoff = await this.requestHumanAssistance(input, 'CUSTOMER_REQUEST');
      return this.result(true, handoff.created ? 'HUMAN_HANDOFF_CREATED' : 'OFFER_HUMAN_HANDOFF', need, handoff.reply, handoff.available);
    }

    if (need.primaryIntent === 'COMPLAINT') {
      const available = await this.isHumanAvailable(input.cafeId, input.branchId);
      const reply = available
        ? 'حقك عليا. مش هاقترح عليك أي إضافة. تحب أوصلك بحد من الكافيه يساعدك؟'
        : 'حقك عليا. مش هاقترح عليك أي إضافة، ومفيش موظف متاح مؤكد دلوقتي. اكتب تفاصيل المشكلة وهتتسجل للمراجعة.';
      return this.result(true, available ? 'OFFER_HUMAN_HANDOFF' : 'ACKNOWLEDGE_COMPLAINT', need, reply, available);
    }

    if (need.primaryIntent === 'REPEAT_USUAL_ORDER') {
      counters.usualRequests += 1;
      return this.result(true, 'REPEAT_USUAL_ORDER', need, '', false);
    }

    if (need.primaryIntent === 'SCHEDULED_ORDER') {
      const clarification = this.clarificationPolicy.nextQuestion(need, input.clarificationCount, input.lastBotQuestion);
      if (clarification) {
        counters.clarificationCount += 1;
        return { ...this.result(true, 'ASK_CLARIFICATION', need, clarification.question, false), clarification };
      }
      const available = await this.isHumanAvailable(input.cafeId, input.branchId);
      const reply = available
        ? 'فهمت إن الطلب لموعد لاحق، لكن التأكيد المجدول محتاج موظف من الكافيه. تحب أوصلك بحد؟'
        : 'فهمت إن الطلب لموعد لاحق، لكن مفيش تأكيد آلي أو موظف متاح مؤكد دلوقتي.';
      return this.result(true, 'SCHEDULED_ORDER_UNSUPPORTED', need, reply, available);
    }

    const clarification = this.clarificationPolicy.nextQuestion(need, input.clarificationCount, input.lastBotQuestion);
    if (clarification) {
      counters.clarificationCount += 1;
      return { ...this.result(true, 'ASK_CLARIFICATION', need, clarification.question, false), clarification };
    }

    let recommendations: NeedRecommendation[] = [];
    try {
      recommendations = await this.mapper.find(input.cafeId, input.branchId, need, {
        deliveryFee: input.deliveryFee,
        recentProductIds: input.recentProductIds,
        max: 3,
      });
    } catch {
      // Fail closed while an owner-approved tag migration is pending or catalog data is unavailable.
      recommendations = [];
    }
    if (recommendations.length) {
      counters.recommendationsShown += recommendations.length;
      return {
        ...this.result(true, 'SEARCH_RELEVANT_PRODUCTS', need, this.formatRecommendations(need, recommendations), false),
        recommendations,
      };
    }

    const handoffAvailable = await this.isHumanAvailable(input.cafeId, input.branchId);
    const reply = handoffAvailable
      ? 'مش لاقي اختيار متاح يطابق طلبك من غير ما أخمّن. تحب أوصلك بحد من الكافيه؟'
      : 'مش لاقي اختيار متاح ومؤكد يطابق طلبك دلوقتي. اكتب اسم منتج محدد أو اطلب المنيو.';
    return this.result(true, 'OFFER_HUMAN_HANDOFF', need, reply, handoffAvailable);
  }

  async revalidateRecommendation(
    cafeId: string,
    branchId: string,
    candidate: NeedRecommendation,
    budgetMax: number | null,
  ): Promise<NeedRecommendation | null> {
    const verified = await this.mapper.revalidate(cafeId, branchId, candidate, budgetMax);
    if (!verified && budgetMax !== null) this.counters(cafeId).budgetViolations += 1;
    return verified;
  }

  async requestHumanAssistance(
    input: Pick<CustomerUnderstandingInput, 'cafeId' | 'branchId' | 'customerId' | 'channel' | 'channelIdentity' | 'message'>,
    reason: string,
  ): Promise<{ created: boolean; available: boolean; reply: string }> {
    const counters = this.counters(input.cafeId);
    counters.handoffRequests += 1;
    const staff = await this.prisma.staff.findFirst({
      where: { cafeId: input.cafeId, branchId: input.branchId, active: true, role: 'BARISTA' },
      select: { id: true },
    });
    if (!staff) {
      return { created: false, available: false, reply: 'مفيش موظف متاح مؤكد في الفرع دلوقتي. اكتب تفاصيل طلبك وهحاول أساعدك من غير ما أخمّن.' };
    }
    await this.prisma.notification.create({
      data: {
        cafeId: input.cafeId,
        branchId: input.branchId,
        type: 'CUSTOMER_ASSISTANCE_REQUEST',
        title: 'عميل طلب مساعدة بشرية',
        message: `طلب مساعدة من قناة ${input.channel}`,
        data: {
          customerId: input.customerId || null,
          channel: input.channel,
          channelIdentity: input.channelIdentity,
          reason,
        },
        roleTarget: 'BARISTA',
      },
    });
    counters.handoffsCreated += 1;
    return { created: true, available: true, reply: 'تمام، بلغت حد من الكافيه يساعدك.' };
  }

  humanAssistanceAvailable(cafeId: string, branchId: string): Promise<boolean> {
    return this.isHumanAvailable(cafeId, branchId);
  }

  recordProductSelection(cafeId: string, need: CustomerNeed, messagesToSelection: number): void {
    const counters = this.counters(cafeId);
    counters.productSelections += 1;
    counters.messagesToSelection += Math.max(1, messagesToSelection);
    if (need.urgency === 'HIGH' || need.urgency === 'IMMEDIATE') {
      counters.urgentSelections += 1;
      counters.urgentSuccessful += 1;
    }
  }

  recordRecommendationRejection(cafeId: string): void {
    this.counters(cafeId).recommendationRejections += 1;
  }

  recordRepeatedMisunderstanding(cafeId: string): void {
    this.counters(cafeId).misunderstandings += 1;
  }

  recordOrderCompleted(cafeId: string, elapsedMs: number): void {
    const counters = this.counters(cafeId);
    counters.completedOrders += 1;
    counters.completionTimeMs += Math.max(0, elapsedMs);
  }

  recordAbandoned(cafeId: string): void {
    this.counters(cafeId).abandoned += 1;
  }

  recordUsualOrderSuccess(cafeId: string): void {
    this.counters(cafeId).usualSuccess += 1;
  }

  recordFeedback(cafeId: string, useful: boolean): { recorded: true } {
    const counters = this.counters(cafeId);
    counters.feedbackTotal += 1;
    if (useful) counters.feedbackPositive += 1;
    return { recorded: true };
  }

  getMetrics(cafeId: string): CustomerUnderstandingMetrics {
    const c = this.counters(cafeId);
    return {
      messagesToProductSelectionAverage: this.ratio(c.messagesToSelection, c.productSelections),
      clarificationCount: c.clarificationCount,
      recommendationRelevance: this.ratio(c.productSelections, c.recommendationsShown),
      customerRejectionRate: this.ratio(c.recommendationRejections, c.productSelections + c.recommendationRejections),
      fullMenuDumpRate: this.ratio(c.fullMenuDumps, c.requests),
      orderCompletionRate: this.ratio(c.completedOrders, c.productSelections),
      averageOrderCompletionMs: this.ratio(c.completionTimeMs, c.completedOrders),
      abandonedConversations: c.abandoned,
      repeatedMisunderstandings: c.misunderstandings,
      humanHandoffRate: this.ratio(c.handoffsCreated, c.requests),
      successfulUsualOrderUsage: this.ratio(c.usualSuccess, c.usualRequests),
      budgetConstraintViolations: c.budgetViolations,
      urgencyResponseSuccess: this.ratio(c.urgentSuccessful, c.urgentSelections),
      customerFeedbackPositiveRate: this.ratio(c.feedbackPositive, c.feedbackTotal),
      totalUnderstandingRequests: c.requests,
      recommendationsShown: c.recommendationsShown,
      productSelections: c.productSelections,
      completedOrders: c.completedOrders,
      tenantScope: cafeId,
    };
  }

  private mergeNeed(current: CustomerNeed, draft?: CustomerNeed, memory?: CustomerNeedMemory): CustomerNeed {
    const merged = emptyCustomerNeed();
    if (memory) {
      merged.conversationStyle = memory.conversationStyle || null;
      merged.temperature = memory.temperature || null;
      merged.sweetness = memory.sweetness || null;
      merged.novelty = memory.novelty || null;
    }
    if (draft) Object.assign(merged, draft, { evidence: [...draft.evidence], currentOverrides: [...draft.currentOverrides] });

    const fields: Array<keyof Pick<CustomerNeed,
      'desiredEffect' | 'urgency' | 'budgetSensitivity' | 'budgetMax' | 'novelty' | 'conversationStyle' |
      'temperature' | 'sweetness' | 'caffeine' | 'food' | 'timing' | 'scheduledFor' | 'groupSize'>> = [
        'desiredEffect', 'urgency', 'budgetSensitivity', 'budgetMax', 'novelty', 'conversationStyle',
        'temperature', 'sweetness', 'caffeine', 'food', 'timing', 'scheduledFor', 'groupSize',
      ];
    for (const field of fields) {
      const currentValue = current[field];
      if (currentValue !== null) {
        if (merged[field] !== null && merged[field] !== currentValue) merged.currentOverrides.push(String(field));
        (merged as any)[field] = currentValue;
      }
    }
    const currentHasIntent = current.primaryIntent !== 'UNKNOWN_NEED';
    merged.primaryIntent = currentHasIntent ? current.primaryIntent : draft?.primaryIntent || current.primaryIntent;
    merged.intents = [...new Set([
      ...(currentHasIntent ? current.intents.filter((intent) => intent !== 'UNKNOWN_NEED') : []),
      ...(draft?.intents || []),
    ])];
    if (!merged.intents.length) merged.intents = ['UNKNOWN_NEED'];
    merged.confidence = currentHasIntent ? current.confidence : draft?.confidence || current.confidence;
    merged.confidenceLevel = merged.confidence >= 0.8 ? 'HIGH' : merged.confidence >= 0.55 ? 'MEDIUM' : 'LOW';
    merged.evidence = [...new Set([...(draft?.evidence || []), ...current.evidence])];
    merged.currentOverrides = [...new Set(merged.currentOverrides)];
    merged.morningFastMode = current.morningFastMode || Boolean(draft?.morningFastMode);
    return merged;
  }

  private formatRecommendations(need: CustomerNeed, options: NeedRecommendation[]): string {
    const prefix = need.primaryIntent === 'MOOD_IMPROVEMENT_REQUEST'
      ? 'فاهم إنك عايز حاجة تروقك. دي اختيارات متاحة من غير ادعاء تأثير طبي:'
      : need.morningFastMode
        ? 'أسرع اختيارات مطابقة:'
        : 'أقرب اختيارات لطلبك:';
    const lines = options.map((option, index) => {
      const price = option.deliveryFee > 0
        ? `${option.finalPrice} ج شامل ${option.deliveryFee} ج توصيل`
        : `${option.finalPrice} ج`;
      return `${index + 1}. ${option.productName} — ${price}\n${option.reason}`;
    });
    return `${prefix}\n${lines.join('\n')}\nاختار الرقم أو الاسم.`;
  }

  private async isHumanAvailable(cafeId: string, branchId: string): Promise<boolean> {
    const staff = await this.prisma.staff.findFirst({
      where: { cafeId, branchId, active: true, role: 'BARISTA' },
      select: { id: true },
    });
    return Boolean(staff);
  }

  private result(
    handled: boolean,
    action: CustomerUnderstandingResult['action'],
    need: CustomerNeed,
    reply: string,
    handoffAvailable: boolean,
  ): CustomerUnderstandingResult {
    return { handled, action, need, recommendations: [], reply, handoffAvailable };
  }

  private counters(cafeId: string): MetricCounters {
    if (!this.metrics.has(cafeId)) {
      this.metrics.set(cafeId, {
        requests: 0, messagesToSelection: 0, clarificationCount: 0, recommendationsShown: 0,
        productSelections: 0, recommendationRejections: 0, fullMenuDumps: 0, completedOrders: 0,
        completionTimeMs: 0, abandoned: 0, misunderstandings: 0, handoffRequests: 0,
        handoffsCreated: 0, usualRequests: 0, usualSuccess: 0, budgetViolations: 0,
        urgentSelections: 0, urgentSuccessful: 0, feedbackPositive: 0, feedbackTotal: 0,
      });
    }
    return this.metrics.get(cafeId)!;
  }

  private ratio(numerator: number, denominator: number): number {
    return denominator ? Math.round((numerator / denominator) * 10000) / 10000 : 0;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerHabitService, HabitAnalysisResult } from './customer-habit.service';
import { EventsService } from '../events/events.service';

export interface SuggestionResult {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  predictedHour: number;
  confidence: number;
  predictedItems: Array<{ productId: string; name: string; probability: number }>;
  suggestedMessage: string;
  reasoning: string;
  channelPrediction: string;
  status: string;
  createdAt: Date;
}

@Injectable()
export class SuggestionEngineService {
  private readonly logger = new Logger(SuggestionEngineService.name);

  private readonly templates = {
    ar: {
      greeting: 'مرحباً {name}',
      regular: 'نشتاق لطلبك! حضرتك دايماً تطلب {items}، ممكن نجهز طلبك المفضل النهاردة؟',
      weekly: 'زي كل {day}، بنفتكر طلبك المفضل {items}. عاوز تجهز الطلب زي العادة؟',
      dormant: 'افتقدناك! من فترة مجتش. تعال جرب {items} أو حاجة جديدة — عندنا عروض حلوة!',
      new: 'شرفنا بزيارتك! جرب {items} كبداية، أو اسأل الباريستا عن توصياتنا.',
      general: 'مساء الخير {name}! حابب تطلب {items} زي العادة النهاردة؟',
    },
  };

  private readonly weekDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly habitService: CustomerHabitService,
    private readonly events: EventsService,
  ) {}

  async generateDailySuggestions(cafeId?: string): Promise<SuggestionResult[]> {
    if (!cafeId) return [];
    this.logger.log('Starting daily suggestion generation...');

    const customers = await this.prisma.customer.findMany({
      where: { cafeId, orders: { some: { cafeId } } },
      include: { orders: { take: 1, orderBy: { createdAt: 'desc' }, select: { createdAt: true } } },
    });

    this.logger.log(`Analyzing ${customers.length} customers with order history`);

    const results: SuggestionResult[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    for (const customer of customers) {
      try {
        const analysis = await this.habitService.analyzeCustomer(customer.id, cafeId);

        if (analysis.totalOrders < 2) continue;
        if (analysis.overallConfidence < 0.7) continue;
        if (analysis.daysSinceLastOrder > 30) continue;
        if (analysis.lifecycleStage === 'at_risk') continue;

        const habit = await this.prisma.customerHabit.findFirst({
          where: { customerId: customer.id, cafeId },
        });
        if (habit?.isPaused) continue;

        const alreadySuggested = await this.prisma.suggestion.findFirst({
          where: {
            cafeId,
            customerId: customer.id,
            createdAt: { gte: today },
            status: { in: ['active', 'sent'] },
          },
        });
        if (alreadySuggested) continue;

        const now = new Date();
        const currentHour = now.getHours();
        const quietStart = habit?.quietHourStart ?? 22;
        const quietEnd = habit?.quietHourEnd ?? 8;
        const predictedHour = analysis.peakOrderHour;

        if (currentHour >= quietStart || currentHour < quietEnd) {
          this.logger.debug(`Skipping ${customer.name} — quiet hours`);
          continue;
        }

        const suggestion = await this.createSuggestion(customer, analysis, predictedHour);
        results.push(suggestion);
      } catch (err) {
        this.logger.error(`Error analyzing customer ${customer.id}: ${err}`);
      }
    }

    results.sort((a, b) => b.confidence - a.confidence);

    if (results.length > 0) {
      this.events.emitToOwner('smart-followup.suggestions.ready', {
        count: results.length,
        timestamp: new Date().toISOString(),
        suggestions: results.slice(0, 5),
      });
    }

    this.logger.log(`Generated ${results.length} suggestions`);
    return results;
  }

  private async createSuggestion(
    customer: any,
    analysis: HabitAnalysisResult,
    predictedHour: number,
  ): Promise<SuggestionResult> {
    await this.habitService.upsertHabit(analysis, customer.cafeId);

    const topItemNames = analysis.topProducts.slice(0, 3).map((p) => p.name).join('، ');
    const items = analysis.topProducts.slice(0, 3).map((p) => ({
      productId: p.productId,
      name: p.name,
      probability: Math.round((p.count / analysis.totalOrders) * 100) / 100,
    }));
    const totalCheck = items.reduce((s, i) => s + i.probability, 0);
    const normalizedItems = items.map((i) => ({
      ...i,
      probability: totalCheck > 0 ? Math.round((i.probability / totalCheck) * 100) / 100 : 0,
    }));

    const patternLabel = this.getPatternLabel(analysis.frequencyPattern);
    const customerName = customer.name || customer.phone;
    const greeting = this.templates.ar.greeting.replace('{name}', customerName);
    const dayName = this.weekDays[new Date().getDay()];

    let messageBody: string;
    if (analysis.lifecycleStage === 'dormant') {
      messageBody = this.templates.ar.dormant
        .replace('{items}', topItemNames);
    } else if (analysis.lifecycleStage === 'new') {
      messageBody = this.templates.ar.new
        .replace('{items}', topItemNames);
    } else if (analysis.frequencyPattern === 'weekly' || analysis.frequencyPattern === 'biweekly') {
      messageBody = this.templates.ar.weekly
        .replace('{day}', dayName)
        .replace('{items}', topItemNames);
    } else {
      messageBody = this.templates.ar.general
        .replace('{name}', customerName)
        .replace('{items}', topItemNames);
    }

    const suggestedMessage = `${greeting}\n\n${messageBody}`;

    const reasoning = `${customerName} ${patternLabel} في الساعة ${String(predictedHour).padStart(2, '0')}:00. ` +
      `المنتجات المتوقعة: ${topItemNames}. مستوى الثقة: ${Math.round(analysis.overallConfidence * 100)}%.`;

    const created = await this.prisma.suggestion.create({
      data: {
        cafeId: customer.cafeId,
        customerId: customer.id,
        predictedHour,
        confidence: analysis.overallConfidence,
        predictedItems: JSON.stringify(normalizedItems),
        suggestedMessage,
        reasoning,
        channelPrediction: analysis.channelPreference,
        status: 'active',
      } as any,
    });

    await this.prisma.customerHabit.upsert({
      where: { customerId: customer.id },
      update: { suggestionCount: { increment: 1 } },
      create: { cafeId: customer.cafeId, customerId: customer.id, suggestionCount: 1 } as any,
    });

    return {
      id: created.id,
      customerId: customer.id,
      customerName: customerName ?? 'Unknown',
      customerPhone: customer.phone,
      predictedHour,
      confidence: analysis.overallConfidence,
      predictedItems: normalizedItems,
      suggestedMessage,
      reasoning,
      channelPrediction: analysis.channelPreference,
      status: 'active',
      createdAt: created.createdAt,
    };
  }

  private getPatternLabel(pattern: string): string {
    const labels: Record<string, string> = {
      daily: 'يطلب يومياً تقريباً',
      every_few_days: 'يطلب كل بضعة أيام',
      weekly: 'يطلب أسبوعياً',
      biweekly: 'يطلب كل أسبوعين',
      monthly: 'يطلب شهرياً',
      semi_regular: 'يطلب بشكل شبه منتظم',
      irregular: 'لديه نمط غير منتظم',
    };
    return labels[pattern] || 'لديه سجل طلبات';
  }

  async getUserSuggestions(status?: string, limit = 50, offset = 0, cafeId?: string) {
    if (!cafeId) return { suggestions: [], total: 0 };
    const where: any = { cafeId };
    if (status) where.status = status;
    if (!status) where.status = { in: ['active', 'sent'] };

    const [suggestions, total] = await Promise.all([
      this.prisma.suggestion.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true, lastOrderDate: true, totalOrders: true } },
          feedback: true,
        },
        orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.suggestion.count({ where }),
    ]);

    return { suggestions, total };
  }

  async updateSuggestionStatus(id: string, status: string, ownerEditedMessage?: string, ownerNote?: string, cafeId?: string) {
    if (!cafeId) throw new Error('Cafe scope is required');
    const data: any = { status };
    if (ownerEditedMessage !== undefined) data.ownerEditedMessage = ownerEditedMessage;
    if (ownerNote !== undefined) data.ownerNote = ownerNote;

    const suggestion = await this.prisma.suggestion.findFirst({ where: { id, cafeId }, select: { id: true } });
    if (!suggestion) throw new Error('Suggestion not found');
    return this.prisma.suggestion.update({ where: { id: suggestion.id }, data });
  }

  async dismissSuggestion(id: string, cafeId?: string) {
    if (!cafeId) throw new Error('Cafe scope is required');
    const suggestion = await this.prisma.suggestion.findFirst({ where: { id, cafeId }, select: { id: true } });
    if (!suggestion) throw new Error('Suggestion not found');
    return this.prisma.suggestion.update({
      where: { id: suggestion.id },
      data: { status: 'dismissed' },
    });
  }

  async markSent(id: string, cafeId?: string) {
    if (!cafeId) throw new Error('Cafe scope is required');
    const suggestion = await this.prisma.suggestion.findFirst({ where: { id, cafeId }, select: { id: true } });
    if (!suggestion) throw new Error('Suggestion not found');
    return this.prisma.suggestion.update({
      where: { id: suggestion.id },
      data: { status: 'sent' },
    });
  }

  async submitFeedback(suggestionId: string, wasCorrect: boolean, ownerRating?: number, notes?: string, cafeId?: string) {
    if (!cafeId) throw new Error('Cafe scope is required');
    const suggestion = await this.prisma.suggestion.findFirst({ where: { id: suggestionId, cafeId } });
    if (!suggestion) throw new Error('Suggestion not found');

    await this.prisma.suggestionFeedback.create({
      data: {
        cafeId: suggestion.cafeId,
        suggestionId,
        wasCorrect,
        ownerRating: ownerRating ?? 3,
        notes,
      } as any,
    });

    await this.prisma.suggestion.update({
      where: { id: suggestionId },
      data: { feedbackCorrect: wasCorrect },
    });

    await this.habitService.updateFeedback(suggestion.customerId, wasCorrect, cafeId);
  }

  async getCustomerHabit(customerId: string, cafeId?: string) {
    if (!cafeId) return null;
    return this.prisma.customerHabit.findFirst({
      where: { customerId, cafeId },
      include: { customer: { select: { id: true, name: true, phone: true, totalOrders: true, lastOrderDate: true } } },
    });
  }

  async updateCustomerQuietHours(customerId: string, quietHourStart: number, quietHourEnd: number, cafeId?: string) {
    if (!cafeId) throw new Error('Cafe scope is required');
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, cafeId }, select: { id: true } });
    if (!customer) throw new Error('Customer not found');
    return this.prisma.customerHabit.upsert({
      where: { customerId },
      update: { quietHourStart, quietHourEnd },
      create: { cafeId, customerId, quietHourStart, quietHourEnd } as any,
    });
  }

  async togglePauseCustomer(customerId: string, isPaused: boolean, cafeId?: string) {
    if (!cafeId) throw new Error('Cafe scope is required');
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, cafeId }, select: { id: true } });
    if (!customer) throw new Error('Customer not found');
    return this.prisma.customerHabit.upsert({
      where: { customerId },
      update: { isPaused },
      create: { cafeId, customerId, isPaused } as any,
    });
  }

  async getWeeklyStats(cafeId?: string) {
    if (!cafeId) return {
      totalSuggestions: 0, sentCount: 0, dismissedCount: 0, feedbackCount: 0,
      feedbackAccuracy: 0, topPredictedCount: 0, period: null,
    };
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const [totalSuggestions, sentCount, dismissedCount, feedbackEntries] = await Promise.all([
      this.prisma.suggestion.count({ where: { cafeId, createdAt: { gte: weekAgo } } }),
      this.prisma.suggestion.count({ where: { cafeId, status: 'sent', createdAt: { gte: weekAgo } } }),
      this.prisma.suggestion.count({ where: { cafeId, status: 'dismissed', createdAt: { gte: weekAgo } } }),
      this.prisma.suggestionFeedback.findMany({
        where: { cafeId, suggestion: { createdAt: { gte: weekAgo } } },
        select: { wasCorrect: true },
      }),
    ]);

    const correctCount = feedbackEntries.filter((f) => f.wasCorrect).length;
    const accuracy = feedbackEntries.length > 0 ? correctCount / feedbackEntries.length : 0;

    const topPredicted = await this.prisma.suggestion.groupBy({
      by: ['customerId'],
      where: { cafeId, createdAt: { gte: weekAgo }, status: { in: ['active', 'sent'] } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    return {
      totalSuggestions,
      sentCount,
      dismissedCount,
      feedbackCount: feedbackEntries.length,
      feedbackAccuracy: accuracy,
      topPredictedCount: topPredicted.length,
      period: { from: weekAgo.toISOString(), to: today.toISOString() },
    };
  }
}





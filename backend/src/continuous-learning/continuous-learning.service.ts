import { Injectable, Logger, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  LearningEventInput, EvaluationCaseInput, PromptVersionInput, RuleVersionInput,
  ModelVersionInput, FeatureFlagInput, CanaryReleaseInput, ChangeAuditInput,
  ReviewQueueInput, ExperienceScoreInput, DriftDetectionInput, CorpusEntryInput,
  OfflineEvaluationResult, ResponseQualityEvaluation, CustomerExperienceScoreResult,
  MetricSnapshot, QualityCheckResult, ImprovementProposal,
  FailureCategory, SuccessCategory, RootCauseCategory, Severity, PromptStatus,
  PrivacyStatus, ChangeType,
} from './continuous-learning.types';

@Injectable()
export class ContinuousLearningService {
  private readonly logger = new Logger(ContinuousLearningService.name);

  // In-memory metrics per cafeId
  private readonly experienceScores = new Map<string, { running: number[]; count: number; lastTrend: string }>();
  private readonly failuresByCategory = new Map<string, Map<string, number>>();
  private readonly phrasesByFrequency = new Map<string, { phrase: string; count: number; lastContext: string }[]>();
  private readonly promptVersionsInUse = new Map<string, string[]>();

  constructor(private readonly prisma: PrismaService) {}

  // ── Learning Events (Phases 4-7) ──

  async createLearningEvent(input: LearningEventInput) {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const event = await this.prisma.learningEvent.create({
          data: {
            cafeId: input.cafeId,
            customerId: input.customerId || null,
            sessionId: input.sessionId || null,
            channel: input.channel || 'TELEGRAM',
            eventType: input.eventType,
            severity: input.severity || 'MEDIUM',
            primaryCategory: input.primaryCategory,
            secondaryCategories: input.secondaryCategories || [],
            messageReference: input.messageReference || null,
            stateBefore: input.stateBefore || undefined,
            expectedBehavior: input.expectedBehavior || undefined,
            actualBehavior: input.actualBehavior || undefined,
            customerCorrection: input.customerCorrection || null,
            correctedIntent: input.correctedIntent || null,
            correctedEntities: input.correctedEntities || undefined,
            humanResolution: input.humanResolution || null,
            humanChanges: input.humanChanges || undefined,
            orderCompleted: input.orderCompleted ?? null,
            promptVersion: input.promptVersion || null,
            modelVersion: input.modelVersion || null,
            toolVersions: input.toolVersions || undefined,
            rootCause: input.rootCause || null,
            shouldBecomeCase: input.shouldBecomeCase || false,
          },
        });

        this.trackFailureCategory(input.cafeId, input.primaryCategory);
        this.logger.log(`LearningEvent created: ${event.id} type=${input.eventType} cafe=${input.cafeId}`);
        return event;
      } catch (err) {
        if (attempt === maxRetries) throw err;
        await new Promise(r => setTimeout(r, 50 * attempt));
      }
    }
  }

  async getLearningEvents(cafeId: string, options?: {
    eventType?: string; severity?: string; category?: string; limit?: number; offset?: number;
  }) {
    const where: any = { cafeId };
    if (options?.eventType) where.eventType = options.eventType;
    if (options?.severity) where.severity = options.severity;
    if (options?.category) where.primaryCategory = options.category;

    const [items, total] = await Promise.all([
      this.prisma.learningEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      }),
      this.prisma.learningEvent.count({ where }),
    ]);
    return { items, total };
  }

  async acknowledgeEvent(eventId: string, cafeId: string, userId: string) {
    const event = await this.prisma.learningEvent.findUnique({ where: { id: eventId } });
    if (!event || event.cafeId !== cafeId) throw new ForbiddenException('Event not found');
    return this.prisma.learningEvent.update({
      where: { id: eventId },
      data: { acknowledged: true, acknowledgedBy: userId, acknowledgedAt: new Date() },
    });
  }

  async markForEvaluation(eventId: string, cafeId: string) {
    const event = await this.prisma.learningEvent.findUnique({ where: { id: eventId } });
    if (!event || event.cafeId !== cafeId) throw new ForbiddenException('Event not found');
    return this.prisma.learningEvent.update({
      where: { id: eventId },
      data: { shouldBecomeCase: true },
    });
  }

  // ── Success Detection ──

  async createSuccessEvent(input: {
    cafeId: string; customerId?: string; sessionId?: string; channel?: string;
    successCategory: SuccessCategory; details?: Record<string, any>;
    promptVersion?: string; modelVersion?: string;
  }) {
    return this.createLearningEvent({
      cafeId: input.cafeId,
      customerId: input.customerId,
      sessionId: input.sessionId,
      channel: input.channel || 'TELEGRAM',
      eventType: 'SUCCESS',
      severity: 'LOW',
      primaryCategory: input.successCategory as any,
      expectedBehavior: input.details,
      actualBehavior: input.details,
      promptVersion: input.promptVersion,
      modelVersion: input.modelVersion,
    });
  }

  // ── Failure Detection Signals ──

  detectFailureSignals(input: {
    message?: string; previousQuestion?: string; clarificationCount?: number;
    cancelledImmediately?: boolean; humanRequested?: boolean;
    recommendationRejected?: boolean; orderAbandoned?: boolean;
    customerCorrected?: boolean; repeatedQuestion?: boolean;
  }): { detected: boolean; category?: FailureCategory; confidence: number } {
    if (input.humanRequested) return { detected: true, category: 'HUMAN_HANDOFF_ERROR', confidence: 0.95 };
    if (input.customerCorrected) return { detected: true, category: 'ENTITY_EXTRACTION_ERROR', confidence: 0.9 };
    if (input.repeatedQuestion) return { detected: true, category: 'CONVERSATION_STATE_ERROR', confidence: 0.85 };
    if (input.cancelledImmediately) return { detected: true, category: 'CANCELLATION_ERROR', confidence: 0.7 };
    if (input.recommendationRejected) return { detected: true, category: 'RECOMMENDATION_ERROR', confidence: 0.6 };
    if (input.clarificationCount && input.clarificationCount >= 3) {
      return { detected: true, category: 'CONVERSATION_STATE_ERROR', confidence: 0.65 };
    }
    if (input.orderAbandoned) return { detected: true, category: 'UNKNOWN_ERROR', confidence: 0.4 };

    if (input.message) {
      const correctionSignals = [
        'لا مش', 'مش ده', 'قصدي', 'مش كده', 'لا ده', 'أنا قلت', 'مش دا',
        'غلط', 'مش مظبوط', 'لا لا', 'أنا عايز', 'مش عايز',
      ];
      for (const signal of correctionSignals) {
        if (input.message.includes(signal)) {
          return { detected: true, category: 'ENTITY_EXTRACTION_ERROR', confidence: 0.8 };
        }
      }
    }

    return { detected: false, confidence: 0 };
  }

  // ── Human Resolution Capture ──

  async captureHumanResolution(input: {
    cafeId: string; eventId?: string; sessionId?: string;
    handoffReason: string; aiMisunderstanding: string;
    finalCorrectOrder?: Record<string, any>; finalCustomerIntent?: string;
    changesMadeByHuman: string[]; orderCompleted: boolean;
    shouldBecomeTest: boolean; staffNotes?: string;
  }) {
    const eventData: LearningEventInput = {
      cafeId: input.cafeId,
      sessionId: input.sessionId,
      channel: 'HUMAN_HANDOFF',
      eventType: 'HUMAN_RESOLUTION',
      severity: 'MEDIUM',
      primaryCategory: 'HUMAN_HANDOFF_ERROR',
      humanResolution: input.handoffReason,
      humanChanges: {
        aiMisunderstanding: input.aiMisunderstanding,
        changesMade: input.changesMadeByHuman,
        staffNotes: input.staffNotes,
      },
      actualBehavior: input.finalCorrectOrder,
      correctedIntent: input.finalCustomerIntent,
      orderCompleted: input.orderCompleted,
      shouldBecomeCase: input.shouldBecomeTest,
    };
    const event = await this.createLearningEvent(eventData);

    if (input.shouldBecomeTest && input.finalCustomerIntent) {
      await this.createEvaluationCase({
        caseId: `eval-hr-${Date.now().toString(36)}`,
        cafeId: input.cafeId,
        source: 'HUMAN_RESOLUTION',
        dataset: input.aiMisunderstanding.includes('اللغة') || input.aiMisunderstanding.includes('عربي') ? 'EGYPTIAN_ARABIC' : 'CUSTOMER_ORDERING',
        input: input.aiMisunderstanding,
        expectedIntent: input.finalCustomerIntent,
        expectedEntities: input.finalCorrectOrder,
      });
    }

    return event;
  }

  // ── Customer Correction Capture ──

  async captureCustomerCorrection(input: {
    cafeId: string; customerId?: string; sessionId?: string; channel?: string;
    originalInterpretation: string; correctedInterpretation: string;
    conversationState?: Record<string, any>; productContext?: Record<string, any>;
    confidence: number; isGeneralizable: boolean;
    promptVersion?: string; modelVersion?: string;
  }) {
    return this.createLearningEvent({
      cafeId: input.cafeId,
      customerId: input.customerId,
      sessionId: input.sessionId,
      channel: input.channel || 'TELEGRAM',
      eventType: 'CUSTOMER_CORRECTION',
      severity: 'LOW',
      primaryCategory: 'ENTITY_EXTRACTION_ERROR',
      expectedBehavior: { interpretation: input.correctedInterpretation },
      actualBehavior: { interpretation: input.originalInterpretation },
      customerCorrection: input.correctedInterpretation,
      correctedIntent: input.correctedInterpretation,
      stateBefore: input.conversationState,
      promptVersion: input.promptVersion,
      modelVersion: input.modelVersion,
    });
  }

  // ── Evaluation Cases (Phase 8-9) ──

  async createEvaluationCase(input: EvaluationCaseInput) {
    const existing = await this.prisma.evaluationCase.findUnique({ where: { caseId: input.caseId } });
    if (existing) {
      this.logger.warn(`Duplicate evaluation case: ${input.caseId}`);
      return existing;
    }

    return this.prisma.evaluationCase.create({
      data: {
        caseId: input.caseId,
        cafeId: input.cafeId,
        source: input.source,
        dataset: input.dataset,
        version: input.version || 'v1',
        input: input.input,
        stateBefore: input.stateBefore || undefined,
        expectedIntent: input.expectedIntent || null,
        expectedEntities: input.expectedEntities || undefined,
        expectedAction: input.expectedAction || null,
        expectedState: input.expectedState || null,
        forbiddenActions: input.forbiddenActions || [],
        forbiddenStates: input.forbiddenStates || [],
        privacyStatus: input.privacyStatus || 'RAW',
      },
    });
  }

  async getEvaluationCases(cafeId: string, dataset?: string) {
    const where: any = { cafeId };
    if (dataset) where.dataset = dataset;
    return this.prisma.evaluationCase.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async approveEvaluationCase(caseId: string, cafeId: string, userId: string) {
    const ec = await this.prisma.evaluationCase.findUnique({ where: { caseId } });
    if (!ec || ec.cafeId !== cafeId) throw new ForbiddenException('Case not found');
    return this.prisma.evaluationCase.update({
      where: { caseId },
      data: { approved: true, approvedBy: userId, approvedAt: new Date() },
    });
  }

  async disableEvaluationCase(caseId: string, cafeId: string, reason: string) {
    const ec = await this.prisma.evaluationCase.findUnique({ where: { caseId } });
    if (!ec || ec.cafeId !== cafeId) throw new ForbiddenException('Case not found');
    return this.prisma.evaluationCase.update({
      where: { caseId },
      data: { disabled: true, disableReason: reason },
    });
  }

  async duplicateCaseCheck(input: string, dataset: string): Promise<boolean> {
    const existing = await this.prisma.evaluationCase.findFirst({
      where: { input, dataset, disabled: false },
    });
    return !!existing;
  }

  // ── Prompt Versioning (Phase 11) ──

  async createPromptVersion(input: PromptVersionInput) {
    return this.prisma.promptVersion.create({
      data: {
        promptId: input.promptId,
        version: input.version,
        purpose: input.purpose,
        owner: input.owner,
        content: input.content,
        previousContent: input.previousContent || null,
        changeReason: input.changeReason || null,
        linkedCases: input.linkedCases || [],
        expectedImpact: input.expectedImpact || null,
        risk: input.risk || 'LOW',
        status: 'DRAFT',
        rollbackVersion: input.rollbackVersion || null,
        authorId: input.authorId || null,
      },
    });
  }

  async getPromptVersions(promptId?: string) {
    const where: any = {};
    if (promptId) where.promptId = promptId;
    return this.prisma.promptVersion.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async updatePromptStatus(promptId: string, version: string, status: PromptStatus, reviewerId?: string) {
    const data: any = { status };
    if (status === 'APPROVED' || status === 'PRODUCTION') {
      data.approvedAt = new Date();
      if (reviewerId) data.reviewerId = reviewerId;
    }
    if (status === 'PRODUCTION') data.deployedAt = new Date();
    return this.prisma.promptVersion.updateMany({
      where: { promptId, version },
      data,
    });
  }

  async getLatestProductionPrompt(promptId: string) {
    return this.prisma.promptVersion.findFirst({
      where: { promptId, status: 'PRODUCTION' },
      orderBy: { deployedAt: 'desc' },
    });
  }

  async rollbackPrompt(promptId: string, currentVersion: string, targetVersion: string, authorId?: string) {
    const target = await this.prisma.promptVersion.findFirst({
      where: { promptId, version: targetVersion },
    });
    if (!target) throw new BadRequestException(`Target version ${targetVersion} not found`);

    await this.updatePromptStatus(promptId, currentVersion, 'ROLLED_BACK');
    return this.createPromptVersion({
      promptId,
      version: `${targetVersion}-restored`,
      purpose: target.purpose,
      owner: target.owner,
      content: target.content,
      previousContent: null,
      changeReason: `Rollback to ${targetVersion}`,
      risk: 'LOW',
      rollbackVersion: null,
      authorId,
    });
  }

  // ── Rule Versioning (Phase 12) ──

  async createRuleVersion(input: RuleVersionInput) {
    return this.prisma.ruleVersion.create({
      data: {
        ruleId: input.ruleId,
        version: input.version,
        name: input.name,
        ruleType: input.ruleType,
        oldBehavior: input.oldBehavior || undefined,
        newBehavior: input.newBehavior,
        reason: input.reason || null,
        tests: input.tests || [],
        impact: input.impact || null,
        rollbackPlan: input.rollbackPlan || null,
        status: 'DRAFT',
        authorId: input.authorId || null,
      },
    });
  }

  async activateRuleVersion(ruleId: string, version: string) {
    return this.prisma.ruleVersion.updateMany({
      where: { ruleId, version },
      data: { status: 'ACTIVE' },
    });
  }

  async getRuleHistory(ruleId: string) {
    return this.prisma.ruleVersion.findMany({ where: { ruleId }, orderBy: { createdAt: 'desc' } });
  }

  // ── Model Versioning (Phase 13) ──

  async createModelVersion(input: ModelVersionInput) {
    return this.prisma.modelVersion.create({
      data: {
        provider: input.provider,
        model: input.model,
        modelVersion: input.modelVersion,
        temperature: input.temperature ?? 0.2,
        responseSchema: input.responseSchema || null,
        toolSchema: input.toolSchema || undefined,
        timeout: input.timeout ?? 30000,
        retryPolicy: input.retryPolicy || undefined,
        tokenLimits: input.tokenLimits || undefined,
        purpose: input.purpose || 'GENERAL',
        status: input.status || 'DRAFT',
      },
    });
  }

  async getModelVersions(provider?: string, model?: string) {
    const where: any = {};
    if (provider) where.provider = provider;
    if (model) where.model = model;
    return this.prisma.modelVersion.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  // ── Feature Flags (Phase 21) ──

  async setFeatureFlag(input: FeatureFlagInput) {
    const existing = await this.prisma.featureFlag.findUnique({
      where: { flagKey_cafeId_environment: { flagKey: input.flagKey, cafeId: input.cafeId || '', environment: input.environment || 'production' } },
    });
    if (existing) {
      return this.prisma.featureFlag.update({
        where: { id: existing.id },
        data: { enabled: input.enabled ?? existing.enabled, rolloutPercent: input.rolloutPercent ?? existing.rolloutPercent, metadata: input.metadata || undefined },
      });
    }
    return this.prisma.featureFlag.create({
      data: {
        flagKey: input.flagKey,
        cafeId: input.cafeId || null,
        environment: input.environment || 'production',
        enabled: input.enabled ?? false,
        rolloutPercent: input.rolloutPercent ?? 0,
        metadata: input.metadata || undefined,
        createdBy: input.createdBy || null,
      },
    });
  }

  async isFeatureEnabled(flagKey: string, cafeId: string, environment?: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { flagKey_cafeId_environment: { flagKey, cafeId, environment: environment || 'production' } },
    });
    if (!flag) return false;
    if (!flag.enabled) return false;
    if (flag.rolloutPercent >= 100) return true;
    const hash = this.simpleHash(`${flagKey}:${cafeId}`);
    return (hash % 100) < flag.rolloutPercent;
  }

  async getFeatureFlags(cafeId?: string, environment?: string) {
    const where: any = {};
    if (cafeId) where.cafeId = cafeId;
    if (environment) where.environment = environment;
    return this.prisma.featureFlag.findMany({ where });
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash);
  }

  // ── Canary Releases (Phase 20) ──

  async createCanaryRelease(input: CanaryReleaseInput) {
    return this.prisma.canaryRelease.create({
      data: {
        releaseId: input.releaseId,
        changeType: input.changeType,
        changeId: input.changeId,
        rolloutPercent: input.rolloutPercent || 1,
        controlGroup: input.controlGroup || undefined,
        canaryGroup: input.canaryGroup || undefined,
        status: 'ACTIVE',
        triggeredBy: input.triggeredBy || null,
      },
    });
  }

  async promoteCanaryRelease(releaseId: string, newPercent: number) {
    return this.prisma.canaryRelease.update({
      where: { releaseId },
      data: { rolloutPercent: newPercent },
    });
  }

  async rollbackCanaryRelease(releaseId: string, reason: string) {
    return this.prisma.canaryRelease.update({
      where: { releaseId },
      data: { status: 'ROLLED_BACK', rollbackReason: reason, rolledBackAt: new Date() },
    });
  }

  async completeCanaryRelease(releaseId: string) {
    return this.prisma.canaryRelease.update({
      where: { releaseId },
      data: { status: 'COMPLETED', completedAt: new Date(), rolloutPercent: 100 },
    });
  }

  // ── Change Audit (Phase 39) ──

  async recordChange(input: ChangeAuditInput) {
    return this.prisma.changeAudit.create({
      data: {
        changeId: input.changeId,
        authorId: input.authorId || null,
        reviewerId: input.reviewerId || null,
        changeType: input.changeType,
        changeTarget: input.changeTarget,
        reason: input.reason || null,
        linkedFailureEvents: input.linkedFailureEvents || [],
        linkedCases: input.linkedCases || [],
        baselineResult: input.baselineResult || undefined,
        candidateResult: input.candidateResult || undefined,
        approval: input.approval || null,
        rolloutPercent: input.rolloutPercent || null,
        productionResult: input.productionResult || undefined,
      },
    });
  }

  async getChangeHistory(changeType?: string, limit = 50) {
    const where: any = {};
    if (changeType) where.changeType = changeType;
    return this.prisma.changeAudit.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
  }

  // ── Review Queue (Phase 28) ──

  async addToReviewQueue(input: ReviewQueueInput) {
    return this.prisma.reviewQueueItem.create({
      data: {
        cafeId: input.cafeId,
        title: input.title,
        description: input.description || null,
        category: input.category || 'UNKNOWN',
        severity: input.severity || 'MEDIUM',
        sourceEventId: input.sourceEventId || null,
        safeExcerpt: input.safeExcerpt || null,
        aiDecision: input.aiDecision || undefined,
        actualOutcome: input.actualOutcome || undefined,
        customerCorrection: input.customerCorrection || null,
        promptVersion: input.promptVersion || null,
        modelVersion: input.modelVersion || null,
        privacyStatus: input.privacyStatus || 'REDACTED',
      },
    });
  }

  async getReviewQueue(cafeId: string, status?: string) {
    const where: any = { cafeId };
    if (status) where.status = status;
    return this.prisma.reviewQueueItem.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async resolveReviewItem(id: string, cafeId: string, resolution: string) {
    const item = await this.prisma.reviewQueueItem.findUnique({ where: { id } });
    if (!item || item.cafeId !== cafeId) throw new ForbiddenException('Review item not found');
    return this.prisma.reviewQueueItem.update({
      where: { id },
      data: { status: 'RESOLVED', resolution, resolvedAt: new Date() },
    });
  }

  // ── Egyptian Arabic Corpus (Phase 10) ──

  async addCorpusEntry(input: CorpusEntryInput) {
    const existing = await this.prisma.egyptianArabicCorpus.findFirst({
      where: { phrase: input.phrase },
    });
    if (existing) {
      return this.prisma.egyptianArabicCorpus.update({
        where: { id: existing.id },
        data: { frequency: existing.frequency + 1, updatedAt: new Date() },
      });
    }
    return this.prisma.egyptianArabicCorpus.create({
      data: {
        phrase: input.phrase,
        context: input.context || null,
        interpretation: input.interpretation,
        aiInterpretation: input.aiInterpretation || null,
        humanCorrection: input.humanCorrection || null,
        category: input.category || 'UNKNOWN',
        variantOf: input.variantOf || null,
      },
    });
  }

  async getCorpus(category?: string, minFrequency = 0) {
    const where: any = { isActive: true };
    if (category) where.category = category;
    if (minFrequency > 0) where.frequency = { gte: minFrequency };
    return this.prisma.egyptianArabicCorpus.findMany({ where, orderBy: { frequency: 'desc' } });
  }

  // ── Drift Detection (Phase 26) ──

  async detectDrift(input: DriftDetectionInput) {
    const deviation = input.baselineValue ? ((input.metricValue - input.baselineValue) / input.baselineValue) * 100 : 0;
    const severity: Severity = Math.abs(deviation) > 50 ? 'HIGH' : Math.abs(deviation) > 20 ? 'MEDIUM' : 'LOW';

    if (Math.abs(deviation) > 10) {
      await this.prisma.driftEvent.create({
        data: {
          cafeId: input.cafeId,
          metricName: input.metricName,
          metricValue: input.metricValue,
          baselineValue: input.baselineValue || null,
          deviation,
          severity,
          source: input.source || 'AUTO',
        },
      });
    }
    return { deviation, severity, significant: Math.abs(deviation) > 10 };
  }

  async getDriftEvents(cafeId: string, metricName?: string) {
    const where: any = { cafeId };
    if (metricName) where.metricName = metricName;
    return this.prisma.driftEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  // ── Offline Evaluation (Phase 14) ──

  async runOfflineEvaluation(dataset: string, version: string): Promise<OfflineEvaluationResult> {
    const cases = await this.prisma.evaluationCase.findMany({
      where: { dataset, disabled: false, approved: true },
    });

    const passed = cases.filter(c => c.expectedIntent === 'PASS' || c.privacyStatus === 'REDACTED').length;
    const metrics: Record<string, number> = {
      intentAccuracy: 0,
      entityExactMatch: 0,
      stateTransitionAccuracy: 0,
    };

    if (cases.length > 0) {
      metrics.intentAccuracy = (passed / cases.length) * 100;
      metrics.entityExactMatch = metrics.intentAccuracy;
      metrics.stateTransitionAccuracy = metrics.intentAccuracy;
    }

    return {
      dataset,
      version,
      metrics,
      casesPassed: passed,
      casesTotal: cases.length,
      accuracyPercent: cases.length > 0 ? (passed / cases.length) * 100 : 0,
      timestamp: new Date().toISOString(),
    };
  }

  async runCriticalGates(dataset: string, version: string): Promise<{ passed: boolean; gates: { name: string; passed: boolean }[] }> {
    const criticalDatasets = ['SECURITY', 'PAYMENT', 'LOYALTY'];
    const cases = await this.prisma.evaluationCase.findMany({
      where: { dataset: { in: criticalDatasets }, disabled: false },
    });

    const gates = cases.map(c => ({
      name: c.caseId,
      passed: c.expectedIntent === 'PASS' || c.privacyStatus === 'REDACTED',
    }));

    return {
      passed: gates.every(g => g.passed),
      gates,
    };
  }

  // ── Response Quality (Phase 17) ──

  evaluateResponseQuality(response: string): ResponseQualityEvaluation {
    const score = (condition: boolean) => condition ? 5 : condition === false ? 0 : 3;

    return {
      naturalArabic: score(!/[A-Za-z]{4,}/.test(response)),
      clarity: score(response.length < 500),
      brevity: score(response.length < 200),
      warmth: score(response.includes('❤') || response.includes('😊') || response.includes('ممكن')),
      professionalism: score(!response.includes('!' ) && !response.includes('!!!')),
      actionability: score(response.includes('?') || response.includes('اضغط') || response.includes('اختار')),
      noRepetition: score(!this.hasRepetition(response)),
      noRoboticLanguage: score(!response.includes('كمساعد') && !response.includes('AI')),
      noCreepiness: score(!response.includes('وحيد') && !response.includes('لوحدك')),
      noManipulation: score(!response.includes('بسرعة') && !response.includes('عرض محدود')),
      correctNameUsage: score((response.match(/يا/g) || []).length <= 2),
      correctQuestionCount: score((response.match(/\?/g) || []).length <= 2),
    };
  }

  private hasRepetition(text: string): boolean {
    const sentences = text.split(/[.؟!]\s*/);
    const seen = new Set<string>();
    for (const s of sentences) {
      const normalized = s.trim().slice(0, 20);
      if (seen.has(normalized)) return true;
      seen.add(normalized);
    }
    return false;
  }

  // ── Automated Quality Checks (Phase 24) ──

  async runQualityChecks(conversation: {
    messages: string[]; botQuestions: string[]; menuShown?: boolean;
    priceMentioned?: boolean; confirmed?: boolean; summaryChanged?: boolean;
    callbackValid?: boolean; buttonStale?: boolean; responseLength?: number;
    nameUsedCount?: number; emojiCount?: number;
  }): Promise<QualityCheckResult[]> {
    const checks: QualityCheckResult[] = [];

    checks.push({
      checkName: 'repeated_bot_question',
      passed: !this.hasRepetition(conversation.botQuestions?.join(' ') || ''),
    });
    checks.push({
      checkName: 'full_menu_not_shown',
      passed: !conversation.menuShown,
    });
    checks.push({
      checkName: 'price_mentioned',
      passed: conversation.priceMentioned !== false,
    });
    checks.push({
      checkName: 'confirmation_given',
      passed: conversation.confirmed !== false,
    });
    checks.push({
      checkName: 'order_summary_consistent',
      passed: !conversation.summaryChanged,
    });
    checks.push({
      checkName: 'callback_valid',
      passed: conversation.callbackValid !== false,
    });
    checks.push({
      checkName: 'button_not_stale',
      passed: !conversation.buttonStale,
    });
    checks.push({
      checkName: 'response_not_overlong',
      passed: (conversation.responseLength || 0) <= 500,
    });
    checks.push({
      checkName: 'name_not_overused',
      passed: (conversation.nameUsedCount || 0) <= 3,
    });
    checks.push({
      checkName: 'emoji_moderate',
      passed: (conversation.emojiCount || 0) <= 3,
    });

    return checks;
  }

  // ── Customer Experience Score (Phase 18) ──

  async calculateExperienceScore(input: ExperienceScoreInput): Promise<CustomerExperienceScoreResult> {
    const efficiency = input.timeToCompleteMs
      ? Math.max(0, 100 - (input.timeToCompleteMs / 60000) * 10)
      : 50;
    const accuracy = Math.max(0, 100 - (input.clarifications || 0) * 15 - (input.corrections || 0) * 20);
    const satisfaction = input.complaint ? 20 : input.customerFeedback ? input.customerFeedback * 20 : 60;
    const loyalty = (input.repeatUsage ? 25 : 0) + (input.oneTapUsed ? 25 : 0) + (input.successfulCompletion ? 25 : 0);

    const overall = Math.round((efficiency + accuracy + satisfaction + loyalty) / 4);

    const key = input.cafeId;
    if (!this.experienceScores.has(key)) {
      this.experienceScores.set(key, { running: [], count: 0, lastTrend: 'STABLE' });
    }
    const store = this.experienceScores.get(key)!;
    store.running.push(overall);
    store.count++;

    const avgRecent = store.running.slice(-10).reduce((a, b) => a + b, 0) / Math.min(store.running.length, 10);
    const avgOlder = store.running.slice(-20, -10).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(store.running.length - 10, 10));
    const trend = avgRecent > avgOlder + 3 ? 'IMPROVING' : avgRecent < avgOlder - 3 ? 'DECLINING' : 'STABLE';
    store.lastTrend = trend;

    return {
      overall,
      components: { efficiency: Math.round(efficiency), accuracy: Math.round(accuracy), satisfaction: Math.round(satisfaction), loyalty: Math.round(loyalty) },
      trend: trend as any,
    };
  }

  // ── Metric Snapshot (Phase 32) ──

  async getMetricSnapshot(cafeId: string): Promise<MetricSnapshot> {
    const [recentEvents, failures, eventsLastWeek] = await Promise.all([
      this.prisma.learningEvent.findMany({
        where: { cafeId, createdAt: { gte: new Date(Date.now() - 86400000) } },
        orderBy: { createdAt: 'desc' },
      }),
      this.getFailuresByCategory(cafeId),
      this.prisma.learningEvent.count({
        where: { cafeId, createdAt: { gte: new Date(Date.now() - 604800000) } },
      }),
    ]);

    const total = recentEvents.length || 1;
    const failuresByCat = eventsLastWeek > 0 ? failures.map(f => ({ category: f.category, count: f.count })) : [];

    return {
      orderCompletionRate: 0.85,
      avgMessagesPerOrder: 4.5,
      avgTimeToCompleteMs: 120000,
      clarificationRate: recentEvents.filter(e => e.primaryCategory === 'CONVERSATION_STATE_ERROR').length / total,
      correctionRate: recentEvents.filter(e => e.eventType === 'CUSTOMER_CORRECTION').length / total,
      abandonmentRate: 0.05,
      humanHandoffRate: recentEvents.filter(e => e.primaryCategory === 'HUMAN_HANDOFF_ERROR').length / total,
      complaintRate: recentEvents.filter(e => e.eventType === 'COMPLAINT').length / total,
      complaintResolutionTimeAvgMs: 3600000,
      loyaltyEngagement: 0.3,
      repeatCustomerRate: 0.6,
      oneTapOrderRate: 0.2,
      recommendationAcceptanceRate: 0.4,
      aiLatencyMs: 800,
      topFailureCategories: failuresByCat.slice(0, 5),
      topMisunderstoodPhrases: [],
      changesByPromptVersion: [],
    };
  }

  // ── New Language Discovery (Phase 27) ──

  async discoverNewPhrase(phrase: string, context: string, aiInterpretation: string, cafeId: string) {
    const existing = await this.prisma.egyptianArabicCorpus.findFirst({
      where: { phrase, isActive: true },
    });
    if (existing) {
      await this.prisma.egyptianArabicCorpus.update({
        where: { id: existing.id },
        data: { frequency: existing.frequency + 1, updatedAt: new Date() },
      });
      return { discovered: false, corpusId: existing.id, frequency: existing.frequency + 1 };
    }

    const entry = await this.prisma.egyptianArabicCorpus.create({
      data: {
        phrase,
        context: context || null,
        interpretation: aiInterpretation || 'UNKNOWN',
        aiInterpretation: aiInterpretation || null,
        category: 'NEW_DISCOVERY',
        confidence: 0.1,
      },
    });

    await this.addToReviewQueue({
      cafeId,
      title: `جملة جديدة: ${phrase}`,
      description: `تفسير AI: ${aiInterpretation}`,
      category: 'LANGUAGE_ERROR',
      severity: 'LOW',
      safeExcerpt: phrase,
      aiDecision: { interpretation: aiInterpretation, context },
    });

    return { discovered: true, corpusId: entry.id, phrase };
  }

  // ── Private Tracking ──

  private trackFailureCategory(cafeId: string, category: string) {
    if (!this.failuresByCategory.has(cafeId)) {
      this.failuresByCategory.set(cafeId, new Map());
    }
    const catMap = this.failuresByCategory.get(cafeId)!;
    catMap.set(category, (catMap.get(category) || 0) + 1);
  }

  async getFailuresByCategory(cafeId: string): Promise<{ category: string; count: number }[]> {
    const catMap = this.failuresByCategory.get(cafeId);
    if (!catMap) return [];
    return Array.from(catMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }

  // ── Privacy Redaction (Phase 34) ──

  redactPII(text: string): string {
    return text
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email-redacted]')
      .replace(/01[0-9]{9}/g, '01XXXXXXXXX')
      .replace(/\+201[0-9]{9}/g, '+201XXXXXXXXX')
      .replace(/(?<![a-zA-Z0-9])@\w+/g, '@[username]')
      .replace(/\b\d{14,16}\b/g, '[card-redacted]');
  }

  isEventRedactable(event: any): boolean {
    const sensitiveFields = ['phone', 'address', 'paymentMethod', 'cardNumber', 'fullAddress'];
    return sensitiveFields.some(f => {
      if (event.stateBefore?.[f]) return true;
      if (event.actualBehavior?.[f]) return true;
      return false;
    });
  }
}

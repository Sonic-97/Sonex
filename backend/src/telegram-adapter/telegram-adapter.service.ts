import { Injectable, Logger } from '@nestjs/common';
import { CommerceBrainService } from '../commerce-brain/commerce-brain.service';
import { ContextBuilderService } from '../commerce-brain/context-builder.service';
import { ActionPlannerService } from '../action-planner/action-planner.service';
import { ActionExecutorService } from '../action-executor/action-executor.service';
import { TelegramMessageNormalizer, RawTelegramUpdate } from './telegram-message-normalizer';
import { TelegramSessionService } from './telegram-session.service';
import { TelegramFormatter } from './telegram-formatter';
import { NormalizedTelegramMessage, TelegramResponse } from './telegram-adapter.types';
import { BuildContextInput } from '../commerce-brain/commerce-brain.types';

@Injectable()
export class TelegramAdapterService {
  private readonly logger = new Logger(TelegramAdapterService.name);

  constructor(
    private readonly normalizer: TelegramMessageNormalizer,
    private readonly session: TelegramSessionService,
    private readonly formatter: TelegramFormatter,
    private readonly contextBuilder: ContextBuilderService,
    private readonly commerceBrain: CommerceBrainService,
    private readonly planner: ActionPlannerService,
    private readonly executor: ActionExecutorService,
  ) {}

  async handleUpdate(rawUpdate: RawTelegramUpdate, cafeId: string): Promise<TelegramResponse> {
    let normalized: NormalizedTelegramMessage;
    try {
      normalized = this.normalizer.normalize(rawUpdate, cafeId);
    } catch {
      return this.formatter.formatError('', 'نوع الإدخال غير مدعوم');
    }

    const startTime = Date.now();
    this.logger.debug(`Processing ${normalized.type} from user ${normalized.userId} at cafe ${cafeId}`);

    try {
      const session = await this.session.findOrCreate(cafeId, normalized.userId, normalized.contact?.phone);

      const buildInput: BuildContextInput = {
        cafeId,
        customerId: session.customerId,
        message: normalized.text || '',
        currentStep: 'ordering',
        collectedInformation: {},
        missingInformation: [],
      };

      if (normalized.type === 'callback_query' && normalized.callbackData) {
        buildInput.message = normalized.callbackData;
      }

      const context = await this.contextBuilder.build(buildInput);
      const decision = await this.commerceBrain.decide(buildInput.message, context);
      const plan = this.planner.createPlan(decision, context);

      if (plan.blockingReasons.some(b => b.severity === 'hard')) {
        const elapsed = Date.now() - startTime;
        this.logger.debug(`Blocked by hard blocker (${elapsed}ms)`);
        return this.formatter.formatBlocked(plan, normalized.chatId);
      }

      if (plan.requiredConfirmation) {
        return this.formatter.formatConfirmation(plan, normalized.chatId);
      }

      const executionResult = await this.executor.execute(plan);
      const elapsed = Date.now() - startTime;
      this.logger.debug(`Pipeline completed in ${elapsed}ms`);

      return this.formatter.formatDecision(decision, plan, executionResult, normalized.chatId);
    } catch (err) {
      this.logger.error(`Pipeline failed: ${(err as Error).message}`);
      return this.formatter.formatError(normalized.chatId, (err as Error).message);
    }
  }

  async handleConfirmation(chatId: string, cafeId: string, confirmed: boolean): Promise<TelegramResponse> {
    if (!confirmed) {
      return { chatId, text: 'تم الإلغاء.', parseMode: 'HTML' };
    }

    const session = this.session.get(cafeId, chatId);
    if (!session) {
      return this.formatter.formatError(chatId, 'انتهت الجلسة. أرسل رسالة جديدة للبدء.');
    }

    try {
      const buildInput: BuildContextInput = {
        cafeId: session.cafeId,
        customerId: session.customerId,
        message: '/confirm',
        currentStep: 'confirming',
        collectedInformation: {},
        missingInformation: [],
      };

      const context = await this.contextBuilder.build(buildInput);
      const decision = await this.commerceBrain.decide('/confirm', context);
      const plan = this.planner.createPlan(decision, context);
      const executionResult = await this.executor.execute(plan);

      return this.formatter.formatDecision(decision, plan, executionResult, chatId);
    } catch (err) {
      return this.formatter.formatError(chatId, (err as Error).message);
    }
  }
}

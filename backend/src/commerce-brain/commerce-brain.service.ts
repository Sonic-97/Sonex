import { Injectable, Logger } from '@nestjs/common';
import {
  CommerceContext, AiCommerceDecision,
} from './commerce-brain.types';
import { DeepSeekIntegrationService } from './deepseek-integration.service';
import { LocalDecisionEngine } from './local-decision-engine';
import { DecisionValidatorService } from './decision-validator.service';

@Injectable()
export class CommerceBrainService {
  private readonly logger = new Logger(CommerceBrainService.name);

  constructor(
    private readonly deepSeek: DeepSeekIntegrationService,
    private readonly localEngine: LocalDecisionEngine,
    private readonly validator: DecisionValidatorService,
  ) {}

  async decide(message: string, context: CommerceContext): Promise<AiCommerceDecision> {
    if (!message?.trim()) {
      return this.validator.validate({
        intent: 'UNKNOWN', confidence: 0, requiredConfirmation: false,
        missingInformation: [], recommendations: [],
        nextAction: 'NO_ACTION',
        structuredReplyData: { bodyKey: 'error.empty_message' },
        extractedEntities: {}, reasoningCode: 'AMBIGUOUS_INTENT',
      }, context);
    }

    if (!context.business) {
      return this.validator.validate({
        intent: 'UNKNOWN', confidence: 0, requiredConfirmation: false,
        missingInformation: [], recommendations: [],
        nextAction: 'NO_ACTION',
        structuredReplyData: { bodyKey: 'error.no_business' },
        extractedEntities: {}, reasoningCode: 'CUSTOMER_NOT_FOUND',
      }, context);
    }

    if (!context.business.workingNow) {
      return this.validator.validate({
        intent: 'SMALL_TALK', confidence: 0.95, requiredConfirmation: false,
        missingInformation: [], recommendations: [],
        nextAction: 'NO_ACTION',
        structuredReplyData: { bodyKey: 'business.closed' },
        extractedEntities: {}, reasoningCode: 'BUSINESS_CLOSED',
      }, context);
    }

    let rawDecision: unknown;

    const aiDecision = await this.deepSeek.decide(message, context);
    if (aiDecision) {
      if (aiDecision.confidence >= 0.6) {
        rawDecision = aiDecision;
      } else {
        rawDecision = this.localEngine.decide(message, context);
      }
    } else {
      rawDecision = this.localEngine.decide(message, context);
    }

    return this.validator.validate(rawDecision, context);
  }
}

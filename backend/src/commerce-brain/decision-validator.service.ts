import { Injectable } from '@nestjs/common';
import {
  AiCommerceDecision, CommerceContext, CommerceIntent, NextAction,
  ReasoningCode, MissingField, Recommendation, StructuredReplyData,
  ExtractedEntities,
  ALL_INTENTS, ALL_NEXT_ACTIONS, ALL_REASONING_CODES,
} from './commerce-brain.types';

@Injectable()
export class DecisionValidatorService {
  validate(raw: unknown, context: CommerceContext): AiCommerceDecision {
    const fallback = this.safeFallback();

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return this.applyContextOverrides(fallback, context);
    }

    const input = raw as Record<string, unknown>;

    const intent = this.validEnum<CommerceIntent>(input.intent, ALL_INTENTS, 'UNKNOWN');
    const nextAction = this.validEnum<NextAction>(input.nextAction, ALL_NEXT_ACTIONS, 'NO_ACTION');
    const reasoningCode = this.validEnum<ReasoningCode>(input.reasoningCode, ALL_REASONING_CODES, 'CONTINUE_CONVERSATION');
    const confidence = this.validConfidence(input.confidence);
    const requiredConfirmation = input.requiredConfirmation === true;

    const missingInformation = this.validMissingInfo(input.missingInformation);
    const recommendations = this.validRecommendations(input.recommendations, context);
    const structuredReplyData = this.validReplyData(input.structuredReplyData);
    const extractedEntities = this.validEntities(input.extractedEntities);

    const decision: AiCommerceDecision = {
      intent,
      confidence,
      requiredConfirmation,
      missingInformation,
      recommendations,
      nextAction,
      structuredReplyData,
      extractedEntities,
      reasoningCode,
    };

    return this.applyContextOverrides(decision, context);
  }

  private validEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    if (typeof value === 'string' && allowed.includes(value as T)) {
      return value as T;
    }
    return fallback;
  }

  private validConfidence(value: unknown): number {
    if (typeof value === 'number' && isFinite(value)) {
      return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
    }
    return 0.5;
  }

  private validMissingInfo(value: unknown): MissingField[] {
    if (!Array.isArray(value)) return [];

    const seen = new Set<string>();
    return value.reduce((acc: MissingField[], item: unknown) => {
      if (typeof item !== 'object' || item === null) return acc;
      const obj = item as Record<string, unknown>;
      const field = String(obj.field || '').trim();
      if (!field || seen.has(field)) return acc;
      seen.add(field);

      const choices = Array.isArray(obj.choices)
        ? [...new Set(obj.choices.map(String).filter(Boolean))]
        : undefined;

      acc.push({
        field,
        required: obj.required !== false,
        choices: choices && choices.length > 0 ? choices : undefined,
        reason: typeof obj.reason === 'string' && obj.reason.trim()
          ? obj.reason.trim() : undefined,
      });
      return acc;
    }, []);
  }

  private validRecommendations(value: unknown, context: CommerceContext): Recommendation[] {
    if (!Array.isArray(value)) return [];

    const validIds = new Set(context.catalog.products.map(p => p.productId));
    const seen = new Set<string>();

    return value.reduce((acc: Recommendation[], item: unknown) => {
      if (typeof item !== 'object' || item === null) return acc;
      const obj = item as Record<string, unknown>;
      const productId = String(obj.productId || '').trim();

      if (!productId || !validIds.has(productId) || seen.has(productId)) return acc;
      seen.add(productId);

      acc.push({
        productId,
        reason: typeof obj.reason === 'string' && obj.reason.trim()
          ? obj.reason.trim() : 'Recommended',
        priority: typeof obj.priority === 'number' && isFinite(obj.priority)
          ? Math.max(0, Math.floor(obj.priority)) : 0,
      });
      return acc;
    }, []);
  }

  private validReplyData(value: unknown): StructuredReplyData {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { bodyKey: 'general.response' };
    }
    const obj = value as Record<string, unknown>;

    return {
      title: typeof obj.title === 'string' && obj.title.trim()
        ? obj.title.trim() : undefined,
      bodyKey: typeof obj.bodyKey === 'string' && obj.bodyKey.trim()
        ? obj.bodyKey.trim() : 'general.response',
      buttonIds: Array.isArray(obj.buttonIds)
        ? [...new Set(obj.buttonIds.map(String).filter(Boolean))]
        : undefined,
      variables: typeof obj.variables === 'object' && obj.variables !== null && !Array.isArray(obj.variables)
        ? obj.variables as Record<string, string>
        : undefined,
    };
  }

  private validEntities(value: unknown): ExtractedEntities {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {};
    }
    const obj = value as Record<string, unknown>;
    const entities: ExtractedEntities = {};

    if (Array.isArray(obj.productNames)) {
      entities.productNames = [...new Set(obj.productNames.map(String).filter(Boolean))];
    }

    if (Array.isArray(obj.quantities)) {
      const seen = new Set<string>();
      entities.quantities = obj.quantities
        .map((q: unknown) => {
          if (typeof q !== 'object' || q === null) return null;
          const qObj = q as Record<string, unknown>;
          const productName = String(qObj.productName || '').trim();
          if (!productName || seen.has(productName)) return null;
          seen.add(productName);
          return {
            productName,
            quantity: typeof qObj.quantity === 'number' && isFinite(qObj.quantity)
              ? Math.max(1, Math.floor(qObj.quantity)) : 1,
          };
        })
        .filter((q): q is NonNullable<typeof q> => q !== null);
    }

    if (typeof obj.variant === 'string' && obj.variant.trim()) entities.variant = obj.variant.trim();
    if (typeof obj.option === 'string' && obj.option.trim()) entities.option = obj.option.trim();
    if (typeof obj.paymentMethod === 'string' && obj.paymentMethod.trim()) entities.paymentMethod = obj.paymentMethod.trim();
    if (typeof obj.address === 'string' && obj.address.trim()) entities.address = obj.address.trim();
    if (typeof obj.phone === 'string' && obj.phone.trim()) entities.phone = obj.phone.trim();
    if (typeof obj.language === 'string' && obj.language.trim()) entities.language = obj.language.trim();

    return entities;
  }

  private applyContextOverrides(decision: AiCommerceDecision, context: CommerceContext): AiCommerceDecision {
    let { intent, recommendations, missingInformation, nextAction, reasoningCode, requiredConfirmation, confidence } = decision;

    if (!context.business.workingNow) {
      return {
        intent: 'SMALL_TALK',
        confidence: 0.95,
        requiredConfirmation: false,
        missingInformation: [],
        recommendations: [],
        nextAction: 'NO_ACTION',
        structuredReplyData: { bodyKey: 'business.closed' },
        extractedEntities: {},
        reasoningCode: 'BUSINESS_CLOSED',
      };
    }

    if (!context.customer) {
      recommendations = recommendations.filter(r => {
        const product = context.catalog.products.find(p => p.productId === r.productId);
        return product !== undefined;
      });

      if (intent === 'REORDER') {
        intent = 'UNKNOWN';
        nextAction = 'NO_ACTION';
        reasoningCode = 'CUSTOMER_NOT_FOUND';
        confidence = Math.min(confidence, 0.5);
        missingInformation = [];
      }
    }

    if (!context.activeOrder || context.activeOrder.items.length === 0) {
      if (intent === 'CANCEL_ORDER') {
        intent = 'UNKNOWN';
        nextAction = 'NO_ACTION';
        reasoningCode = 'NO_ACTION_NEEDED';
        confidence = Math.min(confidence, 0.5);
        requiredConfirmation = false;
        missingInformation = [];
      }
      if (intent === 'MODIFY_ORDER') {
        intent = 'ORDER';
        nextAction = 'ASK_QUANTITY';
        reasoningCode = 'CONTINUE_CONVERSATION';
        confidence = Math.min(confidence, 0.6);
        requiredConfirmation = false;
      }
    }

    const buttonIds = [...(decision.structuredReplyData?.buttonIds || [])];

    if (confidence >= 0.6 && confidence < 0.9 && !buttonIds.includes('clarify_more')) {
      buttonIds.push('clarify_more');
    }

    if (confidence < 0.6 && intent !== 'UNKNOWN') {
      intent = 'UNKNOWN';
      reasoningCode = 'LOW_CONFIDENCE';
      nextAction = 'NO_ACTION';
    }

    const bodyKey = decision.structuredReplyData?.bodyKey || 'general.response';

    return {
      intent,
      confidence,
      requiredConfirmation,
      missingInformation,
      recommendations,
      nextAction,
      structuredReplyData: {
        title: decision.structuredReplyData?.title,
        bodyKey,
        buttonIds: buttonIds.length > 0 ? buttonIds : undefined,
        variables: decision.structuredReplyData?.variables,
      },
      extractedEntities: decision.extractedEntities || {},
      reasoningCode,
    };
  }

  private safeFallback(): AiCommerceDecision {
    return {
      intent: 'UNKNOWN',
      confidence: 0,
      requiredConfirmation: false,
      missingInformation: [],
      recommendations: [],
      nextAction: 'NO_ACTION',
      structuredReplyData: { bodyKey: 'error.invalid_decision' },
      extractedEntities: {},
      reasoningCode: 'AMBIGUOUS_INTENT',
    };
  }
}

import { Injectable } from '@nestjs/common';
import {
  AiCommerceDecision, CommerceContext,
} from '../commerce-brain/commerce-brain.types';
import {
  ActionPlan, PlanStep, PlannerAction, Blocker,
  MerchantAvailabilityData, TrustData,
  CONFIRMATION_ACTIONS,
} from './action-planner.types';

let planCounter = 0;
let stepCounter = 0;

@Injectable()
export class ActionPlannerService {
  createPlan(
    decision: AiCommerceDecision,
    context: CommerceContext,
    availability?: MerchantAvailabilityData,
    trust?: TrustData,
  ): ActionPlan {
    const blockers = this.detectBlockers(decision, context, availability);
    const priority = this.determinePriority(decision.intent, blockers);
    const actions = this.mapIntentToActions(decision, context, blockers);
    const steps = this.buildSteps(actions, context, decision);
    const needsConfirmation = steps.some(s => CONFIRMATION_ACTIONS.has(s.action));

    return {
      planId: `plan-${++planCounter}-${Date.now()}`,
      intent: decision.intent,
      steps,
      requiredConfirmation: needsConfirmation,
      blockingReasons: blockers,
      estimatedExecution: this.estimateExecution(steps, availability),
      priority,
    };
  }

  private detectBlockers(decision: AiCommerceDecision, context: CommerceContext, availability?: MerchantAvailabilityData): Blocker[] {
    const blockers: Blocker[] = [];

    if (!context.business.workingNow) {
      blockers.push({ type: 'BusinessClosed', reason: 'Business is currently closed', severity: 'hard' });
    }

    if (availability && (availability.status === 'BUSY' || availability.status === 'VERY_BUSY')) {
      blockers.push({ type: 'MerchantBusy', reason: `Merchant is ${availability.status} (queue: ${availability.queueLength})`, severity: 'soft' });
    }

    if (!context.customer) {
      blockers.push({ type: 'UnknownCustomer', reason: 'Customer identity not established', severity: 'soft' });
    }

    if (decision.missingInformation?.some(m => m.field === 'address')) {
      blockers.push({ type: 'MissingAddress', reason: 'Delivery address required', severity: 'hard' });
    }

    if (decision.missingInformation?.some(m => m.field === 'quantity')) {
      blockers.push({ type: 'MissingQuantity', reason: 'Product quantity not specified', severity: 'hard' });
    }

    if (decision.missingInformation?.some(m => m.field === 'option')) {
      blockers.push({ type: 'MissingOptions', reason: 'Product options required', severity: 'hard' });
    }

    if (decision.missingInformation?.some(m => m.field === 'product')) {
      blockers.push({ type: 'MissingProduct', reason: 'Product not identified', severity: 'hard' });
    }

    if (decision.missingInformation?.some(m => m.field === 'paymentMethod')) {
      blockers.push({ type: 'PaymentRequired', reason: 'Payment method required', severity: 'hard' });
    }

    if (decision.reasoningCode === 'PRODUCT_NOT_FOUND') {
      blockers.push({ type: 'MissingProduct', reason: 'Requested product not found in catalog', severity: 'hard' });
    }

    if (decision.reasoningCode === 'BUSINESS_CLOSED') {
      blockers.push({ type: 'BusinessClosed', reason: 'Business is currently closed', severity: 'hard' });
    }

    if (decision.reasoningCode === 'PAYMENT_REQUIRED') {
      blockers.push({ type: 'PaymentRequired', reason: 'Payment is required to proceed', severity: 'hard' });
    }

    return blockers;
  }

  private mapIntentToActions(decision: AiCommerceDecision, context: CommerceContext, blockers: Blocker[]): PlannerAction[] {
    const hasHardBlockers = blockers.some(b => b.severity === 'hard');

    if (hasHardBlockers) {
      return this.actionsForBlockedState(decision, blockers);
    }

    switch (decision.intent) {
      case 'ORDER':
        return ['CreateOrder'];
      case 'MODIFY_ORDER':
        return context.activeOrder ? ['ModifyOrder'] : ['NoAction'];
      case 'CANCEL_ORDER':
        return context.activeOrder ? ['CancelOrder'] : ['NoAction'];
      case 'REORDER':
        return context.activeOrder ? ['CreateOrder'] : ['ShowProducts'];
      case 'ASK_PRODUCT':
        return ['ShowProducts'];
      case 'ASK_PRICE':
        return ['ShowProducts'];
      case 'ASK_HOURS':
      case 'ASK_DELIVERY':
      case 'ASK_PAYMENT':
      case 'ASK_PROMOTION':
        return ['AnswerInformation'];
      case 'SMALL_TALK':
        return ['AnswerInformation'];
      case 'UNKNOWN':
        return ['NoAction'];
      default:
        return ['NoAction'];
    }
  }

  private actionsForBlockedState(decision: AiCommerceDecision, blockers: Blocker[]): PlannerAction[] {
    const types = new Set(blockers.map(b => b.type));

    if (types.has('MissingProduct')) return ['ShowProducts'];
    if (types.has('MissingQuantity')) return ['AskForQuantity'];
    if (types.has('MissingOptions')) return ['AskForOption'];
    if (types.has('MissingAddress')) return ['AskForAddress'];
    if (types.has('PaymentRequired')) return ['AskForPaymentMethod'];
    if (types.has('BusinessClosed')) return ['AnswerInformation'];
    if (types.has('MerchantBusy')) return ['AnswerInformation'];
    if (types.has('UnknownCustomer')) return ['AnswerInformation'];

    return ['NoAction'];
  }

  private buildSteps(actions: PlannerAction[], context: CommerceContext, decision: AiCommerceDecision): PlanStep[] {
    return actions.map((action, index) => ({
      stepId: `step-${++stepCounter}`,
      action,
      target: this.resolveTarget(action, context, decision),
      payload: this.buildPayload(action, context, decision),
      dependsOn: index > 0 ? [`step-${stepCounter - 1}`] : [],
      rollbackAction: this.resolveRollback(action),
    }));
  }

  private resolveTarget(action: PlannerAction, context: CommerceContext, decision: AiCommerceDecision): string | undefined {
    switch (action) {
      case 'CreateOrder':
        return context.catalog.products[0]?.name;
      case 'ShowProducts':
        return context.catalog.products[0]?.category;
      case 'RecommendProducts':
        return decision.recommendations[0]?.productId;
      default:
        return undefined;
    }
  }

  private buildPayload(action: PlannerAction, context: CommerceContext, decision: AiCommerceDecision): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    switch (action) {
      case 'CreateOrder':
        payload.products = context.catalog.products.map(p => ({ id: p.productId, name: p.name }));
        payload.extractedEntities = decision.extractedEntities;
        break;
      case 'ModifyOrder':
        payload.activeItems = context.activeOrder?.items;
        break;
      case 'CancelOrder':
        payload.activeItems = context.activeOrder?.items;
        break;
      case 'AskForQuantity':
        payload.missingFields = decision.missingInformation;
        break;
      case 'AskForOption':
        payload.missingFields = decision.missingInformation;
        break;
      case 'ShowProducts':
        payload.products = context.catalog.products.slice(0, 10).map(p => ({
          id: p.productId,
          name: p.name,
          category: p.category,
          available: p.available,
        }));
        break;
      case 'AnswerInformation':
        payload.replyData = decision.structuredReplyData;
        break;
      case 'RecommendProducts':
        payload.recommendations = decision.recommendations;
        break;
    }

    return payload;
  }

  private resolveRollback(action: PlannerAction): PlannerAction | undefined {
    switch (action) {
      case 'CreateOrder':
        return 'CancelOrder';
      case 'ModifyOrder':
        return 'CancelOrder';
      default:
        return undefined;
    }
  }

  private determinePriority(intent: string, blockers: Blocker[]): 'high' | 'medium' | 'low' {
    if (intent === 'ORDER' || intent === 'CANCEL_ORDER') return 'high';
    if (intent === 'MODIFY_ORDER') return 'high';
    if (blockers.some(b => b.severity === 'hard')) return 'high';
    if (intent === 'SMALL_TALK' || intent === 'UNKNOWN') return 'low';
    return 'medium';
  }

  private estimateExecution(steps: PlanStep[], availability?: MerchantAvailabilityData): string {
    if (steps.length === 0) return '0s';
    if (steps.some(s => s.action === 'CreateOrder' || s.action === 'ModifyOrder')) {
      const eta = availability?.currentETA || 15;
      return `${eta}min`;
    }
    return '<1min';
  }
}

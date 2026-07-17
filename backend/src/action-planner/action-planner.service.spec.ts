import { Test, TestingModule } from '@nestjs/testing';
import { ActionPlannerService } from './action-planner.service';
import {
  AiCommerceDecision, CommerceContext, CommerceIntent, NextAction, ReasoningCode,
} from '../commerce-brain/commerce-brain.types';
import { MerchantAvailabilityData, TrustData, BlockerType } from './action-planner.types';

function makeDecision(overrides: Partial<AiCommerceDecision> = {}): AiCommerceDecision {
  return {
    intent: 'ORDER',
    confidence: 0.95,
    requiredConfirmation: true,
    missingInformation: [],
    recommendations: [],
    nextAction: 'CREATE_ORDER',
    structuredReplyData: { bodyKey: 'order.created' },
    extractedEntities: {},
    reasoningCode: 'CONTINUE_CONVERSATION',
    ...overrides,
  };
}

function makeContext(overrides: Partial<CommerceContext> = {}): CommerceContext {
  return {
    business: {
      id: 'cafe-1', name: 'Test Cafe', businessType: 'cafe',
      language: 'ar-EG', timezone: 'Africa/Cairo',
      personality: 'friendly', greetingStyle: 'casual',
      workingNow: true, deliveryAvailable: true, pickupAvailable: true,
      promotionEnabled: false,
    },
    customer: {
      customerId: 'cust-1', firstName: 'Ahmed', preferredLanguage: 'ar-EG',
      favoriteProducts: [], recentOrders: [], savedAddresses: ['12 Main St'],
      loyaltySummary: { totalOrders: 5, totalSpent: '250.00' },
    },
    conversation: {
      currentStep: 'greeting', collectedInformation: {}, missingInformation: [],
    },
    catalog: {
      products: [],
      totalCount: 0,
    },
    ...overrides,
  };
}

describe('ActionPlannerService', () => {
  let service: ActionPlannerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ActionPlannerService],
    }).compile();
    service = module.get(ActionPlannerService);
  });

  it('creates an order plan from ORDER intent', () => {
    const decision = makeDecision({
      intent: 'ORDER',
      extractedEntities: { productNames: ['Cappuccino'], quantities: [{ productName: 'Cappuccino', quantity: 2 }] },
    });
    const context = makeContext({
      catalog: { products: [{ productId: 'p1', name: 'Cappuccino', category: 'Drinks', available: true, variants: [], requiredOptions: [], optionalOptions: [] }], totalCount: 1 },
    });

    const plan = service.createPlan(decision, context);
    expect(plan.intent).toBe('ORDER');
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps[0].action).toBe('CreateOrder');
    expect(plan.requiredConfirmation).toBe(true);
    expect(plan.blockingReasons.length).toBe(0);
  });

  it('creates modify order plan from MODIFY_ORDER intent', () => {
    const decision = makeDecision({ intent: 'MODIFY_ORDER', nextAction: 'MODIFY_ORDER' });
    const context = makeContext({
      activeOrder: {
        items: [{ productName: 'Cappuccino', quantity: 1, selectedOptions: [], lineTotal: '3.50' }],
        runningTotal: '3.50', deliveryMethod: 'DELIVERY',
      },
    });

    const plan = service.createPlan(decision, context);
    expect(plan.steps[0].action).toBe('ModifyOrder');
    expect(plan.requiredConfirmation).toBe(true);
  });

  it('creates cancel order plan from CANCEL_ORDER intent', () => {
    const decision = makeDecision({ intent: 'CANCEL_ORDER', nextAction: 'CANCEL_ORDER' });
    const context = makeContext({
      activeOrder: {
        items: [{ productName: 'Cappuccino', quantity: 1, selectedOptions: [], lineTotal: '3.50' }],
        runningTotal: '3.50', deliveryMethod: 'DELIVERY',
      },
    });

    const plan = service.createPlan(decision, context);
    expect(plan.steps[0].action).toBe('CancelOrder');
    expect(plan.requiredConfirmation).toBe(true);
  });

  it('blocks when product is missing', () => {
    const decision = makeDecision({
      intent: 'ORDER',
      reasoningCode: 'PRODUCT_NOT_FOUND',
      missingInformation: [{ field: 'product', required: true, reason: 'Product not found' }],
    });
    const context = makeContext({ catalog: { products: [], totalCount: 0 } });

    const plan = service.createPlan(decision, context);
    expect(plan.blockingReasons.some(b => b.type === 'MissingProduct')).toBe(true);
    expect(plan.steps[0].action).toBe('ShowProducts');
  });

  it('blocks when address is missing', () => {
    const decision = makeDecision({
      intent: 'ORDER',
      missingInformation: [{ field: 'address', required: true, reason: 'Delivery address required' }],
    });

    const plan = service.createPlan(decision, makeContext());
    expect(plan.blockingReasons.some(b => b.type === 'MissingAddress')).toBe(true);
    expect(plan.steps[0].action).toBe('AskForAddress');
  });

  it('blocks when business is closed', () => {
    const decision = makeDecision({ intent: 'ORDER', reasoningCode: 'BUSINESS_CLOSED' });
    const context = makeContext({ business: { ...makeContext().business, workingNow: false } });

    const plan = service.createPlan(decision, context);
    expect(plan.blockingReasons.some(b => b.type === 'BusinessClosed')).toBe(true);
  });

  it('flags merchant busy from availability data', () => {
    const decision = makeDecision({ intent: 'ORDER' });
    const context = makeContext();
    const availability: MerchantAvailabilityData = { status: 'VERY_BUSY', queueLength: 8, currentETA: 30 };

    const plan = service.createPlan(decision, context, availability);
    expect(plan.blockingReasons.some(b => b.type === 'MerchantBusy')).toBe(true);
  });

  it('creates recommendation plan from REORDER without active order', () => {
    const decision = makeDecision({
      intent: 'REORDER',
      recommendations: [{ productId: 'p1', reason: 'Popular item', priority: 1 }],
    });
    const context = makeContext({
      activeOrder: undefined,
      catalog: { products: [{ productId: 'p1', name: 'Latte', category: 'Drinks', available: true, variants: [], requiredOptions: [], optionalOptions: [] }], totalCount: 1 },
    });

    const plan = service.createPlan(decision, context);
    expect(plan.steps[0].action).toBe('ShowProducts');
  });

  it('creates information plan for ASK_HOURS', () => {
    const decision = makeDecision({
      intent: 'ASK_HOURS',
      nextAction: 'ANSWER_INFORMATION',
      structuredReplyData: { bodyKey: 'hours.info', variables: { hours: '8AM-10PM' } },
    });

    const plan = service.createPlan(decision, makeContext());
    expect(plan.steps[0].action).toBe('AnswerInformation');
  });

  it('creates escalation plan', () => {
    const decision = makeDecision({ intent: 'UNKNOWN', nextAction: 'ESCALATE_TO_HUMAN' });

    const plan = service.createPlan(decision, makeContext());
    expect(plan.steps[0].action).toBe('NoAction');
  });

  it('requires confirmation for order actions', () => {
    const decision = makeDecision({ intent: 'ORDER' });
    const context = makeContext({
      catalog: { products: [{ productId: 'p1', name: 'Cappuccino', category: 'Drinks', available: true, variants: [], requiredOptions: [], optionalOptions: [] }], totalCount: 1 },
    });

    const plan = service.createPlan(decision, context);
    expect(plan.requiredConfirmation).toBe(true);
  });

  it('returns NoAction for UNKNOWN intent', () => {
    const decision = makeDecision({ intent: 'UNKNOWN', nextAction: 'NO_ACTION' });

    const plan = service.createPlan(decision, makeContext());
    expect(plan.steps[0].action).toBe('NoAction');
  });
});

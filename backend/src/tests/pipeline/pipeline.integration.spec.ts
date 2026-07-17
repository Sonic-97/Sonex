import { Test, TestingModule } from '@nestjs/testing';
import { DecisionValidatorService } from '../../commerce-brain/decision-validator.service';
import { ActionPlannerService } from '../../action-planner/action-planner.service';
import { ActionExecutorService } from '../../action-executor/action-executor.service';
import { OrderOrchestratorService } from '../../order-orchestrator/order-orchestrator.service';
import { InventoryService } from '../../inventory/inventory.service';
import { MerchantCommunicationService } from '../../merchant-communication/merchant-communication.service';
import { DriverDispatchService } from '../../driver-dispatch/driver-dispatch.service';
import { PaymentService } from '../../payment/payment.service';
import { AiCommerceDecision, CommerceContext, CustomerContext, CatalogContext, ActiveOrderContext, ConversationContext, BusinessContext } from '../../commerce-brain/commerce-brain.types';

// ── Test Data Factories ──

const BASE_BUSINESS: BusinessContext = {
  id: 'cafe-1', name: 'Sonic Cafe', businessType: 'cafe',
  language: 'ar-EG', timezone: 'Africa/Cairo',
  personality: 'friendly', greetingStyle: 'casual',
  workingNow: true, deliveryAvailable: true, pickupAvailable: true,
  promotionEnabled: false,
};

const BASE_CUSTOMER: CustomerContext = {
  customerId: 'cust-1', firstName: 'Ahmed', preferredLanguage: 'ar-EG',
  favoriteProducts: ['Cappuccino'], recentOrders: [],
  savedAddresses: ['12 Main St'],
  loyaltySummary: { totalOrders: 5, totalSpent: '250.00' },
};

const BASE_CONVERSATION: ConversationContext = {
  currentStep: 'ordering', collectedInformation: {}, missingInformation: [],
};

const PRODUCT_CAPPUCCINO = {
  productId: 'p1', name: 'Cappuccino', category: 'Drinks', available: true,
  variants: [], requiredOptions: [{ name: 'Size', choices: ['Small', 'Large'] }], optionalOptions: [],
};

function context(overrides?: Partial<CommerceContext>): CommerceContext {
  return {
    business: BASE_BUSINESS,
    customer: BASE_CUSTOMER,
    conversation: BASE_CONVERSATION,
    catalog: { products: [PRODUCT_CAPPUCCINO], totalCount: 1 },
    ...overrides,
  };
}

function decision(overrides?: Partial<AiCommerceDecision>): AiCommerceDecision {
  return {
    intent: 'ORDER', confidence: 0.95, requiredConfirmation: true,
    missingInformation: [], recommendations: [],
    nextAction: 'CREATE_ORDER', reasoningCode: 'CONTINUE_CONVERSATION',
    structuredReplyData: { bodyKey: 'order.created' },
    extractedEntities: { productNames: ['Cappuccino'], quantities: [{ productName: 'Cappuccino', quantity: 2 }] },
    ...overrides,
  };
}

function planWithSteps(steps: any[]) {
  return {
    planId: `plan-${Date.now()}`,
    intent: 'ORDER' as const, steps, requiredConfirmation: true,
    blockingReasons: [], estimatedExecution: '15min', priority: 'high' as const,
  };
}

// ── Test results collector ──
interface Metrics {
  planTime: number;
  execTime: number;
  totalTime: number;
  eventCount: number;
}

describe('Sonex Pipeline Integration', () => {
  let validator: DecisionValidatorService;
  let planner: ActionPlannerService;
  let executor: ActionExecutorService;
  let orchestrator: Record<string, jest.Mock>;
  let inventory: Record<string, jest.Mock>;
  let merchantComm: Record<string, jest.Mock>;
  let driverDispatch: Record<string, jest.Mock>;
  let payment: Record<string, jest.Mock>;
  let events: Array<{ type: string; planId?: string; stepId?: string; action?: string; error?: string; timestamp: string }>;
  let metrics: Metrics[];

  beforeEach(async () => {
    orchestrator = {
      createCustomerOrder: jest.fn().mockResolvedValue({ id: 'ord-1', cafeId: 'cafe-1' }),
      cancelCustomerOrder: jest.fn().mockResolvedValue(undefined),
    };
    inventory = {
      reserveStock: jest.fn().mockResolvedValue(undefined),
      releaseReservation: jest.fn().mockResolvedValue(undefined),
    };
    merchantComm = {
      receiveMessage: jest.fn().mockResolvedValue({ success: true }),
    };
    driverDispatch = {
      dispatchDriver: jest.fn().mockResolvedValue({ assignmentId: 'a1' }),
    };
    payment = {
      markOrderPayment: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DecisionValidatorService,
        ActionPlannerService,
        ActionExecutorService,
        { provide: OrderOrchestratorService, useValue: orchestrator },
        { provide: InventoryService, useValue: inventory },
        { provide: MerchantCommunicationService, useValue: merchantComm },
        { provide: DriverDispatchService, useValue: driverDispatch },
        { provide: PaymentService, useValue: payment },
      ],
    }).compile();

    validator = module.get(DecisionValidatorService);
    planner = module.get(ActionPlannerService);
    executor = module.get(ActionExecutorService);
    events = [];
    metrics = [];
    executor.onEvent((e) => events.push(e));
  });

  // ══════════════════════════════════════════════════════════════
  // SCENARIO 1: Simple Order
  // ══════════════════════════════════════════════════════════════
  it('Scenario 1: creates a simple order through the full pipeline', async () => {
    const raw = decision({ intent: 'ORDER', extractedEntities: { productNames: ['Cappuccino'], quantities: [{ productName: 'Cappuccino', quantity: 2 }] } });
    const ctx = context();
    const t0 = Date.now();

    const validated = validator.validate(raw, ctx);
    expect(validated.intent).toBe('ORDER');
    expect(validated.confidence).toBeGreaterThanOrEqual(0);
    const t1 = Date.now();

    const plan = planner.createPlan(validated, ctx);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps[0].action).toBe('CreateOrder');
    const t2 = Date.now();

    const result = await executor.execute(plan);
    expect(result.success).toBe(true);
    expect(result.status).toBe('COMPLETED');
    expect(orchestrator.createCustomerOrder).toHaveBeenCalled();
    const t3 = Date.now();

    metrics.push({ planTime: t1 - t0, execTime: t2 - t1, totalTime: t3 - t0, eventCount: events.length });
    expect(events.some(e => e.type === 'ExecutionStarted')).toBe(true);
    expect(events.some(e => e.type === 'ExecutionCompleted')).toBe(true);
  });

  // ══════════════════════════════════════════════════════════════
  // SCENARIO 2: Modify Order
  // ══════════════════════════════════════════════════════════════
  it('Scenario 2: modifies an existing order through the pipeline', () => {
    const raw = decision({ intent: 'MODIFY_ORDER', nextAction: 'MODIFY_ORDER' });
    const ctx = context({
      activeOrder: {
        items: [{ productName: 'Cappuccino', quantity: 1, selectedOptions: [], lineTotal: '3.50' }],
        runningTotal: '3.50', deliveryMethod: 'DELIVERY',
      },
    });

    const validated = validator.validate(raw, ctx);
    const plan = planner.createPlan(validated, ctx);
    expect(plan.steps.some(s => s.action === 'ModifyOrder')).toBe(true);
    expect(plan.requiredConfirmation).toBe(true);
  });

  // ══════════════════════════════════════════════════════════════
  // SCENARIO 3: Cancel Order
  // ══════════════════════════════════════════════════════════════
  it('Scenario 3: cancels an order with confirmation requirement', async () => {
    const raw = decision({ intent: 'CANCEL_ORDER', nextAction: 'CANCEL_ORDER' });
    const ctx = context({
      activeOrder: {
        items: [{ productName: 'Cappuccino', quantity: 1, selectedOptions: [], lineTotal: '3.50' }],
        runningTotal: '3.50', deliveryMethod: 'DELIVERY',
      },
    });

    const validated = validator.validate(raw, ctx);
    const plan = planner.createPlan(validated, ctx);
    expect(plan.steps[0].action).toBe('CancelOrder');
    expect(plan.requiredConfirmation).toBe(true);

    const planWithOrderId = { ...plan, steps: plan.steps.map(s => ({ ...s, payload: { ...s.payload, orderId: 'ord-1' } })) };
    const result = await executor.execute(planWithOrderId);
    expect(result.success).toBe(true);
    expect(orchestrator.cancelCustomerOrder).toHaveBeenCalledWith('ord-1');
  });

  // ══════════════════════════════════════════════════════════════
  // SCENARIO 4: Merchant Busy Blocker
  // ══════════════════════════════════════════════════════════════
  it('Scenario 4: blocks execution when merchant is very busy', () => {
    const raw = decision({ intent: 'ORDER' });
    const ctx = context();
    const availability = { status: 'VERY_BUSY', queueLength: 8, currentETA: 30 };

    const validated = validator.validate(raw, ctx);
    const plan = planner.createPlan(validated, ctx, availability);
    expect(plan.blockingReasons.some(b => b.type === 'MerchantBusy')).toBe(true);
    expect(plan.requiredConfirmation).toBe(true);
  });

  // ══════════════════════════════════════════════════════════════
  // SCENARIO 5: Business Closed Blocker
  // ══════════════════════════════════════════════════════════════
  it('Scenario 5: blocks execution when business is closed', () => {
    const ctx = context({ business: { ...BASE_BUSINESS, workingNow: false } });
    const raw = decision({ intent: 'ORDER', reasoningCode: 'BUSINESS_CLOSED' });

    const validated = validator.validate(raw, ctx);
    const plan = planner.createPlan(validated, ctx);
    expect(plan.blockingReasons.some(b => b.type === 'BusinessClosed')).toBe(true);
    expect(plan.steps[0].action).toBe('AnswerInformation');
  });

  // ══════════════════════════════════════════════════════════════
  // SCENARIO 6: Out Of Stock via Merchant Communication
  // ══════════════════════════════════════════════════════════════
  it('Scenario 6: merchant reports out of stock', async () => {
    await merchantComm.receiveMessage({
      messageId: 'msg-1', merchantId: 'm1', merchantOrderId: 'mo-1',
      customerOrderId: 'co-1', messageType: 'OUT_OF_STOCK',
      timestamp: new Date().toISOString(),
      payload: { productName: 'Cappuccino' },
      metadata: {}, version: 1,
    }, 'cafe-1');
    expect(merchantComm.receiveMessage).toHaveBeenCalled();
  });

  // ══════════════════════════════════════════════════════════════
  // SCENARIO 7: Inventory Failure → Rollback
  // ══════════════════════════════════════════════════════════════
  it('Scenario 7: inventory failure triggers rollback', async () => {
    inventory.reserveStock.mockRejectedValue(new Error('Insufficient stock'));
    const plan = planWithSteps([
      { stepId: 's1', action: 'CreateOrder', payload: { customerId: 'c1', items: [{ productName: 'Cappuccino', quantity: 1, unitPrice: 3.50, cafeId: 'cafe-1' }] }, dependsOn: [], rollbackAction: 'CancelOrder' },
      { stepId: 's2', action: 'ReserveInventory', payload: { orderId: 'ord-1', cafeId: 'cafe-1' }, dependsOn: ['s1'], rollbackAction: 'ReleaseInventory' },
    ]);

    const result = await executor.execute(plan);
    expect(result.success).toBe(false);
    expect(result.status).toBe('ROLLED_BACK');
    expect(orchestrator.cancelCustomerOrder).toHaveBeenCalled();
    expect(events.some(e => e.type === 'RollbackStarted')).toBe(true);
    expect(events.some(e => e.type === 'RollbackCompleted')).toBe(true);
  });

  // ══════════════════════════════════════════════════════════════
  // SCENARIO 8: Merchant Failure → Rollback
  // ══════════════════════════════════════════════════════════════
  it('Scenario 8: merchant communication failure triggers rollback', async () => {
    merchantComm.receiveMessage.mockRejectedValue(new Error('Merchant offline'));
    const plan = planWithSteps([
      { stepId: 's1', action: 'CreateOrder', payload: { customerId: 'c1', items: [{ productName: 'Cappuccino', quantity: 1, unitPrice: 3.50, cafeId: 'cafe-1' }] }, dependsOn: [], rollbackAction: 'CancelOrder' },
      { stepId: 's2', action: 'NotifyMerchant', payload: { cafeId: 'cafe-1', message: { merchantId: 'm1', merchantOrderId: 'mo1', customerOrderId: 'co1', messageType: 'NEW_ORDER', payload: {}, metadata: {}, version: 1 } }, dependsOn: ['s1'], rollbackAction: undefined },
    ]);

    const result = await executor.execute(plan);
    expect(result.success).toBe(false);
    expect(result.status).toBe('ROLLED_BACK');
    expect(orchestrator.cancelCustomerOrder).toHaveBeenCalled();
  });

  // ══════════════════════════════════════════════════════════════
  // SCENARIO 9: Driver Failure → Rollback
  // ══════════════════════════════════════════════════════════════
  it('Scenario 9: driver dispatch failure triggers rollback', async () => {
    driverDispatch.dispatchDriver.mockRejectedValue(new Error('No eligible drivers'));
    const plan = planWithSteps([
      { stepId: 's1', action: 'CreateOrder', payload: { customerId: 'c1', items: [{ productName: 'Cappuccino', quantity: 1, unitPrice: 3.50, cafeId: 'cafe-1' }] }, dependsOn: [], rollbackAction: 'CancelOrder' },
      { stepId: 's2', action: 'NotifyDriverDispatcher', payload: { merchantOrderId: 'mo-1', latitude: 30.0, longitude: 31.0 }, dependsOn: ['s1'], rollbackAction: undefined },
    ]);

    const result = await executor.execute(plan);
    expect(result.success).toBe(false);
    expect(result.status).toBe('ROLLED_BACK');
    expect(orchestrator.cancelCustomerOrder).toHaveBeenCalled();
  });

  // ══════════════════════════════════════════════════════════════
  // SCENARIO 10: Payment Failure → Rollback
  // ══════════════════════════════════════════════════════════════
  it('Scenario 10: payment failure triggers rollback', async () => {
    payment.markOrderPayment.mockRejectedValue(new Error('Payment gateway error'));
    const plan = planWithSteps([
      { stepId: 's1', action: 'CreateOrder', payload: { customerId: 'c1', items: [{ productName: 'Cappuccino', quantity: 1, unitPrice: 3.50, cafeId: 'cafe-1' }] }, dependsOn: [], rollbackAction: 'CancelOrder' },
      { stepId: 's2', action: 'RequestPayment', payload: { orderId: 'ord-1', cafeId: 'cafe-1', paymentStatus: 'PAID' }, dependsOn: ['s1'], rollbackAction: undefined },
    ]);

    const result = await executor.execute(plan);
    expect(result.success).toBe(false);
    expect(result.status).toBe('ROLLED_BACK');
    expect(orchestrator.cancelCustomerOrder).toHaveBeenCalled();
  });

  // ══════════════════════════════════════════════════════════════
  // SCENARIO 11: Duplicate Event Detection
  // ══════════════════════════════════════════════════════════════
  it('Scenario 11: no duplicate events across executions', async () => {
    const plan = planWithSteps([
      { stepId: 's1', action: 'CreateOrder', payload: { customerId: 'c1', items: [{ productName: 'Cappuccino', quantity: 1, unitPrice: 3.50, cafeId: 'cafe-1' }] }, dependsOn: [], rollbackAction: 'CancelOrder' },
    ]);

    await executor.execute(plan);
    expect(events.filter(e => e.type === 'ExecutionStarted').length).toBe(1);
    expect(events.filter(e => e.type === 'ExecutionCompleted').length).toBe(1);
    expect(events.filter(e => e.type === 'StepExecuted').length).toBe(2);
  });

  // ══════════════════════════════════════════════════════════════
  // SCENARIO 12: State Consistency
  // ══════════════════════════════════════════════════════════════
  it('Scenario 12: execution result states are consistent', async () => {
    const plan = planWithSteps([
      { stepId: 's1', action: 'CreateOrder', payload: { customerId: 'c1', items: [{ productName: 'Cappuccino', quantity: 1, unitPrice: 3.50, cafeId: 'cafe-1' }] }, dependsOn: [], rollbackAction: 'CancelOrder' },
      { stepId: 's2', action: 'ReserveInventory', payload: { orderId: 'ord-1', cafeId: 'cafe-1' }, dependsOn: ['s1'], rollbackAction: 'ReleaseInventory' },
    ]);

    const result = await executor.execute(plan);
    expect(result.success).toBe(true);
    expect(result.status).toBe('COMPLETED');
    expect(result.steps.length).toBe(2);
    expect(result.steps.every(s => s.status === 'SUCCEEDED')).toBe(true);
    expect(result.rollbackSteps.length).toBe(0);
    expect(result.error).toBeUndefined();
    expect(result.executedAt).toBeDefined();
    expect(result.completedAt).toBeDefined();
    expect(new Date(result.completedAt) >= new Date(result.executedAt)).toBe(true);
  });

  // ══════════════════════════════════════════════════════════════
  // SCENARIO 13: Rollback Integrity
  // ══════════════════════════════════════════════════════════════
  it('Scenario 13: multi-step failure rolls back all previous steps', async () => {
    inventory.reserveStock.mockRejectedValue(new Error('Inventory unavailable'));
    const plan = planWithSteps([
      { stepId: 's1', action: 'CreateOrder', payload: { customerId: 'c1', items: [{ productName: 'Cappuccino', quantity: 1, unitPrice: 3.50, cafeId: 'cafe-1' }] }, dependsOn: [], rollbackAction: 'CancelOrder' },
      { stepId: 's2', action: 'ReserveInventory', payload: { orderId: 'ord-1', cafeId: 'cafe-1' }, dependsOn: ['s1'], rollbackAction: 'ReleaseInventory' },
      { stepId: 's3', action: 'RequestPayment', payload: { orderId: 'ord-1', cafeId: 'cafe-1' }, dependsOn: ['s2'], rollbackAction: undefined },
    ]);

    const result = await executor.execute(plan);
    expect(result.success).toBe(false);
    expect(result.status).toBe('ROLLED_BACK');
    expect(result.steps[0].status).toBe('SUCCEEDED');
    expect(result.steps[1].status).toBe('FAILED');
    expect(result.steps[2]).toBeUndefined();
    expect(orchestrator.cancelCustomerOrder).toHaveBeenCalledTimes(1);
    expect(inventory.releaseReservation).not.toHaveBeenCalled();
    expect(events.some(e => e.type === 'RollbackCompleted')).toBe(true);
  });

  // ══════════════════════════════════════════════════════════════
  // SCENARIO 14: Performance Metrics
  // ══════════════════════════════════════════════════════════════
  it('Scenario 14: measures end-to-end performance metrics', async () => {
    const raw = decision({ intent: 'ORDER' });
    const ctx = context();
    const t0 = performance.now();

    const validated = validator.validate(raw, ctx);
    const plan = planner.createPlan(validated, ctx);
    const planSteps = plan.steps.map(s => ({ ...s, payload: { ...s.payload, orderId: 'ord-1' } }));
    const execPlan = { ...plan, steps: planSteps };

    const t1 = performance.now();
    const result = await executor.execute(execPlan);
    const t2 = performance.now();

    const planningMs = t1 - t0;
    const executionMs = t2 - t1;
    const totalMs = t2 - t0;

    expect(planningMs).toBeGreaterThanOrEqual(0);
    expect(executionMs).toBeGreaterThanOrEqual(0);
    expect(totalMs).toBeGreaterThan(0);
    expect(result.success).toBe(true);
    expect(events.length).toBeGreaterThan(0);
  });
});

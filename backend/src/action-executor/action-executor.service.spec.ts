import { Test, TestingModule } from '@nestjs/testing';
import { ActionExecutorService } from './action-executor.service';
import { OrderOrchestratorService } from '../order-orchestrator/order-orchestrator.service';
import { InventoryService } from '../inventory/inventory.service';
import { MerchantCommunicationService } from '../merchant-communication/merchant-communication.service';
import { DriverDispatchService } from '../driver-dispatch/driver-dispatch.service';
import { PaymentService } from '../payment-runtime/payment.service';

function createPlan(overrides: Record<string, unknown> = {}): any {
  return {
    planId: 'plan-test-1',
    intent: 'ORDER',
    steps: [],
    requiredConfirmation: false,
    blockingReasons: [],
    estimatedExecution: '15min',
    priority: 'high',
    ...overrides,
  };
}

describe('ActionExecutorService', () => {
  let service: ActionExecutorService;
  let orchestrator: Record<string, jest.Mock>;
  let inventory: Record<string, jest.Mock>;
  let merchantComm: Record<string, jest.Mock>;
  let driverDispatch: Record<string, jest.Mock>;
  let payment: Record<string, jest.Mock>;
  let events: Array<{ type: string }>;

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
        ActionExecutorService,
        { provide: OrderOrchestratorService, useValue: orchestrator },
        { provide: InventoryService, useValue: inventory },
        { provide: MerchantCommunicationService, useValue: merchantComm },
        { provide: DriverDispatchService, useValue: driverDispatch },
        { provide: PaymentService, useValue: payment },
      ],
    }).compile();

    service = module.get(ActionExecutorService);
    events = [];
    service.onEvent((e) => events.push(e));
  });

  it('executes all steps successfully', async () => {
    const plan = createPlan({
      steps: [
        { stepId: 's1', action: 'CreateOrder', target: 'Order', payload: { customerId: 'c1', items: [{ productName: 'Cappuccino', quantity: 1, unitPrice: 3.50, cafeId: 'cafe-1' }] }, dependsOn: [], rollbackAction: 'CancelOrder' },
        { stepId: 's2', action: 'ReserveInventory', target: 'cafe-1', payload: { orderId: 'ord-1', cafeId: 'cafe-1' }, dependsOn: ['s1'], rollbackAction: 'ReleaseInventory' },
      ],
    });

    const result = await service.execute(plan);
    expect(result.success).toBe(true);
    expect(result.status).toBe('COMPLETED');
    expect(result.steps.every(s => s.status === 'SUCCEEDED')).toBe(true);
    expect(orchestrator.createCustomerOrder).toHaveBeenCalledTimes(1);
    expect(inventory.reserveStock).toHaveBeenCalledWith('ord-1', 'cafe-1');
    expect(events.map(e => e.type)).toContain('ExecutionStarted');
    expect(events.map(e => e.type)).toContain('ExecutionCompleted');
  });

  it('rolls back previously succeeded steps on failure', async () => {
    inventory.reserveStock.mockRejectedValue(new Error('Insufficient stock'));
    const plan = createPlan({
      steps: [
        { stepId: 's1', action: 'CreateOrder', target: 'Order', payload: { customerId: 'c1', items: [{ productName: 'Cappuccino', quantity: 1, unitPrice: 3.50, cafeId: 'cafe-1' }] }, dependsOn: [], rollbackAction: 'CancelOrder' },
        { stepId: 's2', action: 'ReserveInventory', target: 'cafe-1', payload: { orderId: 'ord-1', cafeId: 'cafe-1' }, dependsOn: ['s1'], rollbackAction: 'ReleaseInventory' },
      ],
    });

    const result = await service.execute(plan);
    expect(result.success).toBe(false);
    expect(result.status).toBe('ROLLED_BACK');
    expect(result.steps[0].status).toBe('SUCCEEDED');
    expect(result.steps[1].status).toBe('FAILED');
    expect(orchestrator.createCustomerOrder).toHaveBeenCalled();
    expect(orchestrator.cancelCustomerOrder).toHaveBeenCalledWith('ord-1');
    expect(events.map(e => e.type)).toContain('StepFailed');
    expect(events.map(e => e.type)).toContain('RollbackStarted');
    expect(events.map(e => e.type)).toContain('RollbackCompleted');
  });

  it('returns FAILED when only step fails (nothing to roll back)', async () => {
    orchestrator.createCustomerOrder.mockRejectedValue(new Error('DB timeout'));
    const plan = createPlan({
      steps: [
        { stepId: 's1', action: 'CreateOrder', target: 'Order', payload: { customerId: 'c1', items: [{ productName: 'Cappuccino', quantity: 1, unitPrice: 3.50, cafeId: 'cafe-1' }] }, dependsOn: [], rollbackAction: 'CancelOrder' },
      ],
    });

    const result = await service.execute(plan);
    expect(result.success).toBe(false);
    expect(result.status).toBe('FAILED');
    expect(result.steps[0].status).toBe('FAILED');
    expect(result.rollbackSteps.length).toBe(0);
  });

  it('handles merchant communication failure', async () => {
    merchantComm.receiveMessage.mockRejectedValue(new Error('Merchant offline'));
    const plan = createPlan({
      steps: [
        { stepId: 's1', action: 'CreateOrder', target: 'Order', payload: { customerId: 'c1', items: [{ productName: 'Cappuccino', quantity: 1, unitPrice: 3.50, cafeId: 'cafe-1' }] }, dependsOn: [], rollbackAction: 'CancelOrder' },
        { stepId: 's2', action: 'NotifyMerchant', target: 'Merchant', payload: { cafeId: 'cafe-1', message: { merchantId: 'm1', merchantOrderId: 'mo1', customerOrderId: 'co1', messageType: 'NEW_ORDER', payload: {}, metadata: {}, version: 1 } }, dependsOn: ['s1'], rollbackAction: undefined },
      ],
    });

    const result = await service.execute(plan);
    expect(result.success).toBe(false);
    expect(result.status).toBe('ROLLED_BACK');
    expect(result.steps[0].status).toBe('SUCCEEDED');
    expect(result.steps[1].status).toBe('FAILED');
    expect(orchestrator.cancelCustomerOrder).toHaveBeenCalled();
  });

  it('handles payment failure', async () => {
    payment.markOrderPayment.mockRejectedValue(new Error('Payment gateway error'));
    const plan = createPlan({
      steps: [
        { stepId: 's1', action: 'CreateOrder', target: 'Order', payload: { customerId: 'c1', items: [{ productName: 'Cappuccino', quantity: 1, unitPrice: 3.50, cafeId: 'cafe-1' }] }, dependsOn: [], rollbackAction: 'CancelOrder' },
        { stepId: 's2', action: 'RequestPayment', target: 'Payment', payload: { orderId: 'ord-1', cafeId: 'cafe-1', paymentStatus: 'PAID' }, dependsOn: ['s1'], rollbackAction: undefined },
      ],
    });

    const result = await service.execute(plan);
    expect(result.success).toBe(false);
    expect(result.status).toBe('ROLLED_BACK');
    expect(result.steps[1].status).toBe('FAILED');
    expect(orchestrator.cancelCustomerOrder).toHaveBeenCalled();
  });

  it('handles driver dispatch failure', async () => {
    driverDispatch.dispatchDriver.mockRejectedValue(new Error('No eligible drivers'));
    const plan = createPlan({
      steps: [
        { stepId: 's1', action: 'CreateOrder', target: 'Order', payload: { customerId: 'c1', items: [{ productName: 'Cappuccino', quantity: 1, unitPrice: 3.50, cafeId: 'cafe-1' }] }, dependsOn: [], rollbackAction: 'CancelOrder' },
        { stepId: 's2', action: 'NotifyDriverDispatcher', target: 'Driver', payload: { merchantOrderId: 'mo-1', latitude: 30.0, longitude: 31.0 }, dependsOn: ['s1'], rollbackAction: undefined },
      ],
    });

    const result = await service.execute(plan);
    expect(result.success).toBe(false);
    expect(result.status).toBe('ROLLED_BACK');
    expect(result.steps[1].status).toBe('FAILED');
    expect(orchestrator.cancelCustomerOrder).toHaveBeenCalled();
  });

  it('handles partial execution with mixed informational and executable steps', async () => {
    inventory.reserveStock.mockRejectedValue(new Error('Stock error'));
    const plan = createPlan({
      steps: [
        { stepId: 's1', action: 'ShowProducts', target: 'Drinks', payload: {}, dependsOn: [], rollbackAction: undefined },
        { stepId: 's2', action: 'CreateOrder', target: 'Order', payload: { customerId: 'c1', items: [{ productName: 'Cappuccino', quantity: 1, unitPrice: 3.50, cafeId: 'cafe-1' }] }, dependsOn: [], rollbackAction: 'CancelOrder' },
        { stepId: 's3', action: 'ReserveInventory', target: 'cafe-1', payload: { orderId: 'ord-1', cafeId: 'cafe-1' }, dependsOn: ['s2'], rollbackAction: 'ReleaseInventory' },
      ],
    });

    const result = await service.execute(plan);
    expect(result.steps[0].status).toBe('SKIPPED');
    expect(result.steps[1].status).toBe('SUCCEEDED');
    expect(result.steps[2].status).toBe('FAILED');
    expect(result.status).toBe('ROLLED_BACK');
    expect(orchestrator.cancelCustomerOrder).toHaveBeenCalled();
  });

  it('supports duplicate execution of the same plan', async () => {
    const plan = createPlan({
      steps: [
        { stepId: 's1', action: 'CreateOrder', target: 'Order', payload: { customerId: 'c1', items: [{ productName: 'Cappuccino', quantity: 1, unitPrice: 3.50, cafeId: 'cafe-1' }] }, dependsOn: [], rollbackAction: 'CancelOrder' },
      ],
    });

    const r1 = await service.execute(plan);
    const r2 = await service.execute(plan);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(orchestrator.createCustomerOrder).toHaveBeenCalledTimes(2);
  });

  it('recovers from transient failure on retry', async () => {
    orchestrator.createCustomerOrder
      .mockRejectedValueOnce(new Error('Transient error'));
    const plan = createPlan({
      steps: [
        { stepId: 's1', action: 'CreateOrder', target: 'Order', payload: { customerId: 'c1', items: [{ productName: 'Cappuccino', quantity: 1, unitPrice: 3.50, cafeId: 'cafe-1' }] }, dependsOn: [], rollbackAction: 'CancelOrder' },
      ],
    });

    const first = await service.execute(plan);
    expect(first.success).toBe(false);
    expect(first.status).toBe('FAILED');

    const second = await service.execute(plan);
    expect(second.success).toBe(true);
    expect(second.status).toBe('COMPLETED');
    expect(orchestrator.createCustomerOrder).toHaveBeenCalledTimes(2);
  });
});

import { Injectable, Logger } from '@nestjs/common';
import { ActionPlan, PlanStep } from '../action-planner/action-planner.types';
import { OrderOrchestratorService } from '../order-orchestrator/order-orchestrator.service';
import { InventoryService } from '../inventory/inventory.service';
import { MerchantCommunicationService } from '../merchant-communication/merchant-communication.service';
import { DriverDispatchService } from '../driver-dispatch/driver-dispatch.service';
import { PaymentService } from '../payment-runtime/payment.service';
import {
  ExecutionResult, ExecutionStepResult, ExecutorEvent,
  ExecutorEventType, StepStatus, EXECUTABLE_ACTIONS,
} from './action-executor.types';

type EventListener = (event: ExecutorEvent) => void;

@Injectable()
export class ActionExecutorService {
  private readonly logger = new Logger(ActionExecutorService.name);
  private readonly listeners: Set<EventListener> = new Set();
  private stepOutputs: Map<string, Record<string, unknown>> = new Map();

  constructor(
    private readonly orderOrchestrator: OrderOrchestratorService,
    private readonly inventory: InventoryService,
    private readonly merchantComm: MerchantCommunicationService,
    private readonly driverDispatch: DriverDispatchService,
    private readonly payment: PaymentService,
  ) {}

  onEvent(listener: EventListener): void {
    this.listeners.add(listener);
  }

  private emit(type: ExecutorEventType, event: Omit<ExecutorEvent, 'type' | 'timestamp'>): void {
    const full: ExecutorEvent = { type, ...event, timestamp: new Date().toISOString() };
    for (const listener of this.listeners) {
      try { listener(full); } catch { /* noop */ }
    }
  }

  async execute(plan: ActionPlan): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    this.stepOutputs = new Map();
    this.emit('ExecutionStarted', { planId: plan.planId, payload: { intent: plan.intent, stepCount: plan.steps.length } });

    const stepResults: ExecutionStepResult[] = [];
    const rollbackResults: ExecutionStepResult[] = [];
    let overallError: string | undefined;

    for (const step of plan.steps) {
      const isExecutable = EXECUTABLE_ACTIONS.has(step.action);
      if (!isExecutable) {
        stepResults.push({ stepId: step.stepId, action: step.action, status: 'SKIPPED' });
        this.emit('StepExecuted', { planId: plan.planId, stepId: step.stepId, action: step.action, payload: { status: 'SKIPPED' } });
        continue;
      }

      try {
        const sr = await this.executeStep(step, plan);
        stepResults.push(sr);
        this.emit('StepExecuted', { planId: plan.planId, stepId: step.stepId, action: step.action, payload: { status: sr.status } });
      } catch (err) {
        const msg = (err as Error).message;
        stepResults.push({ stepId: step.stepId, action: step.action, status: 'FAILED', error: msg });
        this.emit('StepFailed', { planId: plan.planId, stepId: step.stepId, action: step.action, error: msg });
        overallError = msg;

        await this.rollbackExecutedSteps(stepResults, rollbackResults, plan);
        break;
      }
    }

    const anyFailed = stepResults.some(s => s.status === 'FAILED');
    const anyRollback = rollbackResults.length > 0;
    const finalStatus = anyRollback ? 'ROLLED_BACK' : anyFailed ? 'FAILED' : 'COMPLETED';

    this.emit('ExecutionCompleted', {
      planId: plan.planId,
      payload: { status: finalStatus, success: finalStatus === 'COMPLETED' },
    });

    return {
      planId: plan.planId,
      success: finalStatus === 'COMPLETED',
      status: finalStatus,
      steps: stepResults,
      rollbackSteps: rollbackResults,
      error: overallError,
      executedAt: startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  private async executeStep(step: PlanStep, plan: ActionPlan): Promise<ExecutionStepResult> {
    this.emit('StepExecuted', { planId: plan.planId, stepId: step.stepId, action: step.action, payload: { status: 'EXECUTING' } });

    switch (step.action as string) {
      case 'CreateOrder':
        return this.handleCreateOrder(step, plan);
      case 'ModifyOrder':
        return this.handleModifyOrder(step, plan);
      case 'CancelOrder':
        return this.handleCancelOrder(step, plan);
      case 'ReserveInventory':
        return this.handleReserveInventory(step, plan);
      case 'ReleaseInventory':
        return this.handleReleaseInventory(step, plan);
      case 'NotifyMerchant':
        return this.handleNotifyMerchant(step, plan);
      case 'NotifyDriverDispatcher':
        return this.handleNotifyDriverDispatcher(step, plan);
      case 'RequestPayment':
        return this.handleRequestPayment(step, plan);
      default:
        return { stepId: step.stepId, action: step.action, status: 'SKIPPED' };
    }
  }

  private async rollbackExecutedSteps(
    completedSteps: ExecutionStepResult[],
    rollbackResults: ExecutionStepResult[],
    plan: ActionPlan,
  ): Promise<void> {
    const succeededSteps = plan.steps.filter(s =>
      completedSteps.find(cs => cs.stepId === s.stepId && cs.status === 'SUCCEEDED')
    );

    if (succeededSteps.length === 0) {
      this.emit('RollbackCompleted', { planId: plan.planId, payload: { rollbackSteps: 0 } });
      return;
    }

    this.emit('RollbackStarted', { planId: plan.planId, payload: { rollbackCount: succeededSteps.length } });

    for (const step of succeededSteps.reverse()) {
      const rollbackAction = this.getRollbackAction(step.action);
      if (!rollbackAction) {
        rollbackResults.push({ stepId: step.stepId, action: step.action, status: 'ROLLED_BACK' });
        continue;
      }

      const storedOutput = this.stepOutputs.get(step.stepId);
      const rollbackPayload: Record<string, unknown> = {
        ...step.payload,
        ...(storedOutput || {}),
        rollbackFor: step.stepId,
      };

      try {
        const rollbackStep: PlanStep = {
          stepId: `rollback-${step.stepId}`,
          action: rollbackAction as any,
          target: step.stepId,
          payload: rollbackPayload,
          dependsOn: [],
        };
        const rr = await this.executeStep(rollbackStep, plan);
        rollbackResults.push(rr);
      } catch {
        rollbackResults.push({ stepId: step.stepId, action: step.action, status: 'ROLLED_BACK', error: 'Rollback failed' });
      }
    }

    this.emit('RollbackCompleted', { planId: plan.planId, payload: { rollbackSteps: rollbackResults.length } });
  }

  private getRollbackAction(action: string): string | undefined {
    return { CreateOrder: 'CancelOrder', ModifyOrder: 'CancelOrder', ReserveInventory: 'ReleaseInventory' }[action];
  }

  private async handleCreateOrder(step: PlanStep, _plan: ActionPlan): Promise<ExecutionStepResult> {
    const payload = step.payload;
    const order = await this.orderOrchestrator.createCustomerOrder({
      customerId: payload['customerId'] as string | undefined,
      customerName: payload['customerName'] as string | undefined,
      customerPhone: payload['customerPhone'] as string | undefined,
      address: payload['address'] as string | undefined,
      deliveryMethod: payload['deliveryMethod'] as string | undefined,
      items: (payload['items'] as Array<{ productName: string; quantity: number; unitPrice: number; cafeId: string }>) || [],
      deliveryFee: payload['deliveryFee'] as number | undefined,
    });
    if (order && typeof order === 'object' && 'id' in order) {
      this.stepOutputs.set(step.stepId, { orderId: (order as any).id, cafeId: (order as any).cafeId });
    }
    return { stepId: step.stepId, action: step.action, status: 'SUCCEEDED' };
  }

  private async handleModifyOrder(step: PlanStep, _plan: ActionPlan): Promise<ExecutionStepResult> {
    const orderId = step.payload['orderId'] as string | undefined;
    if (!orderId) {
      return { stepId: step.stepId, action: step.action, status: 'SKIPPED' };
    }
    const items = step.payload['items'] as Array<{ productName: string; quantity: number; unitPrice: number; cafeId: string }> | undefined;
    if (!items || items.length === 0) {
      return { stepId: step.stepId, action: step.action, status: 'SKIPPED' };
    }
    await this.orderOrchestrator.createCustomerOrder({
      customerId: step.payload['customerId'] as string | undefined,
      items,
      deliveryFee: step.payload['deliveryFee'] as number | undefined,
    });
    return { stepId: step.stepId, action: step.action, status: 'SUCCEEDED' };
  }

  private async handleCancelOrder(step: PlanStep, _plan: ActionPlan): Promise<ExecutionStepResult> {
    const orderId = step.payload['orderId'] as string;
    if (!orderId) {
      return { stepId: step.stepId, action: step.action, status: 'FAILED', error: 'orderId required in payload' };
    }
    await this.orderOrchestrator.cancelCustomerOrder(orderId);
    return { stepId: step.stepId, action: step.action, status: 'SUCCEEDED' };
  }

  private async handleReserveInventory(step: PlanStep, _plan: ActionPlan): Promise<ExecutionStepResult> {
    const orderId = step.payload['orderId'] as string;
    const cafeId = step.payload['cafeId'] as string;
    if (!orderId || !cafeId) {
      return { stepId: step.stepId, action: step.action, status: 'FAILED', error: 'orderId and cafeId required in payload' };
    }
    await this.inventory.reserveStock(orderId, cafeId);
    return { stepId: step.stepId, action: step.action, status: 'SUCCEEDED' };
  }

  private async handleReleaseInventory(step: PlanStep, _plan: ActionPlan): Promise<ExecutionStepResult> {
    const orderId = step.payload['orderId'] as string;
    const cafeId = step.payload['cafeId'] as string;
    if (!orderId) {
      return { stepId: step.stepId, action: step.action, status: 'FAILED', error: 'orderId required in payload' };
    }
    await this.inventory.releaseReservation(orderId, cafeId || undefined);
    return { stepId: step.stepId, action: step.action, status: 'SUCCEEDED' };
  }

  private async handleNotifyMerchant(step: PlanStep, _plan: ActionPlan): Promise<ExecutionStepResult> {
    const message = step.payload['message'] as Record<string, unknown> | undefined;
    const cafeId = step.payload['cafeId'] as string;
    if (!message || !cafeId) {
      return { stepId: step.stepId, action: step.action, status: 'FAILED', error: 'message and cafeId required in payload' };
    }
    const now = new Date().toISOString();
    await this.merchantComm.receiveMessage({
      messageId: (message['messageId'] as string) || `exec-msg-${Date.now()}`,
      merchantId: (message['merchantId'] as string) || '',
      merchantOrderId: (message['merchantOrderId'] as string) || '',
      customerOrderId: (message['customerOrderId'] as string) || '',
      messageType: (message['messageType'] as any) || 'NEW_ORDER',
      timestamp: (message['timestamp'] as string) || now,
      payload: (message['payload'] as Record<string, unknown>) || {},
      metadata: (message['metadata'] as Record<string, unknown>) || {},
      version: (message['version'] as number) || 1,
    }, cafeId);
    return { stepId: step.stepId, action: step.action, status: 'SUCCEEDED' };
  }

  private async handleNotifyDriverDispatcher(step: PlanStep, _plan: ActionPlan): Promise<ExecutionStepResult> {
    const merchantOrderId = step.payload['merchantOrderId'] as string;
    const lat = step.payload['latitude'] as number;
    const lng = step.payload['longitude'] as number;
    const zoneId = step.payload['zoneId'] as string | undefined;
    if (!merchantOrderId) {
      return { stepId: step.stepId, action: step.action, status: 'FAILED', error: 'merchantOrderId required in payload' };
    }
    const assignment = await this.driverDispatch.dispatchDriver(merchantOrderId, lat || 0, lng || 0, zoneId);
    if (!assignment && step.payload['requireDriver'] !== false) {
      return { stepId: step.stepId, action: step.action, status: 'FAILED', error: 'No eligible driver found' };
    }
    return { stepId: step.stepId, action: step.action, status: 'SUCCEEDED' };
  }

  private async handleRequestPayment(step: PlanStep, _plan: ActionPlan): Promise<ExecutionStepResult> {
    const orderId = step.payload['orderId'] as string;
    const cafeId = step.payload['cafeId'] as string;
    if (!orderId || !cafeId) {
      return { stepId: step.stepId, action: step.action, status: 'FAILED', error: 'orderId and cafeId required in payload' };
    }
    await this.payment.markOrderPayment(orderId, {
      paymentStatus: (step.payload['paymentStatus'] as string) || 'PAID',
      amountPaid: step.payload['amountPaid'] as number | undefined,
      method: step.payload['method'] as string | undefined,
      collectedById: step.payload['collectedById'] as string | undefined,
      collectedRole: step.payload['collectedRole'] as string | undefined,
      notes: step.payload['notes'] as string | undefined,
    }, cafeId);
    return { stepId: step.stepId, action: step.action, status: 'SUCCEEDED' };
  }
}

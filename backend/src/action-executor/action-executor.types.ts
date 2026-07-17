export const EXECUTOR_ACTIONS = [
  'CreateOrder', 'ModifyOrder', 'CancelOrder',
  'ReserveInventory', 'ReleaseInventory',
  'NotifyMerchant', 'NotifyDriverDispatcher', 'RequestPayment',
] as const;
export type ExecutorAction = typeof EXECUTOR_ACTIONS[number];

export const EXECUTABLE_ACTIONS: Set<string> = new Set(EXECUTOR_ACTIONS);

export type StepStatus =
  | 'PENDING'
  | 'EXECUTING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'ROLLING_BACK'
  | 'ROLLED_BACK'
  | 'SKIPPED';

export const EXECUTOR_EVENT_TYPES = [
  'ExecutionStarted', 'StepExecuted', 'StepFailed',
  'RollbackStarted', 'RollbackCompleted', 'ExecutionCompleted',
] as const;
export type ExecutorEventType = typeof EXECUTOR_EVENT_TYPES[number];

export interface ExecutionStepResult {
  stepId: string;
  action: string;
  status: StepStatus;
  error?: string;
}

export interface ExecutionResult {
  planId: string;
  success: boolean;
  status: 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';
  steps: ExecutionStepResult[];
  rollbackSteps: ExecutionStepResult[];
  error?: string;
  executedAt: string;
  completedAt: string;
}

export interface ExecutorEvent {
  type: ExecutorEventType;
  planId: string;
  stepId?: string;
  action?: string;
  timestamp: string;
  error?: string;
  payload?: Record<string, unknown>;
}

export const ROLLBACK_MAP: Record<string, string | undefined> = {
  CreateOrder: 'CancelOrder',
  ModifyOrder: 'CancelOrder',
  CancelOrder: undefined,
  ReserveInventory: 'ReleaseInventory',
  ReleaseInventory: undefined,
  NotifyMerchant: undefined,
  NotifyDriverDispatcher: undefined,
  RequestPayment: undefined,
};

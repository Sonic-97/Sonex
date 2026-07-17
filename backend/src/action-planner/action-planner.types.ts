export const PLANNER_ACTIONS = [
  'CreateOrder',
  'ModifyOrder',
  'CancelOrder',
  'AskForOption',
  'AskForQuantity',
  'AskForAddress',
  'AskForPaymentMethod',
  'ShowProducts',
  'ShowMerchant',
  'ShowCategory',
  'RecommendProducts',
  'RecommendMerchant',
  'AnswerInformation',
  'EscalateHuman',
  'NoAction',
] as const;
export type PlannerAction = typeof PLANNER_ACTIONS[number];

export const BLOCKER_TYPES = [
  'MissingProduct',
  'MissingMerchant',
  'BusinessClosed',
  'MerchantBusy',
  'UnknownCustomer',
  'MissingAddress',
  'MissingQuantity',
  'MissingOptions',
  'PaymentRequired',
] as const;
export type BlockerType = typeof BLOCKER_TYPES[number];

export interface Blocker {
  type: BlockerType;
  reason: string;
  severity: 'hard' | 'soft';
}

export interface PlanStep {
  stepId: string;
  action: PlannerAction;
  target?: string;
  payload: Record<string, unknown>;
  dependsOn: string[];
  rollbackAction?: PlannerAction;
}

export interface ActionPlan {
  planId: string;
  intent: string;
  steps: PlanStep[];
  requiredConfirmation: boolean;
  blockingReasons: Blocker[];
  estimatedExecution: string;
  priority: 'high' | 'medium' | 'low';
}

export interface MerchantAvailabilityData {
  status: string;
  queueLength: number;
  currentETA: number;
}

export interface TrustData {
  trustScore: number;
  badges: string[];
  alertCount: number;
}

export const CONFIRMATION_ACTIONS: Set<PlannerAction> = new Set([
  'CreateOrder',
  'ModifyOrder',
  'CancelOrder',
]);

export const OWNER_ACTION_TYPES = [
  'CREATE_OFFER_DRAFT',
  'ACTIVATE_APPROVED_OFFER',
  'DEACTIVATE_OFFER',
  'UPDATE_PRODUCT_PRICE',
  'UPDATE_PRODUCT_AVAILABILITY',
  'DISABLE_PRODUCT',
  'ENABLE_PRODUCT',
  'CREATE_CUSTOMER_SEGMENT',
  'CREATE_CAMPAIGN_DRAFT',
  'SEND_APPROVED_CAMPAIGN',
  'CREATE_RESTOCK_PROPOSAL',
  'CREATE_PURCHASE_ORDER_DRAFT',
  'CREATE_APPROVED_PURCHASE_ORDER',
  'UPDATE_MINIMUM_STOCK_LEVEL',
  'CREATE_EXPENSE_DRAFT',
  'CREATE_APPROVED_EXPENSE',
  'CREATE_STAFF_SCHEDULE_DRAFT',
  'APPLY_APPROVED_STAFF_SCHEDULE',
  'CREATE_CUSTOMER_COMPENSATION_DRAFT',
  'APPLY_APPROVED_COMPENSATION',
  'CREATE_PRODUCT_WITH_RECIPE',
  'RECORD_INVENTORY_PURCHASE',
  'RECORD_STOCK_WASTE',
] as const;

export type OwnerActionType = (typeof OWNER_ACTION_TYPES)[number];

export const OWNER_ACTION_STATUSES = [
  'DRAFT',
  'AWAITING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'STALE',
  'EXECUTING',
  'EXECUTED',
  'FAILED',
  'ROLLED_BACK',
  'CANCELLED',
] as const;

export type OwnerActionStatus = (typeof OWNER_ACTION_STATUSES)[number];
export type OwnerActionRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type OwnerActionReversibility = 'REVERSIBLE' | 'PARTIALLY_REVERSIBLE' | 'IRREVERSIBLE';
export type OwnerActionChannel = 'COPILOT' | 'UI' | 'API' | 'TELEGRAM';

export interface OwnerActionUser {
  id: string;
  role: string;
  cafeId?: string | null;
  branchId?: string | null;
  name?: string;
  permissions?: string[];
  allowedBranchIds?: string[];
}

export interface OwnerActionResource {
  type: 'Product' | 'Inventory' | 'Expense' | 'OfferDraft' | 'CampaignDraft' | 'PurchaseDraft' | 'ScheduleDraft' | 'CompensationDraft' | 'ProductWithRecipe' | 'InventoryPurchase' | 'StockWaste';
  id?: string;
  name: string;
}

export interface OwnerActionImpact {
  financial?: string;
  operational?: string;
  customer?: string;
  inventory?: string;
  unitMarginBefore?: number;
  unitMarginAfter?: number;
  affectedRecords?: number;
  whatWillNotChange: string[];
}

export interface OwnerActionExecution {
  executionId: string;
  idempotencyKey: string;
  tool: string;
  result: Record<string, unknown>;
  affectedRecordIds: string[];
  verified: boolean;
  duplicate: boolean;
  executedAt: string;
  rollback?: {
    supported: boolean;
    metadata?: Record<string, unknown>;
  };
  monitoring?: {
    metrics: string[];
    reviewAfter: string;
    caveat: string;
  };
}

export interface OwnerActionProposal {
  proposalId: string;
  revisionOf?: string;
  version: number;
  actionType: OwnerActionType;
  status: OwnerActionStatus;
  riskLevel: OwnerActionRisk;
  reversibility: OwnerActionReversibility;
  cafeId: string;
  branchIds: string[];
  branchNames: string[];
  createdBy: string;
  createdByRole: string;
  resource: OwnerActionResource;
  currentState: Record<string, unknown>;
  proposedState: Record<string, unknown>;
  expectedStateHash: string;
  impact: OwnerActionImpact;
  warnings: string[];
  reason: string;
  requestedText?: string;
  source: OwnerActionChannel;
  approvalPhrase: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  approvedAt?: string;
  approvedBy?: string;
  approvalChannel?: OwnerActionChannel;
  approvalText?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  cancelledAt?: string;
  failure?: string;
  execution?: OwnerActionExecution;
}

export interface OwnerActionDefinition {
  risk: OwnerActionRisk;
  reversibility: OwnerActionReversibility;
  allowedRoles: Array<'OWNER' | 'MANAGER'>;
  permission: string;
  branchRequired: boolean;
  executable: boolean;
  tool?: string;
  unsupportedReason?: string;
}

export interface NaturalActionPreparation {
  handled: boolean;
  blocked: boolean;
  message: string;
  warnings: string[];
  proposal?: OwnerActionProposal;
}

export interface OwnerActionMetrics {
  proposalsCreated: number;
  proposalsApproved: number;
  proposalsRejected: number;
  proposalsCancelled: number;
  proposalsExpired: number;
  staleProposals: number;
  executionSuccess: number;
  executionFailure: number;
  rollbacks: number;
  duplicateAttempts: number;
  permissionDenials: number;
  ownerEdits: number;
  blockedRequests: number;
  telegramApprovalDenials: number;
  measurableFinancialImpact: number;
  customerRecordsAffected: number;
  monitoringPlansCreated: number;
  totalApprovalTimeMs: number;
  approvalCount: number;
  byActionType: Partial<Record<OwnerActionType, number>>;
  byRiskLevel: Partial<Record<OwnerActionRisk, number>>;
}

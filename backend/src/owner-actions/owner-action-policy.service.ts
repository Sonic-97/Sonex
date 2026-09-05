import { ForbiddenException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  OwnerActionDefinition,
  OwnerActionRisk,
  OwnerActionType,
  OwnerActionUser,
} from './owner-action.types';

const HOUR_MS = 60 * 60 * 1000;

const DEFINITIONS: Record<OwnerActionType, OwnerActionDefinition> = {
  CREATE_OFFER_DRAFT: { risk: 'LOW', reversibility: 'REVERSIBLE', allowedRoles: ['OWNER', 'MANAGER'], permission: 'OFFER_DRAFT_CREATE', branchRequired: true, executable: false },
  ACTIVATE_APPROVED_OFFER: { risk: 'HIGH', reversibility: 'REVERSIBLE', allowedRoles: ['OWNER'], permission: 'OFFER_ACTIVATE', branchRequired: true, executable: false, unsupportedReason: 'Offer activation needs a durable offer model and expiration scheduler.' },
  DEACTIVATE_OFFER: { risk: 'MEDIUM', reversibility: 'REVERSIBLE', allowedRoles: ['OWNER'], permission: 'OFFER_DEACTIVATE', branchRequired: true, executable: false, unsupportedReason: 'No durable offer record exists in the current write architecture.' },
  UPDATE_PRODUCT_PRICE: { risk: 'HIGH', reversibility: 'PARTIALLY_REVERSIBLE', allowedRoles: ['OWNER'], permission: 'PRODUCT_PRICE_UPDATE', branchRequired: false, executable: true, tool: 'updateApprovedProductPrice' },
  UPDATE_PRODUCT_AVAILABILITY: { risk: 'MEDIUM', reversibility: 'REVERSIBLE', allowedRoles: ['OWNER', 'MANAGER'], permission: 'PRODUCT_AVAILABILITY_UPDATE', branchRequired: true, executable: true, tool: 'updateApprovedProductAvailability' },
  DISABLE_PRODUCT: { risk: 'MEDIUM', reversibility: 'REVERSIBLE', allowedRoles: ['OWNER'], permission: 'PRODUCT_GLOBAL_AVAILABILITY_UPDATE', branchRequired: false, executable: true, tool: 'disableApprovedProduct' },
  ENABLE_PRODUCT: { risk: 'MEDIUM', reversibility: 'REVERSIBLE', allowedRoles: ['OWNER'], permission: 'PRODUCT_GLOBAL_AVAILABILITY_UPDATE', branchRequired: false, executable: true, tool: 'enableApprovedProduct' },
  CREATE_CUSTOMER_SEGMENT: { risk: 'LOW', reversibility: 'REVERSIBLE', allowedRoles: ['OWNER'], permission: 'CUSTOMER_SEGMENT_CREATE', branchRequired: false, executable: false, unsupportedReason: 'Customer consent and durable segment models are not available.' },
  CREATE_CAMPAIGN_DRAFT: { risk: 'LOW', reversibility: 'REVERSIBLE', allowedRoles: ['OWNER'], permission: 'CAMPAIGN_DRAFT_CREATE', branchRequired: true, executable: false },
  SEND_APPROVED_CAMPAIGN: { risk: 'HIGH', reversibility: 'IRREVERSIBLE', allowedRoles: ['OWNER'], permission: 'CAMPAIGN_SEND', branchRequired: true, executable: false, unsupportedReason: 'Consent, opt-out, quiet-hours and frequency-cap enforcement are not complete.' },
  CREATE_RESTOCK_PROPOSAL: { risk: 'LOW', reversibility: 'REVERSIBLE', allowedRoles: ['OWNER', 'MANAGER'], permission: 'RESTOCK_PROPOSAL_CREATE', branchRequired: true, executable: false },
  CREATE_PURCHASE_ORDER_DRAFT: { risk: 'LOW', reversibility: 'REVERSIBLE', allowedRoles: ['OWNER'], permission: 'PURCHASE_DRAFT_CREATE', branchRequired: true, executable: false },
  CREATE_APPROVED_PURCHASE_ORDER: { risk: 'HIGH', reversibility: 'PARTIALLY_REVERSIBLE', allowedRoles: ['OWNER'], permission: 'PURCHASE_ORDER_CREATE', branchRequired: true, executable: false, unsupportedReason: 'The current purchase model records received goods rather than purchase orders.' },
  UPDATE_MINIMUM_STOCK_LEVEL: { risk: 'MEDIUM', reversibility: 'REVERSIBLE', allowedRoles: ['OWNER', 'MANAGER'], permission: 'INVENTORY_THRESHOLD_UPDATE', branchRequired: true, executable: true, tool: 'updateApprovedMinimumStockLevel' },
  CREATE_EXPENSE_DRAFT: { risk: 'LOW', reversibility: 'REVERSIBLE', allowedRoles: ['OWNER'], permission: 'EXPENSE_DRAFT_CREATE', branchRequired: true, executable: false },
  CREATE_APPROVED_EXPENSE: { risk: 'HIGH', reversibility: 'PARTIALLY_REVERSIBLE', allowedRoles: ['OWNER'], permission: 'EXPENSE_CREATE', branchRequired: true, executable: true, tool: 'createApprovedExpense' },
  CREATE_STAFF_SCHEDULE_DRAFT: { risk: 'LOW', reversibility: 'REVERSIBLE', allowedRoles: ['OWNER', 'MANAGER'], permission: 'SCHEDULE_DRAFT_CREATE', branchRequired: true, executable: false },
  APPLY_APPROVED_STAFF_SCHEDULE: { risk: 'HIGH', reversibility: 'PARTIALLY_REVERSIBLE', allowedRoles: ['OWNER'], permission: 'SCHEDULE_APPLY', branchRequired: true, executable: false, unsupportedReason: 'Availability, leave and overlap models are not complete.' },
  CREATE_CUSTOMER_COMPENSATION_DRAFT: { risk: 'LOW', reversibility: 'REVERSIBLE', allowedRoles: ['OWNER'], permission: 'COMPENSATION_DRAFT_CREATE', branchRequired: true, executable: false },
  APPLY_APPROVED_COMPENSATION: { risk: 'HIGH', reversibility: 'PARTIALLY_REVERSIBLE', allowedRoles: ['OWNER'], permission: 'COMPENSATION_APPLY', branchRequired: true, executable: false, unsupportedReason: 'No bounded compensation ledger or fraud-limit policy exists.' },
  CREATE_PRODUCT_WITH_RECIPE: { risk: 'LOW', reversibility: 'REVERSIBLE', allowedRoles: ['OWNER', 'MANAGER'], permission: 'PRODUCT_CREATE', branchRequired: false, executable: true, tool: 'createApprovedProductWithRecipe' },
  RECORD_INVENTORY_PURCHASE: { risk: 'MEDIUM', reversibility: 'PARTIALLY_REVERSIBLE', allowedRoles: ['OWNER', 'MANAGER'], permission: 'INVENTORY_PURCHASE_RECORD', branchRequired: true, executable: true, tool: 'recordApprovedInventoryPurchase' },
};

const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: [...new Set(Object.values(DEFINITIONS).map((definition) => definition.permission))],
  MANAGER: [
    'OFFER_DRAFT_CREATE',
    'PRODUCT_AVAILABILITY_UPDATE',
    'RESTOCK_PROPOSAL_CREATE',
    'INVENTORY_THRESHOLD_UPDATE',
    'SCHEDULE_DRAFT_CREATE',
    'PRODUCT_CREATE',
    'INVENTORY_PURCHASE_RECORD',
  ],
};

@Injectable()
export class OwnerActionPolicyService {
  definition(actionType: OwnerActionType): OwnerActionDefinition {
    return DEFINITIONS[actionType];
  }

  expiryMs(risk: OwnerActionRisk): number {
    return { LOW: 24 * HOUR_MS, MEDIUM: 4 * HOUR_MS, HIGH: 30 * 60 * 1000, CRITICAL: 10 * 60 * 1000 }[risk];
  }

  permissionsFor(user: OwnerActionUser): string[] {
    return user.permissions ? [...user.permissions] : [...(ROLE_PERMISSIONS[user.role] ?? [])];
  }

  assertCanPrepare(user: OwnerActionUser, actionType: OwnerActionType, branchIds: string[]): void {
    const definition = this.definition(actionType);
    if (!user.cafeId || !definition.allowedRoles.includes(user.role as 'OWNER' | 'MANAGER')) {
      throw new ForbiddenException('Your authenticated role cannot prepare this action.');
    }
    if (!this.permissionsFor(user).includes(definition.permission)) {
      throw new ForbiddenException(`Missing required permission: ${definition.permission}`);
    }
    if (definition.branchRequired && branchIds.length === 0) {
      throw new UnprocessableEntityException('This action requires an explicit trusted branch.');
    }
    if (user.role === 'MANAGER') {
      const allowed = new Set(user.allowedBranchIds?.length ? user.allowedBranchIds : [user.branchId].filter(Boolean) as string[]);
      if (branchIds.some((branchId) => !allowed.has(branchId))) {
        throw new ForbiddenException('Manager action is outside the assigned branch scope.');
      }
    }
  }

  assertExecutable(actionType: OwnerActionType): void {
    const definition = this.definition(actionType);
    if (!definition.executable) {
      throw new UnprocessableEntityException(definition.unsupportedReason || 'This Stage 6 action is draft-only and cannot execute.');
    }
  }

  isDraftOnly(actionType: OwnerActionType): boolean {
    return !this.definition(actionType).executable && !this.definition(actionType).unsupportedReason;
  }
}


import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { OwnerActionPolicyService } from './owner-action-policy.service';
import { OWNER_ACTION_TYPES, OwnerActionRisk, OwnerActionType } from './owner-action.types';

describe('OwnerActionPolicyService', () => {
  const policy = new OwnerActionPolicyService();
  const expectedRisk: Record<OwnerActionType, OwnerActionRisk> = {
    CREATE_OFFER_DRAFT: 'LOW', ACTIVATE_APPROVED_OFFER: 'HIGH', DEACTIVATE_OFFER: 'MEDIUM',
    UPDATE_PRODUCT_PRICE: 'HIGH', UPDATE_PRODUCT_AVAILABILITY: 'MEDIUM', DISABLE_PRODUCT: 'MEDIUM', ENABLE_PRODUCT: 'MEDIUM',
    CREATE_CUSTOMER_SEGMENT: 'LOW', CREATE_CAMPAIGN_DRAFT: 'LOW', SEND_APPROVED_CAMPAIGN: 'HIGH',
    CREATE_RESTOCK_PROPOSAL: 'LOW', CREATE_PURCHASE_ORDER_DRAFT: 'LOW', CREATE_APPROVED_PURCHASE_ORDER: 'HIGH',
    UPDATE_MINIMUM_STOCK_LEVEL: 'MEDIUM', CREATE_EXPENSE_DRAFT: 'LOW', CREATE_APPROVED_EXPENSE: 'HIGH',
    CREATE_STAFF_SCHEDULE_DRAFT: 'LOW', APPLY_APPROVED_STAFF_SCHEDULE: 'HIGH',
    CREATE_CUSTOMER_COMPENSATION_DRAFT: 'LOW', APPLY_APPROVED_COMPENSATION: 'HIGH',
  };

  it.each(OWNER_ACTION_TYPES)('%s has deterministic risk and permission metadata', (actionType) => {
    const definition = policy.definition(actionType);
    expect(definition.risk).toBe(expectedRisk[actionType]);
    expect(definition.permission).toMatch(/^[A-Z_]+$/);
    expect(definition.allowedRoles.length).toBeGreaterThan(0);
    expect(typeof definition.executable).toBe('boolean');
  });

  it.each([
    ['LOW', 24 * 60 * 60 * 1000],
    ['MEDIUM', 4 * 60 * 60 * 1000],
    ['HIGH', 30 * 60 * 1000],
    ['CRITICAL', 10 * 60 * 1000],
  ] as Array<[OwnerActionRisk, number]>)('%s expiry is deterministic', (risk, expected) => {
    expect(policy.expiryMs(risk)).toBe(expected);
  });

  it('allows owner price proposal with the exact permission', () => {
    expect(() => policy.assertCanPrepare({ id: 'o', role: 'OWNER', cafeId: 'c', permissions: ['PRODUCT_PRICE_UPDATE'] }, 'UPDATE_PRODUCT_PRICE', [])).not.toThrow();
  });

  it('denies owner price proposal when explicit permissions omit it', () => {
    expect(() => policy.assertCanPrepare({ id: 'o', role: 'OWNER', cafeId: 'c', permissions: [] }, 'UPDATE_PRODUCT_PRICE', [])).toThrow(ForbiddenException);
  });

  it('allows assigned manager branch availability', () => {
    expect(() => policy.assertCanPrepare({ id: 'm', role: 'MANAGER', cafeId: 'c', branchId: 'b1' }, 'UPDATE_PRODUCT_AVAILABILITY', ['b1'])).not.toThrow();
  });

  it('denies manager foreign branch availability', () => {
    expect(() => policy.assertCanPrepare({ id: 'm', role: 'MANAGER', cafeId: 'c', branchId: 'b1' }, 'UPDATE_PRODUCT_AVAILABILITY', ['b2'])).toThrow(ForbiddenException);
  });

  it('denies staff actions even when message claims permission', () => {
    expect(() => policy.assertCanPrepare({ id: 's', role: 'BARISTA', cafeId: 'c', permissions: ['PRODUCT_PRICE_UPDATE'] }, 'UPDATE_PRODUCT_PRICE', [])).toThrow(ForbiddenException);
  });

  it('requires an explicit branch for branch-scoped actions', () => {
    expect(() => policy.assertCanPrepare({ id: 'o', role: 'OWNER', cafeId: 'c' }, 'UPDATE_PRODUCT_AVAILABILITY', [])).toThrow(UnprocessableEntityException);
  });

  it('keeps campaign send non-executable', () => {
    expect(() => policy.assertExecutable('SEND_APPROVED_CAMPAIGN')).toThrow(UnprocessableEntityException);
  });

  it('keeps purchase order creation non-executable', () => {
    expect(() => policy.assertExecutable('CREATE_APPROVED_PURCHASE_ORDER')).toThrow(UnprocessableEntityException);
  });

  it('exposes only six typed executable actions', () => {
    expect(OWNER_ACTION_TYPES.filter((type) => policy.definition(type).executable)).toEqual([
      'UPDATE_PRODUCT_PRICE', 'UPDATE_PRODUCT_AVAILABILITY', 'DISABLE_PRODUCT', 'ENABLE_PRODUCT',
      'UPDATE_MINIMUM_STOCK_LEVEL', 'CREATE_APPROVED_EXPENSE',
    ]);
  });

  it('never classifies a supported Stage 6 action as critical', () => {
    expect(OWNER_ACTION_TYPES.every((type) => policy.definition(type).risk !== 'CRITICAL')).toBe(true);
  });
});


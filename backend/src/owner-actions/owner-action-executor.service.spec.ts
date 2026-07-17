import { hashOwnerActionState, OwnerActionReaderService } from './owner-action-reader.service';
import { OwnerActionExecutorService, OwnerActionStaleError } from './owner-action-executor.service';
import { OwnerActionProposal, OwnerActionType } from './owner-action.types';

function proposal(actionType: OwnerActionType, overrides: Partial<OwnerActionProposal> = {}): OwnerActionProposal {
  const currentState: Record<string, unknown> = actionType === 'UPDATE_PRODUCT_PRICE'
    ? { price: 50, cost: 20, active: true, scope: 'GLOBAL', branchProductId: null, branchProductAvailable: null }
    : actionType === 'UPDATE_PRODUCT_AVAILABILITY'
      ? { isAvailable: true, branchProductId: 'bp-1', branchPrice: 50, productActive: true, activeOrderItems: 0 }
      : actionType === 'UPDATE_MINIMUM_STOCK_LEVEL'
        ? { currentQty: 10, minThreshold: 2, costPerUnit: 3, unit: 'kg', version: 1 }
        : actionType === 'CREATE_APPROVED_EXPENSE'
          ? { duplicateExpenseId: null }
          : { active: actionType === 'DISABLE_PRODUCT', price: 50, cost: 20 };
  const proposedState: Record<string, unknown> = actionType === 'UPDATE_PRODUCT_PRICE'
    ? { price: 55 }
    : actionType === 'UPDATE_PRODUCT_AVAILABILITY'
      ? { isAvailable: false }
      : actionType === 'UPDATE_MINIMUM_STOCK_LEVEL'
        ? { minThreshold: 4 }
        : actionType === 'CREATE_APPROVED_EXPENSE'
          ? { amount: 500, category: 'utilities', description: 'Electricity bill', expenseDate: '2026-07-13T10:00:00.000Z', paymentMethod: 'CASH' }
          : { active: actionType === 'ENABLE_PRODUCT' };
  return {
    proposalId: 'SX-ABC123', version: 1, actionType, status: 'EXECUTING', riskLevel: 'HIGH',
    reversibility: 'REVERSIBLE', cafeId: 'cafe-1', branchIds: actionType === 'UPDATE_PRODUCT_PRICE' ? [] : ['branch-1'],
    branchNames: ['Main'], createdBy: 'owner-1', createdByRole: 'OWNER',
    resource: { type: actionType.includes('STOCK') ? 'Inventory' : actionType.includes('EXPENSE') ? 'Expense' : 'Product', id: actionType.includes('STOCK') ? 'inventory-1' : actionType.includes('EXPENSE') ? undefined : 'product-1', name: 'Resource' },
    currentState, proposedState, expectedStateHash: hashOwnerActionState(currentState), impact: { whatWillNotChange: [] }, warnings: [],
    reason: 'test', source: 'UI', approvalPhrase: 'APPROVE SX-ABC123', createdAt: '2026-07-13T09:00:00.000Z',
    updatedAt: '2026-07-13T09:01:00.000Z', expiresAt: '2026-07-13T09:30:00.000Z', approvedAt: '2026-07-13T09:01:00.000Z',
    approvedBy: 'owner-1', approvalChannel: 'UI', approvalText: 'APPROVE SX-ABC123', ...overrides,
  } as OwnerActionProposal;
}

describe('OwnerActionExecutorService typed transactional tools', () => {
  let tx: any;
  let prisma: any;
  let reader: { snapshot: jest.Mock };
  let audit: { logTransactional: jest.Mock };
  let executor: OwnerActionExecutorService;

  beforeEach(() => {
    tx = {
      processedMessage: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      product: {
        update: jest.fn().mockResolvedValue({ id: 'product-1', active: false, price: 55 }),
        findFirst: jest.fn().mockResolvedValue({ id: 'product-1', active: false, price: 55 }),
      },
      branchProduct: {
        update: jest.fn().mockResolvedValue({ id: 'bp-1', price: 55, isAvailable: false }),
        create: jest.fn().mockResolvedValue({ id: 'bp-new', price: 55, isAvailable: false }),
        findFirst: jest.fn().mockResolvedValue({ id: 'bp-1', price: 55, isAvailable: false }),
      },
      priceChangeLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
      inventory: {
        update: jest.fn().mockResolvedValue({ id: 'inventory-1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'inventory-1', minThreshold: 4, currentQty: 10, version: 2 }),
      },
      expense: {
        create: jest.fn().mockResolvedValue({ id: 'expense-1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'expense-1', amount: 500, category: 'utilities', expenseDate: new Date('2026-07-13T10:00:00.000Z') }),
      },
      auditLog: { create: jest.fn() },
    };
    prisma = { $transaction: jest.fn(async (callback: (client: any) => unknown) => callback(tx)) };
    reader = { snapshot: jest.fn() };
    audit = { logTransactional: jest.fn().mockResolvedValue(undefined) };
    executor = new OwnerActionExecutorService(prisma, reader as unknown as OwnerActionReaderService, audit as any);
  });

  const current = (value: OwnerActionProposal) => {
    reader.snapshot.mockResolvedValueOnce({ currentState: value.currentState });
    return value;
  };

  it('updates a global product price and verifies it', async () => {
    const result = await executor.execute(current(proposal('UPDATE_PRODUCT_PRICE')), 'key-1');
    expect(tx.product.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'product-1' } }));
    expect(tx.priceChangeLog.create).toHaveBeenCalledTimes(1);
    expect(result.verified).toBe(true);
  });

  it('updates a branch price override without changing global product price', async () => {
    const input = proposal('UPDATE_PRODUCT_PRICE', {
      branchIds: ['branch-1'],
      currentState: { price: 50, cost: 20, active: true, scope: 'BRANCH', branchProductId: 'bp-1', branchProductAvailable: true },
    });
    input.expectedStateHash = hashOwnerActionState(input.currentState);
    tx.branchProduct.findFirst.mockResolvedValueOnce({ id: 'bp-1', price: 55, isAvailable: true });
    await executor.execute(current(input), 'key-2');
    expect(tx.branchProduct.update).toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('creates a missing branch price override safely', async () => {
    const input = proposal('UPDATE_PRODUCT_PRICE', {
      branchIds: ['branch-1'],
      currentState: { price: 50, cost: 20, active: true, scope: 'BRANCH', branchProductId: null, branchProductAvailable: null },
    });
    input.expectedStateHash = hashOwnerActionState(input.currentState);
    tx.branchProduct.findFirst.mockResolvedValueOnce({ id: 'bp-new', price: 55, isAvailable: true });
    await executor.execute(current(input), 'key-3');
    expect(tx.branchProduct.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ branchId: 'branch-1', productId: 'product-1' }) }));
  });

  it('changes availability only in the approved branch', async () => {
    const input = proposal('UPDATE_PRODUCT_AVAILABILITY');
    const result = await executor.execute(current(input), 'key-4');
    expect(tx.branchProduct.update).toHaveBeenCalledWith({ where: { id: 'bp-1' }, data: { isAvailable: false } });
    expect(result.result.branchId).toBe('branch-1');
  });

  it('disables a product globally through the typed tool', async () => {
    const input = proposal('DISABLE_PRODUCT');
    await executor.execute(current(input), 'key-5');
    expect(tx.product.update).toHaveBeenCalledWith({ where: { id: 'product-1' }, data: { active: false } });
  });

  it('enables a product globally through the typed tool', async () => {
    const input = proposal('ENABLE_PRODUCT');
    tx.product.findFirst.mockResolvedValueOnce({ id: 'product-1', active: true });
    await executor.execute(current(input), 'key-6');
    expect(tx.product.update).toHaveBeenCalledWith({ where: { id: 'product-1' }, data: { active: true } });
  });

  it('updates minimum stock level without changing stock quantity', async () => {
    const input = proposal('UPDATE_MINIMUM_STOCK_LEVEL');
    await executor.execute(current(input), 'key-7');
    const data = tx.inventory.update.mock.calls[0][0].data;
    expect(data.minThreshold).toBeDefined();
    expect(data.currentQty).toBeUndefined();
    expect(data.version).toEqual({ increment: 1 });
  });

  it('creates one approved expense and verifies amount', async () => {
    const input = proposal('CREATE_APPROVED_EXPENSE');
    const result = await executor.execute(current(input), 'key-8');
    expect(tx.expense.create).toHaveBeenCalledTimes(1);
    expect(result.result.amount).toBe(500);
    expect(result.rollback?.supported).toBe(false);
  });

  it('returns duplicate result before any business write', async () => {
    tx.processedMessage.findFirst.mockResolvedValueOnce({ entityId: 'execution-old', status: 'completed' });
    const input = proposal('UPDATE_PRODUCT_PRICE');
    const result = await executor.execute(input, 'same-key');
    expect(result.duplicate).toBe(true);
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(audit.logTransactional).not.toHaveBeenCalled();
  });

  it('throws stale before any business write when current state changed', async () => {
    const input = proposal('UPDATE_PRODUCT_PRICE');
    reader.snapshot.mockResolvedValueOnce({ currentState: { ...input.currentState, price: 52 } });
    await expect(executor.execute(input, 'key-stale')).rejects.toBeInstanceOf(OwnerActionStaleError);
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('writes audit and idempotency in the same transaction after verification', async () => {
    const input = proposal('UPDATE_PRODUCT_PRICE');
    await executor.execute(current(input), 'key-audit');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(audit.logTransactional).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'OWNER_ACTION_EXECUTED', idempotencyKey: 'key-audit' }));
    expect(tx.processedMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: 'key-audit', status: 'completed' }) }));
  });

  it('fails honestly when post-write verification does not match', async () => {
    const input = proposal('UPDATE_PRODUCT_PRICE');
    tx.product.findFirst.mockResolvedValueOnce({ id: 'product-1', price: 54 });
    await expect(executor.execute(current(input), 'key-bad-verify')).rejects.toThrow('Price verification failed');
    expect(tx.processedMessage.create).not.toHaveBeenCalled();
  });
});


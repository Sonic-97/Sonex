import {
  OptimisticConcurrencyToken,
  PageRequest,
  type ConcurrencyResult,
  type AggregateRepository,
  type Page,
  type RepositoryContext,
  type SpecificationEvaluator,
  type Transaction,
  type TransactionScope,
  type UnitOfWork,
} from './persistence';
import { ConcurrencyError, ContractError } from './errors';
import { failure, success } from './result';
import { actorId, correlationId, tenantId } from './identifiers';
import { noCancellation } from './application-core';
import { aggregateVersion, expectedVersion } from './versions';

describe('Persistence contracts', () => {
  const context: RepositoryContext = {
    tenantId: tenantId('tenant-1'),
    correlationId: correlationId('correlation-1'),
    cancellationToken: noCancellation,
  };

  it('validates immutable offset and cursor page requests', () => {
    const request = PageRequest.byOffset(20, 0, [{ field: 'createdAt', direction: 'DESC' }], [{ field: 'status', operator: 'EQ', value: 'OPEN' }]);
    expect(request.limit).toBe(20);
    expect(request.offset).toBe(0);
    expect(Object.isFrozen(request.sort)).toBe(true);
    expect(() => PageRequest.byOffset(0)).toThrow(ContractError);
    try {
      PageRequest.byOffset(0);
    } catch (error) {
      expect((error as ContractError).code).toBe('PERSISTENCE_PAGE_LIMIT_INVALID');
    }
    const cursorRequest = PageRequest.byCursor(20, 'cursor-1');
    expect(cursorRequest.cursor).toBe('cursor-1');
    expect(cursorRequest.offset).toBeUndefined();
  });

  it('supports deterministic optimistic concurrency checks', () => {
    const token = OptimisticConcurrencyToken.expecting(expectedVersion(3));
    expect(token.matches(aggregateVersion(3))).toBe(true);
    expect(token.matches(aggregateVersion(4))).toBe(false);
    expect(Object.isFrozen(token)).toBe(true);
  });

  it('allows an adapter to return a typed concurrency failure without database leakage', async () => {
    interface Check { readonly id: string; }
    const repository: AggregateRepository<Check, string> = {
      async findById(): Promise<Check | undefined> { return undefined; },
      async findPage(): Promise<Page<Check>> { return { items: [], limit: 10, total: 0 }; },
      async save(): Promise<ConcurrencyResult<Check>> { return failure(new ConcurrencyError('PERSISTENCE_CONCURRENCY_CONFLICT', 'stale aggregate')); },
      async remove(): Promise<ConcurrencyResult<void>> { return success(undefined); },
    };
    const outcome = await repository.save({ id: 'check-1' }, OptimisticConcurrencyToken.expecting(expectedVersion(1)), context);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe('PERSISTENCE_CONCURRENCY_CONFLICT');
  });

  it('keeps specifications ORM-independent', () => {
    const evaluator: SpecificationEvaluator = { isSatisfiedBy: (specification, entity) => specification.isSatisfiedBy(entity) };
    expect(evaluator.isSatisfiedBy({ isSatisfiedBy: (value: number) => value > 5 }, 6)).toBe(true);
  });

  it('defines a generic transaction lifecycle with ambient scope lookup', async () => {
    const calls: string[] = [];
    const transaction: Transaction = {
      isolation: 'SERIALIZABLE', supportsNestedScopes: true,
      async commit() { calls.push('commit'); }, async rollback() { calls.push('rollback'); },
    };
    const scope: TransactionScope = {
      transaction, context,
      async commit() { await transaction.commit(); }, async rollback() { await transaction.rollback(); },
    };
    const unitOfWork: UnitOfWork = { async begin() { return scope; }, current() { return scope; } };
    const active = await unitOfWork.begin(context, { isolation: 'SERIALIZABLE', allowNested: true });
    await active.commit();
    await active.rollback();
    expect(unitOfWork.current()).toBe(scope);
    expect(calls).toEqual(['commit', 'rollback']);
  });
});

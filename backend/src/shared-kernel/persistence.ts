import type { CancellationToken } from './application-core';
import type { Specification } from './domain';
import { ConcurrencyError, ContractError } from './errors';
import type { CausationId, CorrelationId, TenantId } from './identifiers';
import type { Result } from './result';
import type { AggregateVersion, ExpectedVersion } from './versions';

export type Cursor = string;
export type Offset = number;
export type SortDirection = 'ASC' | 'DESC';
export type FilterOperator = 'EQ' | 'NEQ' | 'IN' | 'CONTAINS' | 'GT' | 'GTE' | 'LT' | 'LTE';
export type TransactionIsolation = 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';

export interface Sort {
  readonly field: string;
  readonly direction: SortDirection;
}

export interface Filter {
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value: unknown;
}

export class PageRequest {
  private constructor(
    public readonly limit: number,
    public readonly offset?: Offset,
    public readonly cursor?: Cursor,
    public readonly sort: readonly Sort[] = [],
    public readonly filters: readonly Filter[] = [],
  ) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new ContractError('PERSISTENCE_PAGE_LIMIT_INVALID', 'Page limit must be a safe integer between 1 and 500');
    }
    if (offset !== undefined && (!Number.isSafeInteger(offset) || offset < 0)) {
      throw new ContractError('PERSISTENCE_PAGE_OFFSET_INVALID', 'Page offset must be a non-negative safe integer');
    }
    if (offset !== undefined && cursor !== undefined) {
      throw new ContractError('PERSISTENCE_PAGE_MODE_AMBIGUOUS', 'Offset and cursor pagination cannot be combined');
    }
    if (cursor !== undefined && cursor.length === 0) {
      throw new ContractError('PERSISTENCE_PAGE_CURSOR_INVALID', 'Cursor cannot be empty');
    }
    this.sort = Object.freeze(sort.map((item) => Object.freeze({ ...item })));
    this.filters = Object.freeze(filters.map((item) => Object.freeze({ ...item })));
    Object.freeze(this);
  }

  static byOffset(limit: number, offset: Offset = 0, sort: readonly Sort[] = [], filters: readonly Filter[] = []): PageRequest {
    return new PageRequest(limit, offset, undefined, sort, filters);
  }

  static byCursor(limit: number, cursor?: Cursor, sort: readonly Sort[] = [], filters: readonly Filter[] = []): PageRequest {
    return new PageRequest(limit, undefined, cursor, sort, filters);
  }
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly limit: number;
  readonly offset?: Offset;
  readonly nextCursor?: Cursor;
  readonly total?: number;
}

export interface RepositoryContext {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly causationId?: CausationId;
  readonly cancellationToken: CancellationToken;
  readonly transaction?: TransactionScope;
}

export class OptimisticConcurrencyToken {
  private constructor(public readonly expectedVersion: ExpectedVersion) {
    Object.freeze(this);
  }

  static expecting(expectedVersion: ExpectedVersion): OptimisticConcurrencyToken {
    return new OptimisticConcurrencyToken(expectedVersion);
  }

  matches(actualVersion: AggregateVersion): boolean {
    return Number(this.expectedVersion) === Number(actualVersion);
  }
}

export type ConcurrencyResult<T> = Result<T, ConcurrencyError>;

export interface ReadRepository<TEntity, TId> {
  findById(id: TId, context: RepositoryContext): Promise<TEntity | undefined>;
  findPage(request: PageRequest, context: RepositoryContext, specification?: Specification<TEntity>): Promise<Page<TEntity>>;
}

export interface WriteRepository<TAggregate> {
  save(aggregate: TAggregate, token: OptimisticConcurrencyToken | undefined, context: RepositoryContext): Promise<ConcurrencyResult<TAggregate>>;
  remove(aggregate: TAggregate, token: OptimisticConcurrencyToken | undefined, context: RepositoryContext): Promise<ConcurrencyResult<void>>;
}

/** Persistence boundary for aggregate roots only; adapters never expose ORM records. */
export interface AggregateRepository<TAggregate, TId> extends ReadRepository<TAggregate, TId>, WriteRepository<TAggregate> {}

export type Repository<TAggregate, TId> = AggregateRepository<TAggregate, TId>;

export interface SpecificationEvaluator {
  isSatisfiedBy<TEntity>(specification: Specification<TEntity>, entity: TEntity): boolean;
}

export interface Transaction {
  readonly isolation: TransactionIsolation;
  readonly supportsNestedScopes: boolean;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface TransactionScope {
  readonly transaction: Transaction;
  readonly parent?: TransactionScope;
  readonly context: RepositoryContext;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface TransactionOptions {
  readonly isolation?: TransactionIsolation;
  readonly allowNested?: boolean;
}

export interface UnitOfWork {
  begin(context: RepositoryContext, options?: TransactionOptions): Promise<TransactionScope>;
  current(): TransactionScope | undefined;
}

export interface RepositoryFactory {
  create<TAggregate, TId>(name: string): AggregateRepository<TAggregate, TId>;
}

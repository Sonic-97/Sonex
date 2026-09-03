import type { ActorContext, OperationalContext } from './context';
import { ApplicationError, type ErrorDetails } from './errors';
import type { CausationId, CorrelationId, TenantId } from './identifiers';
import { deepFreeze, type DeepReadonly } from './immutable';
import type { Result } from './result';
import type { Instant } from './time';
import type { ValidationIssue } from './validation';

export type ApplicationResult<T> = Result<T, ApplicationError>;

export interface SerializedApplicationError {
  readonly code: string;
  readonly message: string;
  readonly details?: ErrorDetails;
  readonly retryable: boolean;
}

abstract class TypedApplicationError extends ApplicationError {
  protected constructor(code: string, message: string, details?: ErrorDetails, retryable = false) {
    super(code, message, details === undefined ? undefined : deepFreeze({ ...details }), retryable);
  }

  serialize(): SerializedApplicationError {
    return Object.freeze({ code: this.code, message: this.message, details: this.details, retryable: this.retryable });
  }
}

export class ValidationError extends TypedApplicationError {
  constructor(public readonly issues: readonly DeepReadonly<ValidationIssue>[]) {
    const normalized = deepFreeze([...issues]
      .map((issue) => ({ ...issue }))
      .sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code)));
    super('APPLICATION_VALIDATION_FAILED', 'Application request validation failed', { issues: normalized });
    this.issues = normalized;
    Object.freeze(this);
  }
}

export class ConflictError extends TypedApplicationError {
  constructor(message = 'The requested operation conflicts with current state', details?: ErrorDetails) {
    super('APPLICATION_CONFLICT_DETECTED', message, details);
    Object.freeze(this);
  }
}

export class NotFoundError extends TypedApplicationError {
  constructor(message = 'The requested resource was not found', details?: ErrorDetails) {
    super('APPLICATION_RESOURCE_NOT_FOUND', message, details);
    Object.freeze(this);
  }
}

export class UnauthorizedError extends TypedApplicationError {
  constructor(message = 'Authentication is required', details?: ErrorDetails) {
    super('APPLICATION_UNAUTHORIZED_ACCESS', message, details);
    Object.freeze(this);
  }
}

export class ForbiddenError extends TypedApplicationError {
  constructor(message = 'The requested operation is forbidden', details?: ErrorDetails) {
    super('APPLICATION_FORBIDDEN_ACCESS', message, details);
    Object.freeze(this);
  }
}

export class BusinessRuleViolation extends TypedApplicationError {
  constructor(message: string, details?: ErrorDetails) {
    super('APPLICATION_BUSINESS_RULE_VIOLATION', message, details);
    Object.freeze(this);
  }
}

export class OperationCancelledError extends TypedApplicationError {
  constructor(details?: ErrorDetails) {
    super('APPLICATION_OPERATION_CANCELLED', 'The operation was cancelled', details);
    Object.freeze(this);
  }
}

export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  throwIfCancellationRequested(): void;
}

export const noCancellation: CancellationToken = Object.freeze({
  isCancellationRequested: false,
  throwIfCancellationRequested(): void {},
});

export interface RequestContext {
  readonly requestId?: string;
  readonly receivedAt: Instant;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ApplicationContext {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly causationId?: CausationId;
  readonly currentUser: ActorContext;
  readonly currentTime: Instant;
  readonly cancellationToken: CancellationToken;
}

export interface ExecutionContext extends ApplicationContext {
  readonly operational: OperationalContext;
  readonly request: RequestContext;
}

export interface CreateExecutionContextInput {
  readonly operational: OperationalContext;
  readonly correlationId: CorrelationId;
  readonly causationId?: CausationId;
  readonly currentTime: Instant;
  readonly request: RequestContext;
  readonly cancellationToken?: CancellationToken;
}

export function createExecutionContext(input: CreateExecutionContextInput): ExecutionContext {
  const { operational } = input;
  const context: ExecutionContext = {
    tenantId: operational.tenantId,
    correlationId: input.correlationId,
    causationId: input.causationId,
    currentUser: deepFreeze({ ...operational.actor }),
    currentTime: input.currentTime,
    cancellationToken: input.cancellationToken ?? noCancellation,
    operational: deepFreeze({ ...operational }),
    request: deepFreeze({ ...input.request, metadata: { ...input.request.metadata } }),
  };
  return deepFreeze(context);
}

export interface UseCase<TInput, TResult> {
  execute(input: Readonly<TInput>, context: ExecutionContext): Promise<ApplicationResult<TResult>>;
}

export abstract class ApplicationService<TInput, TResult> implements UseCase<TInput, TResult> {
  abstract execute(input: Readonly<TInput>, context: ExecutionContext): Promise<ApplicationResult<TResult>>;
}

export interface Command<TType extends string, TPayload> {
  readonly kind: 'COMMAND';
  readonly type: TType;
  readonly payload: Readonly<TPayload>;
}

export interface Query<TType extends string, TPayload> {
  readonly kind: 'QUERY';
  readonly type: TType;
  readonly payload: Readonly<TPayload>;
}

export interface CommandHandler<TCommand extends Command<string, unknown>, TResult> {
  execute(command: TCommand, context: ExecutionContext): Promise<ApplicationResult<TResult>>;
}

export interface QueryHandler<TQuery extends Query<string, unknown>, TResult> {
  execute(query: TQuery, context: ExecutionContext): Promise<ApplicationResult<TResult>>;
}

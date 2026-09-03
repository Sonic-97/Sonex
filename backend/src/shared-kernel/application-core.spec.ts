import {
  ApplicationService,
  BusinessRuleViolation,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  OperationCancelledError,
  UnauthorizedError,
  ValidationError,
  createExecutionContext,
  noCancellation,
  type Command,
  type CommandHandler,
  type Query,
  type QueryHandler,
  type UseCase,
  type ApplicationResult,
} from './application-core';
import { actorId, causationId, correlationId, tenantId } from './identifiers';
import { failure, success } from './result';
import { instant } from './time';

describe('Application Core', () => {
  const context = () => createExecutionContext({
    operational: {
      tenantId: tenantId('tenant-1'),
      actor: { actorId: actorId('staff-1'), actorType: 'STAFF', role: 'CASHIER' },
      channel: 'POS',
    },
    correlationId: correlationId('correlation-1'),
    causationId: causationId('causation-1'),
    currentTime: instant('2026-07-29T10:00:00.000Z'),
    request: { requestId: 'request-1', receivedAt: instant('2026-07-29T10:00:00.000Z'), metadata: { locale: 'ar-EG' } },
  });

  it('returns immutable, discriminated shared-kernel results', () => {
    const ok = success({ accepted: true });
    const rejected = failure(new ConflictError('already processed'));

    expect(ok).toEqual({ ok: true, value: { accepted: true } });
    expect(rejected.ok).toBe(false);
    expect(Object.isFrozen(ok)).toBe(true);
    expect(Object.isFrozen(rejected)).toBe(true);
  });

  it('normalizes validation issues and serializes application-safe failures', () => {
    const error = new ValidationError([
      { path: 'payload.z', code: 'INVALID', message: 'z is invalid' },
      { path: 'payload.a', code: 'REQUIRED', message: 'a is required' },
    ]);

    expect(error.issues.map((issue) => issue.path)).toEqual(['payload.a', 'payload.z']);
    expect(error.serialize()).toEqual({
      code: 'APPLICATION_VALIDATION_FAILED',
      message: 'Application request validation failed',
      details: { issues: error.issues },
      retryable: false,
    });
  });

  it('provides stable expected-outcome error categories', () => {
    expect(new ConflictError().code).toBe('APPLICATION_CONFLICT_DETECTED');
    expect(new NotFoundError().code).toBe('APPLICATION_RESOURCE_NOT_FOUND');
    expect(new UnauthorizedError().code).toBe('APPLICATION_UNAUTHORIZED_ACCESS');
    expect(new ForbiddenError().code).toBe('APPLICATION_FORBIDDEN_ACCESS');
    expect(new BusinessRuleViolation('check is closed').code).toBe('APPLICATION_BUSINESS_RULE_VIOLATION');
  });

  it('creates an immutable execution context with operational identity and request metadata', () => {
    const execution = context();

    expect(execution.tenantId).toBe(tenantId('tenant-1'));
    expect(execution.currentUser).toEqual(execution.operational.actor);
    expect(execution.request.metadata).toEqual({ locale: 'ar-EG' });
    expect(Object.isFrozen(execution)).toBe(true);
    expect(Object.isFrozen(execution.request.metadata)).toBe(true);
    expect(execution.cancellationToken).toBe(noCancellation);
  });

  it('supports cancellation tokens without framework coupling', () => {
    const cancelled = {
      isCancellationRequested: true,
      throwIfCancellationRequested: (): void => { throw new OperationCancelledError(); },
    };
    expect(() => cancelled.throwIfCancellationRequested()).toThrow(OperationCancelledError);
  });

  it('defines framework-independent use-case and handler contracts', async () => {
    type ApproveCommand = Command<'CHECK_APPROVE', { readonly checkId: string }>;
    type CheckQuery = Query<'CHECK_GET', { readonly checkId: string }>;
    const command: ApproveCommand = { kind: 'COMMAND', type: 'CHECK_APPROVE', payload: { checkId: 'check-1' } };
    const query: CheckQuery = { kind: 'QUERY', type: 'CHECK_GET', payload: { checkId: 'check-1' } };

    class ApproveService extends ApplicationService<ApproveCommand, string> {
      async execute(input: Readonly<ApproveCommand>): Promise<ApplicationResult<string>> {
        return success(input.payload.checkId);
      }
    }
    const useCase: UseCase<ApproveCommand, string> = new ApproveService();
    const commandHandler: CommandHandler<ApproveCommand, string> = { async execute(value) { return success(value.payload.checkId); } };
    const queryHandler: QueryHandler<CheckQuery, string> = { async execute(value) { return success(value.payload.checkId); } };

    await expect(useCase.execute(command, context())).resolves.toEqual(success('check-1'));
    await expect(commandHandler.execute(command, context())).resolves.toEqual(success('check-1'));
    await expect(queryHandler.execute(query, context())).resolves.toEqual(success('check-1'));
  });
});

import type { OperationalContext } from './context'; import type { AggregateId, CausationId, CommandId, CorrelationId, IdempotencyKey } from './identifiers'; import type { Instant } from './time'; import type { ExpectedVersion, SchemaVersion } from './versions';
export interface CommandEnvelope<TType extends string, TPayload, TAggregate extends string = string> {
  readonly commandId: CommandId; readonly commandType: TType; readonly schemaVersion: SchemaVersion; readonly idempotencyKey: IdempotencyKey;
  readonly targetAggregateId?: AggregateId<TAggregate>; readonly expectedVersion?: ExpectedVersion; readonly context: OperationalContext;
  readonly correlationId: CorrelationId; readonly causationId?: CausationId; readonly occurredAt: Instant; readonly payload: Readonly<TPayload>;
}

import type { OperationalContext } from './context'; import type { AggregateId, CausationId, CommandId, CorrelationId, EventId } from './identifiers'; import type { Instant } from './time'; import type { AggregateVersion, EventSequence, SchemaVersion } from './versions';
export interface DomainEventEnvelope<TName extends string, TPayload, TAggregate extends string = string> {
  readonly eventId: EventId; readonly eventName: TName; readonly schemaVersion: SchemaVersion; readonly publishingContext: string;
  readonly aggregateType: TAggregate; readonly aggregateId: AggregateId<TAggregate>; readonly aggregateVersion: AggregateVersion; readonly eventSequence: EventSequence;
  readonly context: OperationalContext; readonly commandId: CommandId; readonly correlationId: CorrelationId; readonly causationId?: CausationId;
  readonly occurredAt: Instant; readonly payload: Readonly<TPayload>;
}

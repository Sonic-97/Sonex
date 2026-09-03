import type { ApplicationResult, ExecutionContext } from './application-core';
import type { CommandEnvelope } from './commands';
import type { ActorContext } from './context';
import { ContractError } from './errors';
import type { DomainId, EventId, IdempotencyKey, CorrelationId, CausationId, TenantId } from './identifiers';
import { domainId } from './identifiers';
import { deepFreeze, type DeepReadonly } from './immutable';
import type { Result } from './result';
import type { Instant, Clock } from './time';
import type { SchemaVersion } from './versions';

export type MessageId = DomainId<'MessageId'>;
export type TraceId = DomainId<'TraceId'>;
export const messageId = (value: string): MessageId => domainId('MessageId', value);
export const traceId = (value: string): TraceId => domainId('TraceId', value);

export type MessageHeaders = Readonly<Record<string, string>>;
export type MessageKind = 'COMMAND' | 'QUERY' | 'EVENT';

export interface MessageMetadata {
  readonly messageId: MessageId;
  readonly correlationId: CorrelationId;
  readonly causationId?: CausationId;
  readonly tenantId: TenantId;
  readonly timestamp: Instant;
  readonly actor: ActorContext;
  readonly source: string;
  readonly version: SchemaVersion;
  readonly traceId?: TraceId;
  readonly retryCount: number;
  readonly idempotencyKey?: IdempotencyKey;
}

export interface CreateMessageMetadataInput extends Omit<MessageMetadata, 'actor' | 'retryCount'> {
  readonly actor: ActorContext;
  readonly retryCount?: number;
}

export function createMessageMetadata(input: CreateMessageMetadataInput): MessageMetadata {
  if (input.source.trim().length === 0) throw new ContractError('MESSAGING_SOURCE_INVALID', 'Message source is required');
  const retryCount = input.retryCount ?? 0;
  if (!Number.isSafeInteger(retryCount) || retryCount < 0) {
    throw new ContractError('MESSAGING_RETRY_COUNT_INVALID', 'Message retry count must be a non-negative safe integer');
  }
  return deepFreeze({ ...input, retryCount, actor: { ...input.actor } });
}

export interface MessageEnvelope<TType extends string, TPayload, TKind extends MessageKind = MessageKind> {
  readonly kind: TKind;
  readonly type: TType;
  readonly payload: DeepReadonly<TPayload>;
  readonly metadata: MessageMetadata;
  readonly headers: MessageHeaders;
}

export interface CreateMessageEnvelopeInput<TType extends string, TPayload, TKind extends MessageKind = MessageKind> {
  readonly kind: TKind;
  readonly type: TType;
  readonly payload: TPayload;
  readonly metadata: MessageMetadata;
  readonly headers?: MessageHeaders;
}

export function createMessageEnvelope<TType extends string, TPayload, TKind extends MessageKind>(input: CreateMessageEnvelopeInput<TType, TPayload, TKind>): MessageEnvelope<TType, TPayload, TKind> {
  if (input.type.trim().length === 0) throw new ContractError('MESSAGING_TYPE_INVALID', 'Message type is required');
  const envelope: MessageEnvelope<TType, TPayload, TKind> = {
    kind: input.kind,
    type: input.type,
    payload: deepFreeze(input.payload),
    metadata: input.metadata,
    headers: Object.freeze({ ...(input.headers ?? {}) }),
  };
  return Object.freeze(envelope);
}

export type EventEnvelope<TType extends string, TPayload> = MessageEnvelope<TType, TPayload, 'EVENT'>;
export type QueryEnvelope<TType extends string, TPayload> = MessageEnvelope<TType, TPayload, 'QUERY'>;

export interface EventSubscriber<TEvent extends EventEnvelope<string, unknown>> {
  readonly subscriptionName: string;
  handle(event: TEvent, context: ExecutionContext): Promise<DeliveryResult>;
}

export type OrderingGuarantee = 'NONE' | 'TENANT' | 'AGGREGATE' | 'GLOBAL';

export interface SubscriptionOptions {
  readonly ordering: OrderingGuarantee;
  readonly retryPolicy?: RetryPolicy;
}

export interface EventPublisher {
  publish<TType extends string, TPayload>(event: EventEnvelope<TType, TPayload>, context: ExecutionContext): Promise<DeliveryResult>;
  publishMany(events: readonly EventEnvelope<string, unknown>[], context: ExecutionContext): Promise<readonly DeliveryResult[]>;
}

export interface EventBus extends EventPublisher {
  subscribe<TEvent extends EventEnvelope<string, unknown>>(subscriber: EventSubscriber<TEvent>, options: SubscriptionOptions): Promise<void>;
  unsubscribe(subscriptionName: string): Promise<void>;
  replay(context: ReplayContext): Promise<ReplayResult>;
}

export interface CommandBus {
  dispatch<TType extends string, TPayload, TResult>(command: CommandEnvelope<TType, TPayload>, context: ExecutionContext): Promise<ApplicationResult<TResult>>;
}

export type CommandDispatchNext<TCommand extends CommandEnvelope<string, unknown>, TResult> =
  (command: TCommand, context: ExecutionContext) => Promise<ApplicationResult<TResult>>;

export interface CommandMiddleware<TCommand extends CommandEnvelope<string, unknown>, TResult> {
  execute(command: TCommand, context: ExecutionContext, next: CommandDispatchNext<TCommand, TResult>): Promise<ApplicationResult<TResult>>;
}

export interface QueryBus {
  dispatch<TType extends string, TPayload, TResult>(query: QueryEnvelope<TType, TPayload>, context: ExecutionContext): Promise<ApplicationResult<TResult>>;
}

export type QueryDispatchNext<TQuery extends QueryEnvelope<string, unknown>, TResult> =
  (query: TQuery, context: ExecutionContext) => Promise<ApplicationResult<TResult>>;

export interface QueryMiddleware<TQuery extends QueryEnvelope<string, unknown>, TResult> {
  execute(query: TQuery, context: ExecutionContext, next: QueryDispatchNext<TQuery, TResult>): Promise<ApplicationResult<TResult>>;
}

export type ReplayMode = 'FULL' | 'FROM_CHECKPOINT' | 'RANGE';

export interface ReplayPolicy {
  readonly mode: ReplayMode;
  readonly continueOnFailure: boolean;
  readonly preserveOrdering: boolean;
  readonly maximumMessages?: number;
}

export interface ReplayContext {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly policy: ReplayPolicy;
  readonly fromTimestamp?: Instant;
  readonly toTimestamp?: Instant;
  readonly checkpoint?: string;
}

export interface ReplayResult {
  readonly attempted: number;
  readonly delivered: number;
  readonly failed: number;
  readonly skipped: number;
  readonly completedAt: Instant;
}

export function validateReplayPolicy(policy: ReplayPolicy): ReplayPolicy {
  if (policy.maximumMessages !== undefined && (!Number.isSafeInteger(policy.maximumMessages) || policy.maximumMessages < 1)) {
    throw new ContractError('MESSAGING_REPLAY_LIMIT_INVALID', 'Replay maximum messages must be a positive safe integer');
  }
  return deepFreeze({ ...policy });
}

export type RetryStrategy = 'IMMEDIATE' | 'DELAYED' | 'EXPONENTIAL' | 'DEAD_LETTER';

export interface RetryPolicy {
  readonly strategy: RetryStrategy;
  readonly maximumAttempts: number;
  readonly initialDelayMilliseconds?: number;
  readonly maximumDelayMilliseconds?: number;
  readonly multiplier?: number;
}

export function validateRetryPolicy(policy: RetryPolicy): RetryPolicy {
  if (!Number.isSafeInteger(policy.maximumAttempts) || policy.maximumAttempts < 1) {
    throw new ContractError('MESSAGING_RETRY_ATTEMPTS_INVALID', 'Retry maximum attempts must be a positive safe integer');
  }
  if (policy.strategy === 'EXPONENTIAL' && (policy.multiplier === undefined || policy.multiplier <= 1)) {
    throw new ContractError('MESSAGING_RETRY_MULTIPLIER_INVALID', 'Exponential retry requires a multiplier greater than one');
  }
  if ((policy.strategy === 'DELAYED' || policy.strategy === 'EXPONENTIAL') && (policy.initialDelayMilliseconds === undefined || policy.initialDelayMilliseconds < 0)) {
    throw new ContractError('MESSAGING_RETRY_DELAY_INVALID', 'Delayed retry requires a non-negative initial delay');
  }
  return deepFreeze({ ...policy });
}

export type DeliveryResult =
  | Readonly<{ delivered: true; messageId: MessageId; deliveredAt: Instant }>
  | Readonly<{ delivered: false; messageId: MessageId; reason: string; retryable: boolean }>;

export const delivered = (id: MessageId, deliveredAt: Instant): DeliveryResult => Object.freeze({ delivered: true, messageId: id, deliveredAt });
export const undelivered = (id: MessageId, reason: string, retryable: boolean): DeliveryResult => Object.freeze({ delivered: false, messageId: id, reason, retryable });

export type InboxProcessingState = 'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'FAILED';

export interface InboxMessage {
  readonly metadata: MessageMetadata;
  readonly state: InboxProcessingState;
  readonly receivedAt: Instant;
  readonly processedAt?: Instant;
  readonly failureReason?: string;
}

export interface Inbox {
  find(messageId: MessageId, context: ExecutionContext): Promise<InboxMessage | undefined>;
  findByIdempotencyKey(key: IdempotencyKey, context: ExecutionContext): Promise<InboxMessage | undefined>;
  store(message: InboxMessage, context: ExecutionContext): Promise<void>;
  markProcessing(messageId: MessageId, context: ExecutionContext): Promise<void>;
  markProcessed(messageId: MessageId, processedAt: Instant, context: ExecutionContext): Promise<void>;
  markFailed(messageId: MessageId, reason: string, context: ExecutionContext): Promise<void>;
}

export type OutboxState = 'PENDING' | 'PUBLISHED' | 'FAILED';

export interface OutboxMessage<TType extends string = string, TPayload = unknown> {
  readonly envelope: EventEnvelope<TType, TPayload>;
  readonly state: OutboxState;
  readonly storedAt: Instant;
  readonly publishedAt?: Instant;
  readonly failureReason?: string;
}

export interface Outbox {
  store(message: OutboxMessage, context: ExecutionContext): Promise<void>;
  pending(context: ExecutionContext, request: Readonly<{ limit: number }>): Promise<readonly OutboxMessage[]>;
  markPublished(messageId: MessageId, publishedAt: Instant, context: ExecutionContext): Promise<void>;
  markFailed(messageId: MessageId, reason: string, context: ExecutionContext): Promise<void>;
  markForRetry(messageId: MessageId, nextAttemptAt: Instant, context: ExecutionContext): Promise<void>;
}

export interface DeadLetterMessage {
  readonly envelope: MessageEnvelope<string, unknown>;
  readonly reason: string;
  readonly failedAt: Instant;
  readonly retryPolicy: RetryPolicy;
}

export interface DeadLetterPolicy {
  readonly enabled: boolean;
  readonly retainForMilliseconds: number;
}

export interface MessageDispatcher {
  dispatch(message: MessageEnvelope<string, unknown>, context: ExecutionContext): Promise<DeliveryResult>;
}

export interface MessageSerializer {
  serialize(message: MessageEnvelope<string, unknown>): Uint8Array;
}

export interface MessageDeserializer {
  deserialize<TType extends string, TPayload>(payload: Uint8Array): MessageEnvelope<TType, TPayload>;
}

/** Re-exported as a type-level dependency to make clock injection explicit in messaging adapters. */
export type MessageClock = Clock;
export type MessageResult<T> = Result<T, ContractError>;
export type EventMessageId = EventId;

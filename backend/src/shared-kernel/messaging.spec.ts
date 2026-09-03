import {
  createMessageEnvelope,
  createMessageMetadata,
  delivered,
  messageId,
  traceId,
  undelivered,
  validateReplayPolicy,
  validateRetryPolicy,
  type CommandMiddleware,
  type EventBus,
  type Inbox,
  type MessageDeserializer,
  type MessageSerializer,
  type Outbox,
  type ReplayPolicy,
} from './messaging';
import { actorId, correlationId, tenantId } from './identifiers';
import { schemaVersion } from './versions';
import { instant } from './time';
import type { CommandEnvelope } from './commands';

describe('Messaging contracts', () => {
  const metadata = () => createMessageMetadata({
    messageId: messageId('message-1'), correlationId: correlationId('correlation-1'), tenantId: tenantId('tenant-1'),
    timestamp: instant('2026-07-29T12:00:00.000Z'), actor: { actorId: actorId('staff-1'), actorType: 'STAFF' },
    source: 'shared-kernel-test', version: schemaVersion(1), traceId: traceId('trace-1'),
  });

  it('creates deeply immutable message metadata and envelopes', () => {
    const envelope = createMessageEnvelope({ kind: 'EVENT', type: 'CheckOpened', payload: { checkId: 'check-1', nested: { total: 1 } }, metadata: metadata(), headers: { locale: 'ar-EG' } });
    expect(envelope.kind).toBe('EVENT');
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.payload)).toBe(true);
    expect(Object.isFrozen(envelope.headers)).toBe(true);
    expect(Object.isFrozen(envelope.metadata.actor)).toBe(true);
  });

  it('validates message metadata and retry policies', () => {
    expect(() => createMessageMetadata({ ...metadata(), source: ' ' })).toThrow('Message source is required');
    expect(validateRetryPolicy({ strategy: 'EXPONENTIAL', maximumAttempts: 3, initialDelayMilliseconds: 10, multiplier: 2 })).toEqual({ strategy: 'EXPONENTIAL', maximumAttempts: 3, initialDelayMilliseconds: 10, multiplier: 2 });
    expect(() => validateRetryPolicy({ strategy: 'EXPONENTIAL', maximumAttempts: 3, initialDelayMilliseconds: 10, multiplier: 1 })).toThrow('Exponential retry requires a multiplier greater than one');
  });

  it('validates replay policy limits and provides pipeline-compatible middleware contracts', async () => {
    expect(validateReplayPolicy({ mode: 'FULL', continueOnFailure: false, preserveOrdering: true, maximumMessages: 10 }).maximumMessages).toBe(10);
    expect(() => validateReplayPolicy({ mode: 'FULL', continueOnFailure: false, preserveOrdering: true, maximumMessages: 0 })).toThrow('Replay maximum messages must be a positive safe integer');
    type TestCommand = CommandEnvelope<'TEST_COMMAND', { readonly id: string }>;
    const middleware: CommandMiddleware<TestCommand, string> = { async execute(command, context, next) { return next(command, context); } };
    expect(middleware).toBeDefined();
  });

  it('provides deterministic delivery result contracts', () => {
    expect(delivered(messageId('message-1'), instant('2026-07-29T12:00:01.000Z'))).toMatchObject({ delivered: true });
    expect(undelivered(messageId('message-1'), 'broker unavailable', true)).toEqual({ delivered: false, messageId: messageId('message-1'), reason: 'broker unavailable', retryable: true });
  });

  it('defines broker-neutral replay, inbox, outbox, and serialization contracts', () => {
    const replayPolicy: ReplayPolicy = { mode: 'FULL', continueOnFailure: false, preserveOrdering: true, maximumMessages: 100 };
    const eventBus: Pick<EventBus, 'replay'> = { async replay() { return { attempted: 0, delivered: 0, failed: 0, skipped: 0, completedAt: instant('2026-07-29T12:00:00.000Z') }; } };
    const inbox: Pick<Inbox, 'find'> = { async find() { return undefined; } };
    const outbox: Pick<Outbox, 'pending'> = { async pending() { return []; } };
    const serializer: MessageSerializer = { serialize() { return new Uint8Array([1]); } };
    const deserializer: MessageDeserializer = { deserialize() { return createMessageEnvelope({ kind: 'EVENT', type: 'Empty', payload: {}, metadata: metadata() }); } };
    expect(replayPolicy.preserveOrdering).toBe(true);
    expect(eventBus).toBeDefined();
    expect(inbox).toBeDefined();
    expect(outbox).toBeDefined();
    expect(deserializer.deserialize(serializer.serialize(createMessageEnvelope({ kind: 'EVENT', type: 'Empty', payload: {}, metadata: metadata() }))).type).toBe('Empty');
  });
});

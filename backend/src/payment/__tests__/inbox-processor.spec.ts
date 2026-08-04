import { randomUUID } from 'crypto';
import { InMemoryInboxStore } from '../infrastructure/inbox.store';
import { InboxProcessor, EventConsumer } from '../application/inbox-processor';
import { OutboxMessage } from '../application/outbox-message';

function createOutboxMessage(overrides?: Partial<OutboxMessage>): OutboxMessage {
  return {
    messageId: randomUUID(),
    aggregateId: 'pi-1',
    aggregateType: 'PaymentIntent',
    tenantId: 'cafe-1',
    eventType: 'payment.authorized',
    eventVersion: 1,
    occurredAt: new Date(),
    payload: JSON.stringify({ id: 'pi-1' }),
    headers: {},
    correlationId: randomUUID(),
    causationId: randomUUID(),
    status: 'PUBLISHED',
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

class TestConsumer implements EventConsumer {
  readonly consumerId: string;
  handled: OutboxMessage[] = [];
  failNext = false;
  supportedTypes: string[];

  constructor(consumerId: string, supportedTypes: string[] = ['*']) {
    this.consumerId = consumerId;
    this.supportedTypes = supportedTypes;
  }

  canHandle(eventType: string): boolean {
    return this.supportedTypes.includes('*') || this.supportedTypes.includes(eventType);
  }

  async handle(message: OutboxMessage): Promise<boolean> {
    if (this.failNext) {
      this.failNext = false;
      return false;
    }
    this.handled.push(message);
    return true;
  }

  reset(): void {
    this.handled = [];
    this.failNext = false;
  }
}

describe('InboxProcessor (Outbox → Inbox bridge)', () => {
  let store: InMemoryInboxStore;
  let consumer: TestConsumer;

  beforeEach(() => {
    store = new InMemoryInboxStore();
    consumer = new TestConsumer('payment-consumer');
  });

  describe('basic processing', () => {
    it('processes a message and marks inbox as PROCESSED', async () => {
      const processor = new InboxProcessor(store, [consumer]);
      const msg = createOutboxMessage({ eventType: 'payment.authorized' });

      await processor.process(msg);

      expect(consumer.handled.length).toBe(1);
      expect(consumer.handled[0].messageId).toBe(msg.messageId);

      const inboxMsg = await store.findById(msg.messageId, 'payment-consumer');
      expect(inboxMsg!.status).toBe('PROCESSED');
    });

    it('routes to matching consumer only', async () => {
      const consumerA = new TestConsumer('consumer-a', ['payment.authorized']);
      const consumerB = new TestConsumer('consumer-b', ['order.placed']);
      const processor = new InboxProcessor(store, [consumerA, consumerB]);

      await processor.process(createOutboxMessage({ eventType: 'payment.authorized' }));

      expect(consumerA.handled.length).toBe(1);
      expect(consumerB.handled.length).toBe(0);
    });
  });

  describe('idempotency', () => {
    it('does not process a duplicate message', async () => {
      const processor = new InboxProcessor(store, [consumer]);
      const msg = createOutboxMessage({ messageId: 'dup-1' });

      await processor.process(msg);
      await processor.process(msg);

      expect(consumer.handled.length).toBe(1);

      const count = await store.countByStatus('PROCESSED');
      expect(count).toBe(1);
    });
  });

  describe('failure handling', () => {
    it('marks inbox as FAILED when consumer fails', async () => {
      const processor = new InboxProcessor(store, [consumer]);
      consumer.failNext = true;

      await processor.process(createOutboxMessage({ messageId: 'f1' }));

      const inboxMsg = await store.findById('f1', 'payment-consumer');
      expect(inboxMsg!.status).toBe('FAILED');
      expect(inboxMsg!.retryCount).toBe(1);
    });

    it('moves to DEAD_LETTER after exhausting retries', async () => {
      const processor = new InboxProcessor(store, [consumer], { maxRetries: 2 });
      consumer.failNext = true;

      const msg = createOutboxMessage({ messageId: 'd1' });
      await processor.process(msg);

      let inboxMsg = await store.findById('d1', 'payment-consumer');
      expect(inboxMsg!.status).toBe('FAILED');

      consumer.failNext = true;
      await processor.process(msg);

      inboxMsg = await store.findById('d1', 'payment-consumer');
      expect(inboxMsg!.status).toBe('DEAD_LETTER');
    });

    it('recovers after transient failure', async () => {
      const processor = new InboxProcessor(store, [consumer], { maxRetries: 3 });
      consumer.failNext = true;

      const msg = createOutboxMessage({ messageId: 'r1' });

      await processor.process(msg);
      let inboxMsg = await store.findById('r1', 'payment-consumer');
      expect(inboxMsg!.status).toBe('FAILED');
      expect(consumer.handled.length).toBe(0);

      await processor.process(msg);
      inboxMsg = await store.findById('r1', 'payment-consumer');
      expect(inboxMsg!.status).toBe('PROCESSED');
      expect(consumer.handled.length).toBe(1);
    });
  });

  describe('tenant isolation', () => {
    it('preserves tenant in inbox message', async () => {
      const processor = new InboxProcessor(store, [consumer]);

      await processor.process(createOutboxMessage({ messageId: 't1', tenantId: 'cafe-1' }));

      const inboxMsg = await store.findById('t1', 'payment-consumer');
      expect(inboxMsg!.tenantId).toBe('cafe-1');
    });
  });
});

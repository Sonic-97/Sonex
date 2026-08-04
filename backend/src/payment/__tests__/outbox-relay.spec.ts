import { randomUUID } from 'crypto';
import { InMemoryOutboxStore } from '../infrastructure/outbox.store';
import { InMemoryOutboxPublisher } from '../infrastructure/outbox.publisher';
import { InMemoryInboxStore } from '../infrastructure/inbox.store';
import { OutboxRelay } from '../application/outbox-relay';
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
    status: 'PENDING',
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

  constructor(readonly consumerId: string) {}

  canHandle(): boolean { return true; }

  async handle(message: OutboxMessage): Promise<boolean> {
    if (this.failNext) {
      this.failNext = false;
      return false;
    }
    this.handled.push(message);
    return true;
  }
}

describe('OutboxRelay (end-to-end pipeline)', () => {
  let outboxStore: InMemoryOutboxStore;
  let outboxPublisher: InMemoryOutboxPublisher;
  let inboxStore: InMemoryInboxStore;
  let consumer: TestConsumer;
  let inboxProcessor: InboxProcessor;
  let relay: OutboxRelay;

  beforeEach(() => {
    outboxStore = new InMemoryOutboxStore();
    outboxPublisher = new InMemoryOutboxPublisher();
    inboxStore = new InMemoryInboxStore();
    consumer = new TestConsumer('payment-consumer');
    inboxProcessor = new InboxProcessor(inboxStore, [consumer]);
    relay = new OutboxRelay(outboxStore, outboxPublisher, inboxProcessor);
  });

  afterEach(() => {
    relay.stop();
  });

  describe('tick', () => {
    it('publishes pending messages and delivers to consumer', async () => {
      await outboxStore.save(createOutboxMessage({ messageId: 'm1' }));
      await outboxStore.save(createOutboxMessage({ messageId: 'm2' }));

      await relay.tick();

      expect(outboxPublisher.published.length).toBe(2);
      expect(consumer.handled.length).toBe(2);

      const msg1 = await outboxStore.findById('m1');
      expect(msg1!.status).toBe('PUBLISHED');

      const inbox1 = await inboxStore.findById('m1', 'payment-consumer');
      expect(inbox1!.status).toBe('PROCESSED');
    });

    it('does not redeliver already published messages', async () => {
      await outboxStore.save(createOutboxMessage({ messageId: 'm3' }));

      await relay.tick();
      await relay.tick();

      expect(outboxPublisher.published.length).toBe(1);
      expect(consumer.handled.length).toBe(1);
    });

    it('marks message as FAILED on publish failure', async () => {
      outboxPublisher.failNext = true;
      await outboxStore.save(createOutboxMessage({ messageId: 'f1' }));

      await relay.tick();

      const msg = await outboxStore.findById('f1');
      expect(msg!.status).toBe('FAILED');
      expect(consumer.handled.length).toBe(0);
    });

    it('marks inbox as FAILED when consumer fails', async () => {
      consumer.failNext = true;
      await outboxStore.save(createOutboxMessage({ messageId: 'c1' }));

      await relay.tick();

      const outboxMsg = await outboxStore.findById('c1');
      expect(outboxMsg!.status).toBe('PUBLISHED');

      const inboxMsg = await inboxStore.findById('c1', 'payment-consumer');
      expect(inboxMsg!.status).toBe('FAILED');
    });

    it('handles empty store without error', async () => {
      await expect(relay.tick()).resolves.not.toThrow();
    });
  });

  describe('lifecycle', () => {
    it('start and stop without error', () => {
      relay.start(10000);
      expect(() => relay.stop()).not.toThrow();
    });
  });
});

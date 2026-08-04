import { randomUUID } from 'crypto';
import { InMemoryInboxStore } from '../infrastructure/inbox.store';
import { InboxMessage, inboxCanTransition } from '../application/inbox';

function createInboxMessage(overrides?: Partial<InboxMessage>): InboxMessage {
  return {
    messageId: randomUUID(),
    consumerId: 'payment-consumer',
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
    status: 'RECEIVED',
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Inbox (Consumer Tracking)', () => {
  let store: InMemoryInboxStore;

  beforeEach(() => {
    store = new InMemoryInboxStore();
  });

  describe('save and idempotency', () => {
    it('saves a received message', async () => {
      await store.save(createInboxMessage({ messageId: 'm1' }));

      const msg = await store.findById('m1', 'payment-consumer');
      expect(msg).not.toBeNull();
      expect(msg!.status).toBe('RECEIVED');
    });

    it('rejects duplicate of an already processed message', async () => {
      await store.save(createInboxMessage({ messageId: 'm2' }));
      await store.updateStatus('m2', 'payment-consumer', 'PROCESSED');

      await store.save(createInboxMessage({ messageId: 'm2' }));

      expect(await store.countByStatus('PROCESSED')).toBe(1);
    });

    it('allows overwrite of a failed message for retry', async () => {
      await store.save(createInboxMessage({ messageId: 'm3' }));
      await store.updateStatus('m3', 'payment-consumer', 'FAILED', 1);

      await store.save(createInboxMessage({ messageId: 'm3', retryCount: 1, status: 'FAILED' }));

      const msg = await store.findById('m3', 'payment-consumer');
      expect(msg!.status).toBe('FAILED');
      expect(msg!.retryCount).toBe(1);
    });
  });

  describe('state transitions', () => {
    it('traverses RECEIVED → PROCESSING → PROCESSED', async () => {
      await store.save(createInboxMessage({ messageId: 't1' }));
      await store.updateStatus('t1', 'payment-consumer', 'PROCESSING');
      await store.updateStatus('t1', 'payment-consumer', 'PROCESSED');

      const msg = await store.findById('t1', 'payment-consumer');
      expect(msg!.status).toBe('PROCESSED');
      expect(msg!.processedAt).toBeInstanceOf(Date);
    });

    it('traverses PROCESSING → FAILED → PROCESSING → PROCESSED', async () => {
      await store.save(createInboxMessage({ messageId: 't2' }));
      await store.updateStatus('t2', 'payment-consumer', 'PROCESSING');
      await store.updateStatus('t2', 'payment-consumer', 'FAILED', 1);
      await store.updateStatus('t2', 'payment-consumer', 'PROCESSING');
      await store.updateStatus('t2', 'payment-consumer', 'PROCESSED');

      const msg = await store.findById('t2', 'payment-consumer');
      expect(msg!.status).toBe('PROCESSED');
    });

    it('rejects invalid transitions', () => {
      expect(inboxCanTransition('PROCESSED', 'RECEIVED')).toBe(false);
      expect(inboxCanTransition('PROCESSED', 'PROCESSING')).toBe(false);
      expect(inboxCanTransition('DEAD_LETTER', 'PROCESSING')).toBe(false);
    });

    it('allows valid transitions', () => {
      expect(inboxCanTransition('RECEIVED', 'PROCESSING')).toBe(true);
      expect(inboxCanTransition('PROCESSING', 'PROCESSED')).toBe(true);
      expect(inboxCanTransition('PROCESSING', 'FAILED')).toBe(true);
      expect(inboxCanTransition('PROCESSING', 'DEAD_LETTER')).toBe(true);
      expect(inboxCanTransition('FAILED', 'PROCESSING')).toBe(true);
      expect(inboxCanTransition('FAILED', 'DEAD_LETTER')).toBe(true);
    });
  });

  describe('dead letter', () => {
    it('moves to DEAD_LETTER after exceeding retries', async () => {
      await store.save(createInboxMessage({ messageId: 'd1' }));
      await store.updateStatus('d1', 'payment-consumer', 'PROCESSING');
      await store.updateStatus('d1', 'payment-consumer', 'FAILED', 1);
      await store.updateStatus('d1', 'payment-consumer', 'PROCESSING');
      await store.updateStatus('d1', 'payment-consumer', 'DEAD_LETTER', 2);

      const msg = await store.findById('d1', 'payment-consumer');
      expect(msg!.status).toBe('DEAD_LETTER');
      expect(msg!.retryCount).toBe(2);
    });
  });

  describe('find pending', () => {
    it('returns RECEIVED and FAILED messages', async () => {
      await store.save(createInboxMessage({ messageId: 'p1', status: 'RECEIVED' }));
      await store.save(createInboxMessage({ messageId: 'p2', status: 'RECEIVED' }));
      await store.save(createInboxMessage({ messageId: 'p3', status: 'PROCESSED' }));
      await store.save(createInboxMessage({ messageId: 'p4', status: 'DEAD_LETTER' }));

      const pending = await store.findPending('payment-consumer');
      expect(pending.length).toBe(2);
      expect(pending.map(m => m.messageId).sort()).toEqual(['p1', 'p2']);
    });

    it('filters by consumer', async () => {
      await store.save(createInboxMessage({ messageId: 'c1', consumerId: 'consumer-a', status: 'RECEIVED' }));
      await store.save(createInboxMessage({ messageId: 'c2', consumerId: 'consumer-b', status: 'RECEIVED' }));

      const pending = await store.findPending('consumer-a');
      expect(pending.length).toBe(1);
      expect(pending[0].messageId).toBe('c1');
    });
  });

  describe('tenant isolation', () => {
    it('preserves tenant information', async () => {
      await store.save(createInboxMessage({ messageId: 'i1', tenantId: 'cafe-1' }));
      await store.save(createInboxMessage({ messageId: 'i2', tenantId: 'cafe-2' }));

      const msg1 = await store.findById('i1', 'payment-consumer');
      const msg2 = await store.findById('i2', 'payment-consumer');
      expect(msg1!.tenantId).toBe('cafe-1');
      expect(msg2!.tenantId).toBe('cafe-2');
    });
  });

  describe('count by status', () => {
    it('counts messages in each status', async () => {
      await store.save(createInboxMessage({ messageId: 's1', status: 'RECEIVED' }));
      await store.save(createInboxMessage({ messageId: 's2', status: 'RECEIVED' }));
      await store.save(createInboxMessage({ messageId: 's3', status: 'PROCESSED' }));

      expect(await store.countByStatus('RECEIVED')).toBe(2);
      expect(await store.countByStatus('PROCESSED')).toBe(1);
    });
  });
});

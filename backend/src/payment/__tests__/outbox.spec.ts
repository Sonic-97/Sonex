import { randomUUID } from 'crypto';
import { UnitOfWorkImpl } from '../infrastructure/unit-of-work.impl';
import { PaymentIntentRepositoryImpl } from '../infrastructure/payment-intent.repository.impl';
import { InMemoryPaymentIntentStore } from '../infrastructure/payment-intent.in-memory-store';
import { PaymentIntentMapper } from '../infrastructure/payment-intent.mapper';
import { InMemoryOutboxStore } from '../infrastructure/outbox.store';
import { InMemoryOutboxPublisher } from '../infrastructure/outbox.publisher';
import { OutboxDispatcher } from '../application/outbox-dispatcher';
import { PaymentIntent } from '../domain/payment-intent.aggregate';
import { Money } from '../domain/value-objects/money';
import { PaymentStatus } from '../domain/value-objects/payment-status';
import { OptimisticConcurrencyError } from '../domain/payment-intent.errors';
import { OutboxMessage, canTransition } from '../application/outbox-message';

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

describe('Transactional Outbox (RFC-027)', () => {
  let store: InMemoryPaymentIntentStore;
  let mapper: PaymentIntentMapper;
  let repo: PaymentIntentRepositoryImpl;
  let outboxStore: InMemoryOutboxStore;
  let publisher: InMemoryOutboxPublisher;
  let uow: UnitOfWorkImpl;
  let dispatcher: OutboxDispatcher;

  beforeEach(() => {
    store = new InMemoryPaymentIntentStore();
    mapper = new PaymentIntentMapper();
    outboxStore = new InMemoryOutboxStore();
    publisher = new InMemoryOutboxPublisher();
    uow = new UnitOfWorkImpl(outboxStore);
    repo = new PaymentIntentRepositoryImpl(store, mapper, uow);
    dispatcher = new OutboxDispatcher(outboxStore, publisher);
  });

  // --- Atomicity: aggregate + outbox ---

  describe('atomic commit', () => {
    it('saves aggregate and outbox message together', async () => {
      uow.begin();
      const intent = PaymentIntent.create('pi-1', 'cafe-1', Money.from('EGP', 100), 'order-1');
      await repo.save(intent);
      uow.registerMessage(createOutboxMessage({ aggregateId: 'pi-1', eventType: 'payment.created' }));
      await uow.commit();

      const loaded = await repo.findById('pi-1', 'cafe-1');
      expect(loaded.status.value).toBe(PaymentStatus.PENDING);

      const count = await outboxStore.countByStatus('PENDING');
      expect(count).toBe(1);
    });

    it('persists multiple messages with multiple aggregates', async () => {
      uow.begin();
      const intent1 = PaymentIntent.create('pi-10', 'cafe-1', Money.from('EGP', 100), 'order-10');
      const intent2 = PaymentIntent.create('pi-11', 'cafe-1', Money.from('EGP', 200), 'order-11');
      await repo.save(intent1);
      await repo.save(intent2);
      uow.registerMessage(createOutboxMessage({ messageId: 'm1', aggregateId: 'pi-10', eventType: 'payment.created' }));
      uow.registerMessage(createOutboxMessage({ messageId: 'm2', aggregateId: 'pi-11', eventType: 'payment.created' }));
      await uow.commit();

      expect(await outboxStore.countByStatus('PENDING')).toBe(2);
    });
  });

  // --- Rollback ---

  describe('rollback', () => {
    it('discards both aggregate save and outbox message on rollback', async () => {
      uow.begin();
      const intent = PaymentIntent.create('pi-2', 'cafe-1', Money.from('EGP', 100), 'order-2');
      await repo.save(intent);
      uow.registerMessage(createOutboxMessage({ aggregateId: 'pi-2' }));
      await uow.rollback();

      await expect(repo.findById('pi-2', 'cafe-1')).rejects.toThrow();
      expect(await outboxStore.countByStatus('PENDING')).toBe(0);
    });

    it('clears pending messages after rollback allowing fresh uow', async () => {
      uow.begin();
      uow.registerMessage(createOutboxMessage({ messageId: 'm1' }));
      await uow.rollback();

      uow.begin();
      uow.registerMessage(createOutboxMessage({ messageId: 'm2' }));
      await uow.commit();

      const msg = await outboxStore.findById('m2');
      expect(msg).not.toBeNull();
      expect(msg!.status).toBe('PENDING');
    });
  });

  // --- Dispatcher ---

  describe('dispatcher', () => {
    it('publishes pending messages', async () => {
      uow.begin();
      uow.registerMessage(createOutboxMessage({ messageId: 'd1', eventType: 'test.event' }));
      await uow.commit();

      const count = await dispatcher.dispatch();
      expect(count).toBe(1);
      expect(publisher.published.length).toBe(1);
      expect(publisher.published[0].messageId).toBe('d1');

      const msg = await outboxStore.findById('d1');
      expect(msg!.status).toBe('PUBLISHED');
    });

    it('does not dispatch already published messages', async () => {
      uow.begin();
      uow.registerMessage(createOutboxMessage({ messageId: 'd2' }));
      await uow.commit();

      await dispatcher.dispatch();
      await dispatcher.dispatch();

      expect(publisher.published.length).toBe(1);
    });
  });

  // --- Retry policy ---

  describe('retry policy', () => {
    it('marks message as FAILED on publish failure and increments retryCount', async () => {
      const dispatcher = new OutboxDispatcher(outboxStore, publisher, { maxRetries: 3 });
      publisher.failNext = true;

      uow.begin();
      uow.registerMessage(createOutboxMessage({ messageId: 'r1' }));
      await uow.commit();

      await dispatcher.dispatch();

      const msg = await outboxStore.findById('r1');
      expect(msg!.status).toBe('FAILED');
      expect(msg!.retryCount).toBe(1);
    });

    it('moves to DEAD_LETTER after exhausting retries', async () => {
      const dispatcher = new OutboxDispatcher(outboxStore, publisher, { maxRetries: 2 });

      uow.begin();
      uow.registerMessage(createOutboxMessage({ messageId: 'r2' }));
      await uow.commit();

      publisher.failNext = true;
      await dispatcher.dispatch();

      publisher.failNext = true;
      await dispatcher.dispatch();

      const msg = await outboxStore.findById('r2');
      expect(msg!.status).toBe('DEAD_LETTER');
      expect(msg!.retryCount).toBe(2);
    });

    it('recovers after transient failure', async () => {
      const dispatcher = new OutboxDispatcher(outboxStore, publisher, { maxRetries: 3 });

      uow.begin();
      uow.registerMessage(createOutboxMessage({ messageId: 'r3' }));
      await uow.commit();

      publisher.failNext = true;
      await dispatcher.dispatch();

      let msg = await outboxStore.findById('r3');
      expect(msg!.status).toBe('FAILED');

      await dispatcher.dispatch();

      msg = await outboxStore.findById('r3');
      expect(msg!.status).toBe('PUBLISHED');
      expect(publisher.published.length).toBe(1);
    });
  });

  // --- Version conflict aborts both ---

  describe('optimistic concurrency', () => {
    it('does not save outbox message when aggregate version conflicts', async () => {
      const intent = PaymentIntent.create('pi-20', 'cafe-1', Money.from('EGP', 100), 'order-20');
      await repo.save(intent);

      uow.begin();
      const loaded = await repo.findById('pi-20', 'cafe-1');
      loaded.authorize();
      await repo.save(loaded);
      uow.registerMessage(createOutboxMessage({ aggregateId: 'pi-20', eventType: 'payment.authorized' }));

      const external = await repo.findById('pi-20', 'cafe-1');
      external.authorize();
      const snapshot = external.toSnapshot();
      const record = mapper.snapshotToRecord(snapshot);
      await store.saveRecord(record);

      await expect(uow.commit()).rejects.toThrow(OptimisticConcurrencyError);

      const reloaded = await repo.findById('pi-20', 'cafe-1');
      expect(reloaded.status.value).toBe(PaymentStatus.AUTHORIZED);
      expect(await outboxStore.countByStatus('PENDING')).toBe(0);
    });
  });

  // --- Tenant isolation ---

  describe('tenant isolation', () => {
    it('preserves tenant in outbox messages', async () => {
      uow.begin();
      uow.registerMessage(createOutboxMessage({ messageId: 't1', tenantId: 'cafe-1' }));
      uow.registerMessage(createOutboxMessage({ messageId: 't2', tenantId: 'cafe-2' }));
      await uow.commit();

      const msg1 = await outboxStore.findById('t1');
      const msg2 = await outboxStore.findById('t2');
      expect(msg1!.tenantId).toBe('cafe-1');
      expect(msg2!.tenantId).toBe('cafe-2');
    });
  });

  // --- UnitOfWork without outbox ---

  describe('backward compatibility', () => {
    it('works without an outbox store', async () => {
      const plainUow = new UnitOfWorkImpl();
      const plainRepo = new PaymentIntentRepositoryImpl(store, mapper, plainUow);

      plainUow.begin();
      const intent = PaymentIntent.create('pi-30', 'cafe-1', Money.from('EGP', 100), 'order-30');
      await plainRepo.save(intent);
      await plainUow.commit();

      const loaded = await plainRepo.findById('pi-30', 'cafe-1');
      expect(loaded.amount.amount).toBe(100);
    });
  });

  // --- OutboxMessage state transitions ---

  describe('message state transitions', () => {
    it('rejects invalid transition from PUBLISHED to PENDING', () => {
      expect(canTransition('PUBLISHED', 'PENDING')).toBe(false);
      expect(canTransition('PUBLISHED', 'PROCESSING')).toBe(false);
      expect(canTransition('PUBLISHED', 'FAILED')).toBe(false);
      expect(canTransition('PUBLISHED', 'DEAD_LETTER')).toBe(false);
    });

    it('allows valid transitions', () => {
      expect(canTransition('PENDING', 'PROCESSING')).toBe(true);
      expect(canTransition('PROCESSING', 'PUBLISHED')).toBe(true);
      expect(canTransition('PROCESSING', 'FAILED')).toBe(true);
      expect(canTransition('PROCESSING', 'DEAD_LETTER')).toBe(true);
      expect(canTransition('FAILED', 'PENDING')).toBe(true);
      expect(canTransition('FAILED', 'DEAD_LETTER')).toBe(true);
    });

    it('supports retry of FAILED messages', async () => {
      uow.begin();
      uow.registerMessage(createOutboxMessage({ messageId: 's2' }));
      await uow.commit();

      await outboxStore.updateStatus('s2', 'FAILED', 1);

      const pending = await outboxStore.findPending();
      expect(pending.some(m => m.messageId === 's2')).toBe(true);
    });
  });

  // --- Ordering preserved per aggregate ---

  describe('ordering', () => {
    it('preserves creation order of messages per aggregate', async () => {
      uow.begin();
      const intent = PaymentIntent.create('pi-40', 'cafe-1', Money.from('EGP', 100), 'order-40');
      await repo.save(intent);
      uow.registerMessage(createOutboxMessage({ messageId: 'o1', aggregateId: 'pi-40', eventType: 'payment.created' }));
      uow.registerMessage(createOutboxMessage({ messageId: 'o2', aggregateId: 'pi-40', eventType: 'payment.authorized' }));
      await uow.commit();

      await dispatcher.dispatch();

      expect(publisher.published.length).toBe(2);
      expect(publisher.published[0].messageId).toBe('o1');
      expect(publisher.published[1].messageId).toBe('o2');
    });
  });
});

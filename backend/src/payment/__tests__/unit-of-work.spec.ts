import { UnitOfWorkImpl } from '../infrastructure/unit-of-work.impl';
import { PaymentIntentRepositoryImpl } from '../infrastructure/payment-intent.repository.impl';
import { InMemoryPaymentIntentStore } from '../infrastructure/payment-intent.in-memory-store';
import { PaymentIntentMapper } from '../infrastructure/payment-intent.mapper';
import { PaymentIntent } from '../domain/payment-intent.aggregate';
import { Money } from '../domain/value-objects/money';
import { PaymentStatus } from '../domain/value-objects/payment-status';
import { OptimisticConcurrencyError } from '../domain/payment-intent.errors';

describe('UnitOfWork', () => {
  let store: InMemoryPaymentIntentStore;
  let mapper: PaymentIntentMapper;
  let repo: PaymentIntentRepositoryImpl;
  let uow: UnitOfWorkImpl;

  beforeEach(() => {
    store = new InMemoryPaymentIntentStore();
    mapper = new PaymentIntentMapper();
    uow = new UnitOfWorkImpl();
    repo = new PaymentIntentRepositoryImpl(store, mapper, uow);
  });

  describe('basic commit', () => {
    it('persists aggregate when UnitOfWork commits', async () => {
      uow.begin();
      const intent = PaymentIntent.create('pi-1', 'cafe-1', Money.from('EGP', 100), 'order-1');
      await repo.save(intent);
      await uow.commit();

      const loaded = await repo.findById('pi-1', 'cafe-1');
      expect(loaded.status.value).toBe(PaymentStatus.PENDING);
      expect(loaded.aggregateVersion).toBe(1);
    });

    it('does not persist before commit', async () => {
      uow.begin();
      const intent = PaymentIntent.create('pi-2', 'cafe-1', Money.from('EGP', 100), 'order-2');
      await repo.save(intent);

      await expect(repo.findById('pi-2', 'cafe-1')).rejects.toThrow();
    });
  });

  describe('rollback', () => {
    it('discards all pending saves on rollback', async () => {
      uow.begin();
      const intent = PaymentIntent.create('pi-3', 'cafe-1', Money.from('EGP', 100), 'order-3');
      await repo.save(intent);
      await uow.rollback();

      await expect(repo.findById('pi-3', 'cafe-1')).rejects.toThrow();
    });

    it('allows a new unit after rollback', async () => {
      uow.begin();
      const intent = PaymentIntent.create('pi-4', 'cafe-1', Money.from('EGP', 100), 'order-4');
      await repo.save(intent);
      await uow.rollback();

      uow.begin();
      const intent2 = PaymentIntent.create('pi-4', 'cafe-1', Money.from('EGP', 200), 'order-4');
      await repo.save(intent2);
      await uow.commit();

      const loaded = await repo.findById('pi-4', 'cafe-1');
      expect(loaded.amount.amount).toBe(200);
    });
  });

  describe('multiple aggregates in one transaction', () => {
    it('commits multiple aggregates atomically', async () => {
      uow.begin();
      const intent1 = PaymentIntent.create('pi-10', 'cafe-1', Money.from('EGP', 100), 'order-10');
      const intent2 = PaymentIntent.create('pi-11', 'cafe-1', Money.from('EGP', 200), 'order-11');
      const intent3 = PaymentIntent.create('pi-12', 'cafe-2', Money.from('EGP', 300), 'order-12');

      await repo.save(intent1);
      await repo.save(intent2);
      await repo.save(intent3);
      await uow.commit();

      const loaded1 = await repo.findById('pi-10', 'cafe-1');
      const loaded2 = await repo.findById('pi-11', 'cafe-1');
      const loaded3 = await repo.findById('pi-12', 'cafe-2');

      expect(loaded1.amount.amount).toBe(100);
      expect(loaded2.amount.amount).toBe(200);
      expect(loaded3.amount.amount).toBe(300);
    });

    it('rolls back all aggregates on rollback', async () => {
      uow.begin();
      const intent1 = PaymentIntent.create('pi-13', 'cafe-1', Money.from('EGP', 100), 'order-13');
      const intent2 = PaymentIntent.create('pi-14', 'cafe-1', Money.from('EGP', 200), 'order-14');

      await repo.save(intent1);
      await repo.save(intent2);
      await uow.rollback();

      await expect(repo.findById('pi-13', 'cafe-1')).rejects.toThrow();
      await expect(repo.findById('pi-14', 'cafe-1')).rejects.toThrow();
    });
  });

  describe('optimistic concurrency with UnitOfWork', () => {
    it('enforces version check on commit', async () => {
      const intent = PaymentIntent.create('pi-20', 'cafe-1', Money.from('EGP', 100), 'order-20');
      await repo.save(intent);

      uow.begin();
      const loaded = await repo.findById('pi-20', 'cafe-1');
      loaded.authorize();
      await repo.save(loaded);

      const external = await repo.findById('pi-20', 'cafe-1');
      await repo.save(external);

      await expect(uow.commit()).rejects.toThrow(OptimisticConcurrencyError);
    });
  });

  describe('tenant isolation preserved', () => {
    it('saves tenants separately within a UnitOfWork', async () => {
      uow.begin();
      const intent1 = PaymentIntent.create('pi-30a', 'cafe-1', Money.from('EGP', 100), 'order-30');
      const intent2 = PaymentIntent.create('pi-30b', 'cafe-2', Money.from('EGP', 200), 'order-30');

      await repo.save(intent1);
      await repo.save(intent2);
      await uow.commit();

      const loaded1 = await repo.findById('pi-30a', 'cafe-1');
      const loaded2 = await repo.findById('pi-30b', 'cafe-2');

      expect(loaded1.amount.amount).toBe(100);
      expect(loaded2.amount.amount).toBe(200);
    });
  });

  describe('backward compatibility', () => {
    it('saves immediately when no UnitOfWork is active', async () => {
      const intent = PaymentIntent.create('pi-40', 'cafe-1', Money.from('EGP', 100), 'order-40');
      await repo.save(intent);

      const loaded = await repo.findById('pi-40', 'cafe-1');
      expect(loaded.amount.amount).toBe(100);
    });

    it('works with a repository that has no UnitOfWork', async () => {
      const plainRepo = new PaymentIntentRepositoryImpl(store, mapper);
      const intent = PaymentIntent.create('pi-41', 'cafe-1', Money.from('EGP', 100), 'order-41');
      await plainRepo.save(intent);

      const loaded = await plainRepo.findById('pi-41', 'cafe-1');
      expect(loaded.amount.amount).toBe(100);
    });
  });

  describe('transaction lifecycle', () => {
    it('isActive returns false when no transaction', () => {
      expect(uow.isActive()).toBe(false);
    });

    it('isActive returns true during transaction', () => {
      uow.begin();
      expect(uow.isActive()).toBe(true);
    });

    it('isActive returns false after commit', async () => {
      uow.begin();
      await uow.commit();
      expect(uow.isActive()).toBe(false);
    });

    it('isActive returns false after rollback', async () => {
      uow.begin();
      await uow.rollback();
      expect(uow.isActive()).toBe(false);
    });

    it('rejects commit without begin', async () => {
      await expect(uow.commit()).rejects.toThrow('No active UnitOfWork');
    });

    it('rejects registerSave outside active UnitOfWork', () => {
      expect(() => uow.registerSave('test', 'a1', async () => {})).toThrow('no active UnitOfWork');
    });
  });
});

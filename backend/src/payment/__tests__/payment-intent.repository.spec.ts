import { PaymentIntent } from '../domain/payment-intent.aggregate';
import { Money } from '../domain/value-objects/money';
import { PaymentStatus } from '../domain/value-objects/payment-status';
import { SnapshotSerializer, PaymentIntentSnapshot, CURRENT_SNAPSHOT_SCHEMA_VERSION } from '../domain/payment-intent.snapshot';
import { PaymentIntentMapper } from '../infrastructure/payment-intent.mapper';
import { PaymentIntentRepositoryImpl } from '../infrastructure/payment-intent.repository.impl';
import { InMemoryPaymentIntentStore } from '../infrastructure/payment-intent.in-memory-store';
import { PaymentIntentNotFoundError, OptimisticConcurrencyError } from '../domain/payment-intent.errors';

describe('PaymentIntent Repository (Reference Implementation)', () => {
  let store: InMemoryPaymentIntentStore;
  let mapper: PaymentIntentMapper;
  let repo: PaymentIntentRepositoryImpl;

  beforeEach(() => {
    store = new InMemoryPaymentIntentStore();
    mapper = new PaymentIntentMapper();
    repo = new PaymentIntentRepositoryImpl(store, mapper);
  });

  // --- Snapshot round-trip ---

  describe('snapshot round-trip', () => {
    it('creates aggregate and returns identical snapshot', () => {
      const amount = Money.from('EGP', 150.50);
      const intent = PaymentIntent.create('pi-1', 'cafe-1', amount, 'order-1', { source: 'pos' });

      const snapshot = intent.toSnapshot();

      expect(snapshot.id).toBe('pi-1');
      expect(snapshot.tenantId).toBe('cafe-1');
      expect(snapshot.status).toBe('PENDING');
      expect(snapshot.amount.currency).toBe('EGP');
      expect(snapshot.amount.amount).toBe(150.50);
      expect(snapshot.orderId).toBe('order-1');
      expect(snapshot.aggregateVersion).toBe(1);
      expect(snapshot.snapshotSchemaVersion).toBe(CURRENT_SNAPSHOT_SCHEMA_VERSION);
      expect(snapshot.metadata).toEqual({ source: 'pos' });
      expect(snapshot.checksum).toBeTruthy();
    });

    it('toSnapshot → rehydrate → toSnapshot produces identical snapshots', () => {
      const amount = Money.from('EGP', 75.00);
      const intent = PaymentIntent.create('pi-2', 'cafe-1', amount, 'order-2');

      const snapshot1 = intent.toSnapshot();
      const restored = PaymentIntent.rehydrate(snapshot1);
      const snapshot2 = restored.toSnapshot();

      expect(snapshot2).toEqual(snapshot1);
    });

    it('preserves all fields through rehydrate', () => {
      const intent = PaymentIntent.create('pi-3', 'cafe-1', Money.from('USD', 99.99), 'order-3', { channel: 'web' });

      intent.authorize();

      const snapshot = intent.toSnapshot();
      const restored = PaymentIntent.rehydrate(snapshot);

      expect(restored.id).toBe('pi-3');
      expect(restored.tenantId).toBe('cafe-1');
      expect(restored.status.value).toBe(PaymentStatus.AUTHORIZED);
      expect(restored.amount.amount).toBe(99.99);
      expect(restored.amount.currency).toBe('USD');
      expect(restored.orderId).toBe('order-3');
      expect(restored.aggregateVersion).toBe(2);
    });
  });

  // --- Rehydrate rules ---

  describe('rehydrate rules', () => {
    it('returns zero pending events after restore', () => {
      const intent = PaymentIntent.create('pi-4', 'cafe-1', Money.from('EGP', 50), 'order-4');
      const snapshot = intent.toSnapshot();
      const restored = PaymentIntent.rehydrate(snapshot);

      expect(restored.hasPendingEvents()).toBe(false);
    });

    it('does not increment version during rehydrate', () => {
      const intent = PaymentIntent.create('pi-5', 'cafe-1', Money.from('EGP', 50), 'order-5');
      intent.authorize();
      const versionBefore = intent.aggregateVersion;

      const snapshot = intent.toSnapshot();
      const restored = PaymentIntent.rehydrate(snapshot);

      expect(restored.aggregateVersion).toBe(versionBefore);
    });
  });

  // --- Money serialization ---

  describe('money serialization', () => {
    it('preserves precise values through snapshot', () => {
      const original = Money.from('EGP', 123.45);
      const data = original.toSnapshot();
      const restored = Money.fromSnapshot(data);

      expect(restored.amount).toBe(123.45);
      expect(restored.currency).toBe('EGP');
      expect(restored.equals(original)).toBe(true);
    });

    it('rounds to 2 decimal places', () => {
      const money = Money.from('EGP', 10.999);
      expect(money.amount).toBe(11.00);
    });

    it('rejects negative amounts', () => {
      expect(() => Money.from('EGP', -5)).toThrow('Money amount cannot be negative');
    });
  });

  // --- Tenant isolation ---

  describe('tenant isolation', () => {
    it('saves and loads within same tenant', async () => {
      const intent = PaymentIntent.create('pi-10', 'cafe-1', Money.from('EGP', 100), 'order-10');
      await repo.save(intent);

      const loaded = await repo.findById('pi-10', 'cafe-1');
      expect(loaded.id).toBe('pi-10');
    });

    it('throws when loading from different tenant', async () => {
      const intent = PaymentIntent.create('pi-11', 'cafe-1', Money.from('EGP', 100), 'order-11');
      await repo.save(intent);

      await expect(repo.findById('pi-11', 'cafe-2')).rejects.toThrow(PaymentIntentNotFoundError);
    });
  });

  // --- Snapshot checksum validation ---

  describe('checksum validation', () => {
    it('rejects snapshot with tampered checksum', () => {
      const intent = PaymentIntent.create('pi-20', 'cafe-1', Money.from('EGP', 50), 'order-20');
      const snapshot = intent.toSnapshot();

      const tampered: PaymentIntentSnapshot = { ...snapshot, amount: { currency: 'EGP', amount: 9999 } };

      expect(() => PaymentIntent.rehydrate(tampered)).toThrow('checksum mismatch');
    });

    it('accepts snapshot with valid checksum', () => {
      const intent = PaymentIntent.create('pi-21', 'cafe-1', Money.from('EGP', 50), 'order-21');
      const snapshot = intent.toSnapshot();

      expect(() => PaymentIntent.rehydrate(snapshot)).not.toThrow();
    });
  });

  // --- Schema upgrade path ---

  describe('schema upgrade', () => {
    it('migrates version 0 snapshot to current version', () => {
      const intent = PaymentIntent.create('pi-30', 'cafe-1', Money.from('EGP', 50), 'order-30');
      const snapshot = intent.toSnapshot();

      const v0Snapshot: PaymentIntentSnapshot = {
        ...snapshot,
        snapshotSchemaVersion: 0,
      };
      const fixed = SnapshotSerializer.addChecksum(v0Snapshot);

      const restored = PaymentIntent.rehydrate(fixed);
      expect(restored.id).toBe('pi-30');
    });
  });

  // --- Corrupted snapshot rejection ---

  describe('corrupted snapshot rejection', () => {
    it('rejects snapshot with modified content', () => {
      const intent = PaymentIntent.create('pi-40', 'cafe-1', Money.from('EGP', 50), 'order-40');
      const snapshot = intent.toSnapshot();

      const corrupted: PaymentIntentSnapshot = {
        ...snapshot,
        status: 'CAPTURED',
      };

      expect(() => PaymentIntent.rehydrate(corrupted)).toThrow();
    });

    it('rejects snapshot through repository when stored data is corrupted', async () => {
      const intent = PaymentIntent.create('pi-41', 'cafe-1', Money.from('EGP', 50), 'order-41');
      await repo.save(intent);

      const record = await store.loadRecord('pi-41', 'cafe-1');
      const corruptedJson = record!.snapshotJson.replace('"PENDING"', '"CAPTURED"');
      const corruptedRecord = { ...record!, snapshotJson: corruptedJson };
      await store.saveRecord({ ...corruptedRecord, aggregateVersion: corruptedRecord.aggregateVersion + 1 });

      await expect(repo.findById('pi-41', 'cafe-1')).rejects.toThrow();
    });
  });

  // --- Unsupported future schema rejection ---

  describe('unsupported future schema rejection', () => {
    it('rejects snapshot with version above current max', () => {
      const intent = PaymentIntent.create('pi-50', 'cafe-1', Money.from('EGP', 50), 'order-50');
      const snapshot = intent.toSnapshot();

      const futureSnapshot: PaymentIntentSnapshot = {
        ...snapshot,
        snapshotSchemaVersion: 99,
      };

      expect(() => SnapshotSerializer.deserialize(JSON.stringify(futureSnapshot))).toThrow('Unsupported future schema version');
    });
  });

  // --- Optimistic concurrency ---

  describe('optimistic concurrency', () => {
    it('saves new aggregate successfully', async () => {
      const intent = PaymentIntent.create('pi-60', 'cafe-1', Money.from('EGP', 100), 'order-60');

      await expect(repo.save(intent)).resolves.not.toThrow();
    });

    it('rejects save with stale version', async () => {
      const intent = PaymentIntent.create('pi-61', 'cafe-1', Money.from('EGP', 100), 'order-61');
      await repo.save(intent);

      const loaded1 = await repo.findById('pi-61', 'cafe-1');
      const loaded2 = await repo.findById('pi-61', 'cafe-1');

      loaded1.authorize();
      await repo.save(loaded1);

      loaded2.authorize();

      await expect(repo.save(loaded2)).rejects.toThrow(OptimisticConcurrencyError);
    });

    it('increments version on each state transition', async () => {
      const intent = PaymentIntent.create('pi-62', 'cafe-1', Money.from('EGP', 100), 'order-62');
      expect(intent.aggregateVersion).toBe(1);

      await repo.save(intent);

      const loaded = await repo.findById('pi-62', 'cafe-1');
      expect(loaded.aggregateVersion).toBe(1);

      loaded.authorize();
      expect(loaded.aggregateVersion).toBe(2);
    });
  });

  // --- Full lifecycle ---

  describe('full lifecycle', () => {
    it('traverses complete state machine and persists each transition', async () => {
      const intent = PaymentIntent.create('pi-70', 'cafe-1', Money.from('EGP', 200), 'order-70');
      await repo.save(intent);

      let loaded = await repo.findById('pi-70', 'cafe-1');
      expect(loaded.status.value).toBe(PaymentStatus.PENDING);
      expect(loaded.aggregateVersion).toBe(1);

      loaded.authorize();
      await repo.save(loaded);

      loaded = await repo.findById('pi-70', 'cafe-1');
      expect(loaded.status.value).toBe(PaymentStatus.AUTHORIZED);
      expect(loaded.aggregateVersion).toBe(2);

      loaded.capture();
      await repo.save(loaded);

      loaded = await repo.findById('pi-70', 'cafe-1');
      expect(loaded.status.value).toBe(PaymentStatus.CAPTURED);
      expect(loaded.aggregateVersion).toBe(3);

      loaded.refund();
      await repo.save(loaded);

      loaded = await repo.findById('pi-70', 'cafe-1');
      expect(loaded.status.value).toBe(PaymentStatus.REFUNDED);
      expect(loaded.aggregateVersion).toBe(4);
    });

    it('can fail from PENDING', async () => {
      const intent = PaymentIntent.create('pi-71', 'cafe-1', Money.from('EGP', 100), 'order-71');
      await repo.save(intent);

      const loaded = await repo.findById('pi-71', 'cafe-1');
      loaded.fail();
      await repo.save(loaded);

      const failed = await repo.findById('pi-71', 'cafe-1');
      expect(failed.status.value).toBe(PaymentStatus.FAILED);
    });

    it('cannot transition from terminal state', async () => {
      const intent = PaymentIntent.create('pi-72', 'cafe-1', Money.from('EGP', 100), 'order-72');
      intent.authorize();
      intent.capture();
      await repo.save(intent);

      const loaded = await repo.findById('pi-72', 'cafe-1');
      expect(() => loaded.authorize()).toThrow('terminal status');
    });
  });
});

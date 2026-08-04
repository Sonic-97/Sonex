import { StockReservation } from '../domain/stock-reservation.aggregate';
import { StockReservationSerializer } from '../domain/stock-reservation.snapshot';
import { StockReservationMapper } from '../infrastructure/stock-reservation.mapper';
import { StockReservationRepositoryImpl } from '../infrastructure/stock-reservation.repository.impl';
import { StockReservationApplicationService } from '../application/stock-reservation.application';
import {
  StockReservationNotFoundError,
  InvalidStockReservationTransitionError,
} from '../domain/stock-reservation.errors';
import { PersistenceRecord, StockReservationStore } from '../domain/stock-reservation.repository';

function makeReservation(overrides: Partial<{ id: string; status: string; createdAt: Date }> = {}): StockReservation {
  const res = StockReservation.create('cafe-1', 'inv-1', 'order-1', 5);
  (res as any).state.id = overrides.id ?? res.id;
  (res as any).state.createdAt = overrides.createdAt ?? res.createdAt;
  if (overrides.status && overrides.status !== 'ACTIVE') {
    if (overrides.status === 'EXPIRED') res.expire();
    if (overrides.status === 'RELEASED') res.release();
    if (overrides.status === 'CONFIRMED') res.confirm();
  }
  return res;
}

class InMemoryStockReservationStore implements StockReservationStore {
  records = new Map<string, PersistenceRecord>();

  async loadRecord(id: string): Promise<PersistenceRecord | null> {
    return this.records.get(id) ?? null;
  }

  async saveRecord(record: PersistenceRecord, _ledgerReason?: string): Promise<void> {
    this.records.set(record.id, { ...record });
  }

  async findAllActive(): Promise<PersistenceRecord[]> {
    const result: PersistenceRecord[] = [];
    for (const record of this.records.values()) {
      const snapshot = StockReservationSerializer.deserialize(record.snapshotJson);
      if (snapshot.status === 'ACTIVE') {
        result.push(record);
      }
    }
    return result;
  }

  async findActiveCreatedBefore(cutoff: Date): Promise<PersistenceRecord[]> {
    const result: PersistenceRecord[] = [];
    for (const record of this.records.values()) {
      const snapshot = StockReservationSerializer.deserialize(record.snapshotJson);
      if (snapshot.status === 'ACTIVE' && new Date(snapshot.createdAt) < cutoff) {
        result.push(record);
      }
    }
    return result;
  }
}

describe('StockReservation Aggregate', () => {
  it('creates an ACTIVE reservation', () => {
    const res = StockReservation.create('cafe-1', 'inv-1', 'order-1', 5);
    expect(res.status).toBe('ACTIVE');
    expect(res.quantity).toBe(5);
    expect(res.aggregateVersion).toBe(1);
  });

  it('rejects non-positive quantity', () => {
    expect(() => StockReservation.create('cafe-1', 'inv-1', 'order-1', 0)).toThrow();
  });

  it('confirms an ACTIVE reservation', () => {
    const res = StockReservation.create('cafe-1', 'inv-1', 'order-1', 5);
    res.confirm();
    expect(res.status).toBe('CONFIRMED');
    expect(res.confirmedAt).not.toBeNull();
    expect(res.aggregateVersion).toBe(2);
  });

  it('releases an ACTIVE reservation', () => {
    const res = StockReservation.create('cafe-1', 'inv-1', 'order-1', 5);
    res.release();
    expect(res.status).toBe('RELEASED');
    expect(res.releasedAt).not.toBeNull();
  });

  it('expires an ACTIVE reservation', () => {
    const res = StockReservation.create('cafe-1', 'inv-1', 'order-1', 5);
    res.expire();
    expect(res.status).toBe('EXPIRED');
    expect(res.releasedAt).not.toBeNull();
  });

  it('rejects confirm after expiry', () => {
    const res = StockReservation.create('cafe-1', 'inv-1', 'order-1', 5);
    res.expire();
    expect(() => res.confirm()).toThrow(InvalidStockReservationTransitionError);
  });

  it('rejects expire after release', () => {
    const res = StockReservation.create('cafe-1', 'inv-1', 'order-1', 5);
    res.release();
    expect(() => res.expire()).toThrow(InvalidStockReservationTransitionError);
  });

  it('rehydrates from snapshot preserving state', () => {
    const original = StockReservation.create('cafe-1', 'inv-1', 'order-1', 5);
    original.expire();
    const rehydrated = StockReservation.rehydrate(original.toSnapshot());
    expect(rehydrated.status).toBe('EXPIRED');
    expect(rehydrated.quantity).toBe(5);
    expect(rehydrated.releasedAt).not.toBeNull();
  });
});

describe('StockReservationSerializer', () => {
  it('round-trips checksum validation', () => {
    const res = StockReservation.create('cafe-1', 'inv-1', 'order-1', 5);
    const snapshot = res.toSnapshot();
    expect(StockReservationSerializer.validateChecksum(snapshot)).toBe(true);
  });

  it('rejects corrupted snapshot', () => {
    const res = StockReservation.create('cafe-1', 'inv-1', 'order-1', 5);
    const json = StockReservationSerializer.storeJson(res.toSnapshot());
    const corrupted = json.replace('ACTIVE', 'EXPIRED');
    expect(() => StockReservationSerializer.deserialize(corrupted)).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => StockReservationSerializer.deserialize(JSON.stringify({}))).toThrow();
  });
});

describe('StockReservationRepositoryImpl', () => {
  let store: InMemoryStockReservationStore;
  let mapper: StockReservationMapper;
  let repository: StockReservationRepositoryImpl;

  beforeEach(() => {
    store = new InMemoryStockReservationStore();
    mapper = new StockReservationMapper();
    repository = new StockReservationRepositoryImpl(store, mapper);
  });

  it('save persists and findById retrieves', async () => {
    const res = StockReservation.create('cafe-1', 'inv-1', 'order-1', 5);
    await repository.save(res);
    const loaded = await repository.findById(res.id);
    expect(loaded.id).toBe(res.id);
    expect(loaded.status).toBe('ACTIVE');
  });

  it('findById throws for missing reservation', async () => {
    await expect(repository.findById('missing')).rejects.toThrow(StockReservationNotFoundError);
  });

  it('findActiveCreatedBefore returns only stale ACTIVE reservations', async () => {
    const stale = StockReservation.create('cafe-1', 'inv-1', 'order-1', 5);
    (stale as any).state.createdAt = new Date(Date.now() - 3600000);
    const fresh = StockReservation.create('cafe-1', 'inv-1', 'order-2', 3);
    (fresh as any).state.createdAt = new Date();
    await repository.save(stale);
    await repository.save(fresh);

    const found = await repository.findActiveCreatedBefore(new Date(Date.now() - 60000));
    expect(found.length).toBe(1);
    expect(found[0].id).toBe(stale.id);
  });

  it('save uses UnitOfWork when active', async () => {
    const uow = { isActive: () => true, registerSave: jest.fn(), begin: jest.fn(), commit: jest.fn(), rollback: jest.fn(), registerMessage: jest.fn() };
    const repoWithUow = new StockReservationRepositoryImpl(store, mapper, uow);
    const res = StockReservation.create('cafe-1', 'inv-1', 'order-1', 5);
    await repoWithUow.save(res);
    expect(uow.registerSave).toHaveBeenCalledWith('stockReservation', res.id, expect.any(Function));
  });
});

describe('StockReservationApplicationService', () => {
  let store: InMemoryStockReservationStore;
  let mapper: StockReservationMapper;
  let repository: StockReservationRepositoryImpl;
  let service: StockReservationApplicationService;

  beforeEach(() => {
    store = new InMemoryStockReservationStore();
    mapper = new StockReservationMapper();
    repository = new StockReservationRepositoryImpl(store, mapper);
    service = new StockReservationApplicationService(repository);
  });

  it('expires stale reservations and returns details', async () => {
    const stale = StockReservation.create('cafe-1', 'inv-1', 'order-1', 5);
    (stale as any).state.createdAt = new Date(Date.now() - 3600000);
    await repository.save(stale);

    const results = await service.expireStaleReservations(30);
    expect(results.length).toBe(1);
    expect(results[0].reservationId).toBe(stale.id);
    expect(results[0].quantity).toBe(5);
    const loaded = await repository.findById(stale.id);
    expect(loaded.status).toBe('EXPIRED');
  });

  it('returns empty when no stale reservations', async () => {
    const fresh = StockReservation.create('cafe-1', 'inv-1', 'order-1', 5);
    (fresh as any).state.createdAt = new Date();
    await repository.save(fresh);

    const results = await service.expireStaleReservations(30);
    expect(results.length).toBe(0);
  });

  it('returns unique active order ids', async () => {
    await repository.save(StockReservation.create('cafe-1', 'inv-1', 'order-1', 5));
    await repository.save(StockReservation.create('cafe-1', 'inv-2', 'order-1', 3));
    await repository.save(StockReservation.create('cafe-1', 'inv-3', 'order-2', 2));

    const orderIds = await service.getActiveReservationOrderIds();
    expect(orderIds.sort()).toEqual(['order-1', 'order-2']);
  });

  it('releases only active reservations for the given orders', async () => {
    const keep = StockReservation.create('cafe-1', 'inv-1', 'order-keep', 5);
    const release = StockReservation.create('cafe-1', 'inv-2', 'order-drop', 3);
    await repository.save(keep);
    await repository.save(release);

    const count = await service.releaseActiveForOrders(['order-drop']);

    expect(count).toBe(1);
    expect((await repository.findById(release.id)).status).toBe('RELEASED');
    expect((await repository.findById(keep.id)).status).toBe('ACTIVE');
  });

  it('confirms only active reservations for the given orders', async () => {
    const keep = StockReservation.create('cafe-1', 'inv-1', 'order-keep', 5);
    const confirm = StockReservation.create('cafe-1', 'inv-2', 'order-pay', 3);
    await repository.save(keep);
    await repository.save(confirm);

    const count = await service.confirmActiveForOrders(['order-pay']);

    expect(count).toBe(1);
    expect((await repository.findById(confirm.id)).status).toBe('CONFIRMED');
    expect((await repository.findById(keep.id)).status).toBe('ACTIVE');
  });

  it('does not double-release an already released reservation', async () => {
    const res = StockReservation.create('cafe-1', 'inv-1', 'order-1', 5);
    await repository.save(res);
    await service.releaseActiveForOrders(['order-1']);
    await service.releaseActiveForOrders(['order-1']);

    const loaded = await repository.findById(res.id);
    expect(loaded.status).toBe('RELEASED');
  });
});

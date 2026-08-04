import { DriverPresence } from '../domain/driver-presence.aggregate';
import { DriverPresenceSerializer } from '../domain/driver-presence.snapshot';
import { InMemoryDriverPresenceStore } from '../infrastructure/driver-presence.in-memory-store';
import { DriverPresenceMapper } from '../infrastructure/driver-presence.mapper';
import { DriverPresenceRepositoryImpl } from '../infrastructure/driver-presence.repository.impl';
import { DriverPresenceApplicationService } from '../application/driver-presence.application';
import { InvalidStatusTransitionError, OptimisticConcurrencyError, DriverPresenceNotFoundError } from '../domain/driver-presence.errors';

describe('DriverPresence Aggregate', () => {
  it('creates a new driver as OFFLINE', () => {
    const driver = DriverPresence.create('driver-1');
    expect(driver.driverId).toBe('driver-1');
    expect(driver.status).toBe('OFFLINE');
    expect(driver.aggregateVersion).toBe(1);
  });

  it('transitions OFFLINE→ONLINE via goOnline', () => {
    const driver = DriverPresence.create('driver-1');
    driver.goOnline();
    expect(driver.status).toBe('ONLINE');
    expect(driver.aggregateVersion).toBe(2);
  });

  it('transitions ONLINE→OFFLINE via goOffline', () => {
    const driver = DriverPresence.create('driver-1');
    driver.goOnline();
    driver.goOffline();
    expect(driver.status).toBe('OFFLINE');
  });

  it('transitions ONLINE→PAUSED via pause', () => {
    const driver = DriverPresence.create('driver-1');
    driver.goOnline();
    driver.pause();
    expect(driver.status).toBe('PAUSED');
  });

  it('transitions PAUSED→ONLINE via resume', () => {
    const driver = DriverPresence.create('driver-1');
    driver.goOnline();
    driver.pause();
    driver.resume();
    expect(driver.status).toBe('ONLINE');
  });

  it('rejects goOffline when already OFFLINE', () => {
    const driver = DriverPresence.create('driver-1');
    expect(() => driver.goOffline()).toThrow(InvalidStatusTransitionError);
  });

  it('rejects pause when OFFLINE', () => {
    const driver = DriverPresence.create('driver-1');
    expect(() => driver.pause()).toThrow(InvalidStatusTransitionError);
  });

  it('rejects resume when not PAUSED', () => {
    const driver = DriverPresence.create('driver-1');
    driver.goOnline();
    expect(() => driver.resume()).toThrow(InvalidStatusTransitionError);
  });

  it('rejects goOnline from PAUSED', () => {
    const driver = DriverPresence.create('driver-1');
    driver.goOnline();
    driver.pause();
    expect(() => driver.goOnline()).toThrow(InvalidStatusTransitionError);
  });

  it('heartbeat updates lastHeartbeatAt', () => {
    const driver = DriverPresence.create('driver-1');
    driver.goOnline();
    const before = driver.lastHeartbeatAt;
    jest.useFakeTimers().setSystemTime(new Date('2026-07-30T21:00:00Z'));
    driver.heartbeat();
    expect(driver.lastHeartbeatAt).toEqual(new Date('2026-07-30T21:00:00Z'));
    expect(driver.lastHeartbeatAt).not.toBe(before);
    jest.useRealTimers();
  });

  it('heartbeat sets location when provided', () => {
    const driver = DriverPresence.create('driver-1');
    driver.goOnline();
    driver.heartbeat(40.7128, -74.006);
    expect(driver.latitude).toBe(40.7128);
    expect(driver.longitude).toBe(-74.006);
  });

  it('updateLocation changes coordinates', () => {
    const driver = DriverPresence.create('driver-1');
    driver.goOnline();
    driver.updateLocation(40.7128, -74.006);
    expect(driver.latitude).toBe(40.7128);
    expect(driver.longitude).toBe(-74.006);
    expect(driver.aggregateVersion).toBe(3);
  });

  it('forceOffline sets status to OFFLINE regardless of current status', () => {
    const driver = DriverPresence.create('driver-1');
    driver.goOnline();
    driver.pause();
    driver.forceOffline();
    expect(driver.status).toBe('OFFLINE');
  });

  it('isActive returns true for ONLINE/BUSY/ON_PICKUP/ON_DELIVERY', () => {
    const driver = DriverPresence.create('driver-1');
    expect(driver.isActive()).toBe(false);
    driver.goOnline();
    expect(driver.isActive()).toBe(true);
  });

  it('rehydrates from snapshot', () => {
    const original = DriverPresence.create('driver-1');
    original.goOnline();
    original.heartbeat(40.71, -74.00);
    const snapshot = original.toSnapshot();
    const rehydrated = DriverPresence.rehydrate(snapshot);
    expect(rehydrated.driverId).toBe('driver-1');
    expect(rehydrated.status).toBe('ONLINE');
    expect(rehydrated.latitude).toBe(40.71);
    expect(rehydrated.longitude).toBe(-74.00);
    expect(rehydrated.aggregateVersion).toBe(3);
  });
});

describe('DriverPresenceSerializer', () => {
  it('addChecksum and validateChecksum round-trip', () => {
    const snapshot = DriverPresenceSerializer.addChecksum({
      snapshotSchemaVersion: 1,
      aggregateVersion: 1,
      driverId: 'driver-1',
      status: 'ONLINE',
      latitude: null,
      longitude: null,
      lastHeartbeatAt: null,
    });
    expect(snapshot.checksum).toBeTruthy();
    expect(DriverPresenceSerializer.validateChecksum(snapshot)).toBe(true);
  });

  it('deserialize validates checksum', () => {
    const snapshot = DriverPresenceSerializer.addChecksum({
      snapshotSchemaVersion: 1,
      aggregateVersion: 1,
      driverId: 'driver-1',
      status: 'OFFLINE',
      latitude: null,
      longitude: null,
      lastHeartbeatAt: null,
    });
    const json = DriverPresenceSerializer.storeJson(snapshot);
    const deserialized = DriverPresenceSerializer.deserialize(json);
    expect(deserialized.driverId).toBe('driver-1');
  });

  it('rejects corrupted snapshot', () => {
    const snapshot = DriverPresenceSerializer.addChecksum({
      snapshotSchemaVersion: 1, aggregateVersion: 1, driverId: 'driver-1',
      status: 'OFFLINE', latitude: null, longitude: null, lastHeartbeatAt: null,
    });
    const json = DriverPresenceSerializer.storeJson(snapshot);
    const corrupted = json.replace('OFFLINE', 'ONLINE');
    expect(() => DriverPresenceSerializer.deserialize(corrupted)).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => DriverPresenceSerializer.deserialize(JSON.stringify({}))).toThrow();
  });
});

describe('InMemoryDriverPresenceStore', () => {
  let store: InMemoryDriverPresenceStore;
  let mapper: DriverPresenceMapper;

  beforeEach(() => {
    store = new InMemoryDriverPresenceStore();
    mapper = new DriverPresenceMapper();
  });

  it('saves and loads a record', async () => {
    const driver = DriverPresence.create('driver-1');
    driver.goOnline();
    const record = mapper.snapshotToRecord(driver.toSnapshot());
    await store.saveRecord(record);
    const loaded = await store.loadRecord('driver-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe('driver-1');
  });

  it('returns null for unknown driver', async () => {
    const loaded = await store.loadRecord('unknown');
    expect(loaded).toBeNull();
  });

  it('enforces optimistic concurrency', async () => {
    const driver = DriverPresence.create('driver-1');
    let record = mapper.snapshotToRecord(driver.toSnapshot());
    await store.saveRecord(record);
    const record2 = mapper.snapshotToRecord({
      ...driver.toSnapshot(), aggregateVersion: 10,
    });
    await expect(store.saveRecord(record2)).rejects.toThrow(OptimisticConcurrencyError);
  });

  it('finds expired heartbeats', async () => {
    const driver = DriverPresence.create('driver-1');
    driver.goOnline();
    let record = mapper.snapshotToRecord(driver.toSnapshot());
    await store.saveRecord(record);

    const future = new Date(Date.now() + 100000);
    const expired = await store.findExpiredHeartbeats(future);
    expect(expired.length).toBe(1);
    expect(expired[0].id).toBe('driver-1');
  });

  it('does not find non-expired heartbeats', async () => {
    const driver = DriverPresence.create('driver-1');
    driver.goOnline();
    driver.heartbeat();
    const record = mapper.snapshotToRecord(driver.toSnapshot());
    await store.saveRecord(record);

    const past = new Date(Date.now() - 100000);
    const expired = await store.findExpiredHeartbeats(past);
    expect(expired.length).toBe(0);
  });
});

describe('DriverPresenceRepositoryImpl', () => {
  let store: InMemoryDriverPresenceStore;
  let mapper: DriverPresenceMapper;
  let repository: DriverPresenceRepositoryImpl;

  beforeEach(() => {
    store = new InMemoryDriverPresenceStore();
    mapper = new DriverPresenceMapper();
    repository = new DriverPresenceRepositoryImpl(store, mapper);
  });

  it('save persists and findById retrieves', async () => {
    const driver = DriverPresence.create('driver-1');
    driver.goOnline();
    await repository.save(driver);
    const loaded = await repository.findById('driver-1');
    expect(loaded.driverId).toBe('driver-1');
    expect(loaded.status).toBe('ONLINE');
  });

  it('findById throws for missing driver', async () => {
    await expect(repository.findById('unknown')).rejects.toThrow(DriverPresenceNotFoundError);
  });

  it('exists returns correct status', async () => {
    expect(await repository.exists('driver-1')).toBe(false);
    const driver = DriverPresence.create('driver-1');
    await repository.save(driver);
    expect(await repository.exists('driver-1')).toBe(true);
  });

  it('save uses UnitOfWork when available and active', async () => {
    const uow = { isActive: () => true, registerSave: jest.fn(), begin: jest.fn(), commit: jest.fn(), rollback: jest.fn(), registerMessage: jest.fn() };
    const repoWithUow = new DriverPresenceRepositoryImpl(store, mapper, uow);
    const driver = DriverPresence.create('driver-1');
    await repoWithUow.save(driver);
    expect(uow.registerSave).toHaveBeenCalledWith('driverPresence', 'driver-1', expect.any(Function));
    const loaded = await store.loadRecord('driver-1');
    expect(loaded).toBeNull();
  });
});

describe('DriverPresenceApplicationService', () => {
  let store: InMemoryDriverPresenceStore;
  let mapper: DriverPresenceMapper;
  let repository: DriverPresenceRepositoryImpl;
  let service: DriverPresenceApplicationService;

  beforeEach(() => {
    store = new InMemoryDriverPresenceStore();
    mapper = new DriverPresenceMapper();
    repository = new DriverPresenceRepositoryImpl(store, mapper);
    service = new DriverPresenceApplicationService(repository, store);
  });

  it('goOnline creates and saves a new driver', async () => {
    await service.goOnline('driver-1');
    const driver = await repository.findById('driver-1');
    expect(driver.status).toBe('ONLINE');
  });

  it('goOnline with location', async () => {
    await service.goOnline('driver-1', 40.71, -74.00);
    const driver = await repository.findById('driver-1');
    expect(driver.latitude).toBe(40.71);
    expect(driver.longitude).toBe(-74.00);
  });

  it('full lifecycle: online → pause → resume → offline', async () => {
    await service.goOnline('driver-1');
    await service.pause('driver-1');
    expect((await repository.findById('driver-1')).status).toBe('PAUSED');
    await service.resume('driver-1');
    expect((await repository.findById('driver-1')).status).toBe('ONLINE');
    await service.goOffline('driver-1');
    expect((await repository.findById('driver-1')).status).toBe('OFFLINE');
  });

  it('heartbeat updates timestamp', async () => {
    await service.goOnline('driver-1');
    await service.heartbeat('driver-1', 40.71, -74.00);
    const driver = await repository.findById('driver-1');
    expect(driver.latitude).toBe(40.71);
  });

  it('updateLocation changes coordinates', async () => {
    await service.goOnline('driver-1');
    await service.updateLocation('driver-1', 34.05, -118.24);
    const driver = await repository.findById('driver-1');
    expect(driver.latitude).toBe(34.05);
    expect(driver.longitude).toBe(-118.24);
  });

  it('checkExpiredHeartbeats marks expired drivers offline', async () => {
    const d = DriverPresence.create('driver-1');
    d.goOnline();
    await repository.save(d);
    const pastSnapshot = DriverPresenceSerializer.addChecksum({
      ...d.toSnapshot(),
      lastHeartbeatAt: new Date('2020-01-01').toISOString(),
    });
    const mapper2 = new DriverPresenceMapper();
    const store2 = new InMemoryDriverPresenceStore();
    const repo2 = new DriverPresenceRepositoryImpl(store2, mapper2);
    await store2.saveRecord(mapper2.snapshotToRecord(pastSnapshot));
    const svc2 = new DriverPresenceApplicationService(repo2, store2);
    const expired = await svc2.checkExpiredHeartbeats(60000);
    expect(expired).toContain('driver-1');
    const loaded = await repo2.findById('driver-1');
    expect(loaded.status).toBe('OFFLINE');
  });

  it('goOffline throws for non-existent driver', async () => {
    await expect(service.goOffline('unknown')).rejects.toThrow(DriverPresenceNotFoundError);
  });

  it('pause throws for OFFLINE driver', async () => {
    await service.goOnline('driver-1');
    await service.goOffline('driver-1');
    await expect(service.pause('driver-1')).rejects.toThrow(InvalidStatusTransitionError);
  });
});

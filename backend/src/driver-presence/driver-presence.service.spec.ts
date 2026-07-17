import { Test, TestingModule } from '@nestjs/testing';
import { DriverPresenceService } from './driver-presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceEvent } from './driver-presence.types';

function mockPrisma() {
  const store = new Map<string, any>();

  function genId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function applyPrismaOps(record: any, data: any): any {
    const result = { ...record };
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null && 'increment' in value) {
        result[key] = (result[key] || 0) + (value as any).increment;
      } else if (typeof value === 'object' && value !== null && 'decrement' in value) {
        result[key] = (result[key] || 0) - (value as any).decrement;
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  const driver = {
    findUnique: jest.fn(async (args: { where: { id: string } }) => {
      const record = store.get(args.where.id);
      if (!record || !record.cafeId) return null;
      return record;
    }),
    findMany: jest.fn(async (args: { where?: any; select?: any }) => {
      let results = Array.from(store.values()).filter(v => v.cafeId);
      if (args?.where?.driverStatus?.in) {
        results = results.filter(r => args.where.driverStatus.in.includes(r.driverStatus));
      }
      if (args?.where?.lastHeartbeat?.lt) {
        results = results.filter(r => r.lastHeartbeat && r.lastHeartbeat < args.where.lastHeartbeat.lt);
      }
      if (args?.select) {
        results = results.map(r => {
          const obj: any = {};
          for (const key of Object.keys(args.select)) {
            if (key in r) obj[key] = r[key];
          }
          return obj;
        });
      }
      return results;
    }),
    update: jest.fn(async (args: { where: { id: string }; data: any }) => {
      const existing = store.get(args.where.id);
      if (!existing) throw new Error('Not found');
      const updated = applyPrismaOps(existing, args.data);
      updated.updatedAt = new Date();
      store.set(args.where.id, updated);
      return updated;
    }),
  };

  const result: any = { driver };
  return { prisma: result, store };
}

function addDriver(store: Map<string, any>, overrides: any = {}): any {
  const id = `d-${Math.random().toString(36).slice(2, 8)}`;
  const driver = {
    id,
    cafeId: 'cafe-1',
    branchId: 'branch-1',
    name: overrides.name || 'Test Driver',
    phone: `01${Math.random().toString(10).slice(2, 11)}`,
    active: true,
    totalDeliveries: 0,
    totalRevenue: 0,
    newCustomersAcquired: 0,
    bonusEligible: false,
    driverStatus: 'ONLINE',
    merchantZoneId: 'zone-1',
    vehicleType: 'motorcycle',
    currentLatitude: 30.05,
    currentLongitude: 31.24,
    currentLocation: {},
    capacity: 2,
    activeAssignments: 0,
    lastHeartbeat: new Date(),
    acceptanceRate: 0.95,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  store.set(id, driver);
  return driver;
}

describe('DriverPresenceService', () => {
  let service: DriverPresenceService;
  let prisma: any;
  let store: Map<string, any>;

  function createService(config?: any) {
    return new DriverPresenceService(prisma, config);
  }

  beforeEach(async () => {
    const m = mockPrisma();
    prisma = m.prisma;
    store = m.store;
    service = createService();
  });

  it('detects expired heartbeat and transitions driver to OFFLINE', async () => {
    const stale = addDriver(store, {
      name: 'Stale',
      driverStatus: 'ONLINE',
      lastHeartbeat: new Date(Date.now() - 600000),
    });
    const fresh = addDriver(store, {
      name: 'Fresh',
      driverStatus: 'ONLINE',
      lastHeartbeat: new Date(),
    });

    const expired = await service.checkExpiredHeartbeats();
    expect(expired).toContain(stale.id);
    expect(expired).not.toContain(fresh.id);

    const updatedStale = store.get(stale.id);
    expect(updatedStale.driverStatus).toBe('OFFLINE');
  });

  it('handles reconnect — goes online then offline then online again', async () => {
    const d = addDriver(store, { name: 'Reconnect', driverStatus: 'OFFLINE' });

    await service.goOnline(d.id);
    expect(store.get(d.id).driverStatus).toBe('ONLINE');

    await service.goOffline(d.id);
    expect(store.get(d.id).driverStatus).toBe('OFFLINE');

    await service.goOnline(d.id);
    expect(store.get(d.id).driverStatus).toBe('ONLINE');
  });

  it('pause and resume transitions correctly', async () => {
    const d = addDriver(store, { name: 'Pauser', driverStatus: 'ONLINE' });

    await service.pause(d.id);
    expect(store.get(d.id).driverStatus).toBe('PAUSED');

    await service.resume(d.id);
    expect(store.get(d.id).driverStatus).toBe('ONLINE');
  });

  it('pause rejects offline driver', async () => {
    const d = addDriver(store, { name: 'OfflinePause', driverStatus: 'OFFLINE' });
    await expect(service.pause(d.id)).rejects.toThrow('Cannot pause offline driver');
  });

  it('resume rejects non-paused driver', async () => {
    const d = addDriver(store, { name: 'OnlineResume', driverStatus: 'ONLINE' });
    await expect(service.resume(d.id)).rejects.toThrow('Driver is not paused');
  });

  it('updates location and emits LocationUpdated', async () => {
    const d = addDriver(store, { name: 'Mover', currentLatitude: 30.05, currentLongitude: 31.24 });

    const events: PresenceEvent[] = [];
    service.onEvent(e => events.push(e.type as any));

    await service.updateLocation(d.id, 30.10, 31.30);

    const updated = store.get(d.id);
    expect(Number(updated.currentLatitude)).toBe(30.10);
    expect(Number(updated.currentLongitude)).toBe(31.30);
    expect(events).toContain('LocationUpdated');
  });

  it('emits events for each state transition', async () => {
    const d = addDriver(store, { name: 'Emitter', driverStatus: 'OFFLINE' });

    const events: PresenceEvent[] = [];
    service.onEvent(e => events.push(e.type as any));

    await service.goOnline(d.id);
    expect(events).toContain('DriverOnline');

    await service.heartbeat(d.id);
    expect(events).toContain('HeartbeatReceived');

    await service.pause(d.id);
    expect(events).toContain('DriverPaused');

    await service.resume(d.id);
    expect(events).toContain('DriverResumed');

    await service.goOffline(d.id);
    expect(events).toContain('DriverOffline');
  });

  it('goOnline with location updates coordinates', async () => {
    const d = addDriver(store, { name: 'LocOnline', driverStatus: 'OFFLINE', currentLatitude: 0, currentLongitude: 0 });

    await service.goOnline(d.id, 30.50, 31.50);

    const updated = store.get(d.id);
    expect(updated.driverStatus).toBe('ONLINE');
    expect(Number(updated.currentLatitude)).toBe(30.50);
    expect(Number(updated.currentLongitude)).toBe(31.50);
    expect(updated.currentLocation).toEqual({ lat: 30.50, lng: 31.50 });
  });

  it('checkExpiredHeartbeats with short timeout catches stale drivers', async () => {
    const svc = createService({ heartbeatTimeoutMs: 100 });
    const d = addDriver(store, {
      name: 'QuickStale',
      driverStatus: 'ONLINE',
      lastHeartbeat: new Date(Date.now() - 200),
    });

    const expired = await svc.checkExpiredHeartbeats();
    expect(expired).toContain(d.id);
    expect(store.get(d.id).driverStatus).toBe('OFFLINE');
  });
});

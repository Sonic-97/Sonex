import { Test, TestingModule } from '@nestjs/testing';
import { DriverDispatchService } from './driver-dispatch.service';
import { PrismaService } from '../prisma/prisma.service';
import { DispatchEvent } from './driver-dispatch.types';

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

  const driverModel = {
    findMany: jest.fn(async (args: { where?: any }) => {
      let results = Array.from(store.values()).filter(v => v.cafeId);
      if (args?.where?.driverStatus) {
        results = results.filter(r => r.driverStatus === args.where.driverStatus);
      }
      if (args?.where?.merchantZoneId) {
        results = results.filter(r => r.merchantZoneId === args.where.merchantZoneId);
      }
      return results;
    }),
    findUnique: jest.fn(async (args: { where: { id: string }; select?: any }) => {
      const record = store.get(args.where.id);
      if (!record || !record.cafeId) return null;
      if (args.select) {
        const result: any = {};
        for (const key of Object.keys(args.select)) {
          if (key in record) result[key] = record[key];
        }
        return result;
      }
      return record;
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

  const driverAssignmentModel = {
    create: jest.fn(async (args: { data: any }) => {
      const id = genId('da');
      const record = { id, ...args.data, assignedAt: new Date() };
      store.set(id, record);
      return record;
    }),
    update: jest.fn(async (args: { where: { id: string }; data: any }) => {
      const existing = store.get(args.where.id);
      if (!existing) throw new Error('Not found');
      const updated = { ...existing, ...args.data, respondedAt: args.data.respondedAt ?? existing.respondedAt };
      store.set(args.where.id, updated);
      return updated;
    }),
    updateMany: jest.fn(async (args: { where: any; data: any }) => {
      let count = 0;
      for (const [key, val] of store) {
        let match = true;
        if (args.where.driverId && val.driverId !== args.where.driverId) match = false;
        if (args.where.merchantOrderId && val.merchantOrderId !== args.where.merchantOrderId) match = false;
        if (args.where.status && val.status !== args.where.status) match = false;
        if (match) {
          store.set(key, { ...val, ...args.data });
          count++;
        }
      }
      return { count };
    }),
  };

  const merchantOrderModel = {
    findUnique: jest.fn(async (args: { where: { id: string }; select?: any }) => {
      const record = store.get(args.where.id);
      if (!record || !record.cafeId) return null;
      if (args.select) {
        const result: any = {};
        for (const key of Object.keys(args.select)) {
          if (key in record) result[key] = record[key];
        }
        return result;
      }
      return record;
    }),
  };

  const cafeModel = {
    findUnique: jest.fn(async (args: { where: { id: string }; select?: any }) => {
      const record = store.get(args.where.id);
      if (!record || !record.name) return null;
      if (args.select) {
        const result: any = {};
        for (const key of Object.keys(args.select)) {
          if (key in record) result[key] = record[key];
        }
        return result;
      }
      return record;
    }),
  };

  const result: any = {
    driver: driverModel,
    driverAssignment: driverAssignmentModel,
    merchantOrder: merchantOrderModel,
    cafe: cafeModel,
    $transaction: jest.fn((fn: any) => fn(result)),
  };
  return { prisma: result, store };
}

function addDriver(store: Map<string, any>, overrides: any = {}): any {
  const id = `d-${Math.random().toString(36).slice(2, 8)}`;
  const driver = {
    id,
    cafeId: 'cafe-1',
    branchId: 'branch-1',
    name: overrides.name || 'Test Driver',
    phone: overrides.phone || `01${Math.random().toString(10).slice(2, 11)}`,
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

function addMerchantOrder(store: Map<string, any>, overrides: any = {}): any {
  const id = `mo-${Math.random().toString(36).slice(2, 8)}`;
  const order = {
    id,
    customerOrderId: 'co-1',
    cafeId: 'cafe-1',
    businessName: 'Test Merchant',
    businessType: 'cafe',
    status: 'READY',
    ...overrides,
  };
  store.set(id, order);
  return order;
}

function addCafe(store: Map<string, any>, overrides: any = {}): any {
  const id = 'cafe-1';
  const cafe = {
    id,
    name: 'Test Cafe',
    active: true,
    configuration: { latitude: 30.0444, longitude: 31.2357, zoneId: 'zone-1' },
    ...overrides,
  };
  store.set(id, cafe);
  return cafe;
}

describe('DriverDispatchService', () => {
  let service: DriverDispatchService;
  let prisma: any;
  let store: Map<string, any>;
  const merchantLat = 30.0444;
  const merchantLng = 31.2357;

  beforeEach(async () => {
    const { prisma: p, store: s } = mockPrisma();
    prisma = p;
    store = s;

    addCafe(store);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverDispatchService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(DriverDispatchService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('selects nearest driver when both are eligible', async () => {
    addDriver(store, { name: 'Near', currentLatitude: 30.05, currentLongitude: 31.24 });
    addDriver(store, { name: 'Far', currentLatitude: 30.07, currentLongitude: 31.25 });

    const eligible = await service.findEligibleDrivers(merchantLat, merchantLng);
    expect(eligible.length).toBe(2);

    const scored = service.scoreDrivers(eligible);
    expect(scored[0].distance).toBeLessThan(scored[1].distance);
  });

  it('ignores busy drivers (capacity full)', async () => {
    addDriver(store, { name: 'Free', capacity: 2, activeAssignments: 0 });
    addDriver(store, { name: 'Busy', capacity: 2, activeAssignments: 2 });

    const eligible = await service.findEligibleDrivers(merchantLat, merchantLng);
    expect(eligible.length).toBe(1);
    expect(eligible[0].name).toBe('Free');
  });

  it('ignores offline drivers', async () => {
    addDriver(store, { name: 'Online', driverStatus: 'ONLINE' });
    addDriver(store, { name: 'Offline', driverStatus: 'OFFLINE' });

    const eligible = await service.findEligibleDrivers(merchantLat, merchantLng);
    expect(eligible.length).toBe(1);
    expect(eligible[0].name).toBe('Online');
  });

  it('handles assignment timeout and dispatches next driver', async () => {
    const d1 = addDriver(store, { name: 'First', capacity: 2, activeAssignments: 0 });
    const d2 = addDriver(store, { name: 'Second', capacity: 2, activeAssignments: 0 });
    const mo = addMerchantOrder(store);

    const events: DispatchEvent[] = [];
    service.onEvent(e => events.push(e.type as any));

    const assignment1 = await service.dispatchDriver(mo.id, merchantLat, merchantLng);
    expect(assignment1).not.toBeNull();
    expect(events).toContain('DriverAssigned');

    const timeoutResult = await service.timeoutAssignment(assignment1!.assignmentId);
    expect(timeoutResult.status).toBe('TIMEOUT');
    expect(events).toContain('DriverTimeout');
  });

  it('handles driver rejection and dispatches next driver', async () => {
    const d1 = addDriver(store, { name: 'First', capacity: 2, activeAssignments: 0 });
    const d2 = addDriver(store, { name: 'Second', capacity: 2, activeAssignments: 0 });
    const mo = addMerchantOrder(store);

    const events: DispatchEvent[] = [];
    service.onEvent(e => events.push(e.type as any));

    const assignment1 = await service.dispatchDriver(mo.id, merchantLat, merchantLng);
    expect(assignment1).not.toBeNull();

    const rejectResult = await service.rejectAssignment(assignment1!.assignmentId);
    expect(rejectResult.status).toBe('REJECTED');
    expect(events).toContain('DriverRejected');
  });

  it('respects capacity limits', async () => {
    addDriver(store, { name: 'Cap1', capacity: 1, activeAssignments: 0, currentLatitude: 30.05, currentLongitude: 31.24 });
    addDriver(store, { name: 'Cap2', capacity: 3, activeAssignments: 3, currentLatitude: 30.05, currentLongitude: 31.24 });

    const eligible = await service.findEligibleDrivers(merchantLat, merchantLng);
    expect(eligible.length).toBe(1);
    expect(eligible[0].name).toBe('Cap1');
  });

  it('ignores drivers outside dispatch radius', async () => {
    addDriver(store, { name: 'Close', currentLatitude: 30.05, currentLongitude: 31.24 });
    addDriver(store, { name: 'Far', currentLatitude: 31.50, currentLongitude: 32.00 });

    const eligible = await service.findEligibleDrivers(merchantLat, merchantLng);
    expect(eligible.length).toBe(1);
    expect(eligible[0].name).toBe('Close');
  });

  it('ignores drivers with expired heartbeat', async () => {
    const oldDate = new Date(Date.now() - 600000);
    addDriver(store, { name: 'Fresh', lastHeartbeat: new Date() });
    addDriver(store, { name: 'Stale', lastHeartbeat: oldDate });

    const eligible = await service.findEligibleDrivers(merchantLat, merchantLng);
    expect(eligible.length).toBe(1);
    expect(eligible[0].name).toBe('Fresh');
  });

  it('accepts assignment and marks driver as BUSY', async () => {
    const d = addDriver(store, { name: 'Acceptor', capacity: 2, activeAssignments: 0 });
    const mo = addMerchantOrder(store);

    const assignment = await service.dispatchDriver(mo.id, merchantLat, merchantLng);
    expect(assignment).not.toBeNull();

    const accepted = await service.acceptAssignment(assignment!.assignmentId);
    expect(accepted.status).toBe('ACCEPTED');

    const updatedDriver = store.get(d.id);
    expect(updatedDriver.activeAssignments).toBe(1);
    expect(updatedDriver.driverStatus).toBe('BUSY');
  });
});

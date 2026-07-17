import { Test, TestingModule } from '@nestjs/testing';
import { MerchantAvailabilityService } from './merchant-availability.service';
import { PrismaService } from '../prisma/prisma.service';

function mockPrisma() {
  const store = new Map<string, any>();

  function genId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const cafe = {
    findUnique: jest.fn(async (args: { where: { id: string }; select?: any }) => {
      const record = store.get(args.where.id);
      if (!record || !record.name) return null;
      if (args.select) {
        const result: any = {};
        for (const key of Object.keys(args.select)) {
          if (key === 'merchantAvailability') {
            const all = Array.from(maStore.values());
            result.merchantAvailability = all.find(r => r.cafeId === args.where.id) || null;
          } else if (key in record) {
            result[key] = record[key];
          }
        }
        return result;
      }
      return record;
    }),
    findMany: jest.fn(async (args: { where?: any; select?: any }) => {
      let results = Array.from(store.values()).filter(v => v.name);
      if (args?.where?.active != null) {
        results = results.filter(r => r.active === args.where.active);
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
  };

  const merchantOrder = {
    findMany: jest.fn(async (args: { where: { cafeId: string; status: { in: string[] } }; select?: any }) => {
      let results = Array.from(store.values()).filter(v => v.cafeId === args.where.cafeId);
      if (args.where.status?.in) {
        results = results.filter(r => args.where.status.in.includes(r.status));
      }
      if (args.select) {
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
  };

  const maStore = new Map<string, any>();

  const merchantAvailability = {
    findUnique: jest.fn(async (args: { where: { cafeId: string } }) => {
      const all = Array.from(maStore.values());
      return all.find(r => r.cafeId === args.where.cafeId) || null;
    }),
    findMany: jest.fn(async (args: { where: { cafeId: { in: string[] } } }) => {
      return Array.from(maStore.values()).filter(v => args.where.cafeId.in.includes(v.cafeId));
    }),
    upsert: jest.fn(async (args: { where: { cafeId: string }; create: any; update: any }) => {
      const all = Array.from(maStore.values());
      const existing = all.find(r => r.cafeId === args.where.cafeId);
      if (existing) {
        const updated = { ...existing, ...args.update, updatedAt: new Date() };
        maStore.set(existing.id, updated);
        return updated;
      }
      const id = genId('ma');
      const record = { id, ...args.create, updatedAt: new Date() };
      maStore.set(id, record);
      return record;
    }),
  };

  const result: any = { cafe, merchantOrder, merchantAvailability };
  return { prisma: result, store };
}

function addCafe(store: Map<string, any>, overrides: any = {}): any {
  const id = 'cafe-1';
  const cafe = {
    id, name: 'Test Cafe', active: true,
    configuration: {},
    merchantAvailability: undefined as any,
    ...overrides,
  };
  store.set(id, cafe);
  return cafe;
}

function addMerchantOrder(store: Map<string, any>, overrides: any = {}): any {
  const id = `mo-${Math.random().toString(36).slice(2, 8)}`;
  const order = {
    id, cafeId: 'cafe-1', status: 'CREATED',
    preparationTimeMinutes: 15,
    ...overrides,
  };
  store.set(id, order);
  return order;
}

describe('MerchantAvailabilityService', () => {
  let service: MerchantAvailabilityService;
  let prisma: any;
  let store: Map<string, any>;

  beforeEach(async () => {
    const m = mockPrisma();
    prisma = m.prisma;
    store = m.store;

    addCafe(store);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantAvailabilityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MerchantAvailabilityService);
  });

  it('returns OPEN when no active orders', async () => {
    const result = await service.computeAvailability('cafe-1');
    expect(result.status).toBe('OPEN');
    expect(result.queueLength).toBe(0);
    expect(result.activeOrderCount).toBe(0);
  });

  it('transitions to BUSY when orders exceed threshold', async () => {
    addMerchantOrder(store, { cafeId: 'cafe-1', status: 'PREPARING' });
    addMerchantOrder(store, { cafeId: 'cafe-1', status: 'PREPARING' });
    addMerchantOrder(store, { cafeId: 'cafe-1', status: 'PREPARING' });

    const result = await service.computeAvailability('cafe-1');
    expect(result.status).toBe('BUSY');
    expect(result.activeOrderCount).toBe(3);
  });

  it('transitions to VERY_BUSY when near capacity', async () => {
    for (let i = 0; i < 5; i++) {
      addMerchantOrder(store, { cafeId: 'cafe-1', status: 'PREPARING' });
    }

    const result = await service.computeAvailability('cafe-1');
    expect(result.status).toBe('VERY_BUSY');
    expect(result.activeOrderCount).toBe(5);
  });

  it('recovers from BUSY to OPEN when orders complete', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const mo = addMerchantOrder(store, { cafeId: 'cafe-1', status: 'PREPARING' });
      ids.push(mo.id);
    }

    const busy = await service.computeAvailability('cafe-1');
    expect(busy.status).toBe('BUSY');

    for (const id of ids) {
      store.set(id, { ...store.get(id), status: 'COMPLETED' });
    }

    const events: string[] = [];
    service.onEvent(e => events.push(e.type));

    const recovered = await service.computeAvailability('cafe-1');
    expect(events).toContain('MerchantRecovered');
    expect(recovered.status).toBe('OPEN');
  });

  it('emits MerchantBusy event on transition to BUSY', async () => {
    addMerchantOrder(store, { cafeId: 'cafe-1', status: 'PREPARING' });
    addMerchantOrder(store, { cafeId: 'cafe-1', status: 'PREPARING' });
    addMerchantOrder(store, { cafeId: 'cafe-1', status: 'PREPARING' });

    const events: string[] = [];
    service.onEvent(e => events.push(e.type));

    await service.computeAvailability('cafe-1');
    expect(events).toContain('MerchantBusy');
  });

  it('pause and resume transitions correctly', async () => {
    const paused = await service.pause('cafe-1');
    expect(paused.status).toBe('PAUSED');

    const events: string[] = [];
    service.onEvent(e => events.push(e.type));

    const resumed = await service.resume('cafe-1');
    expect(resumed.status).toBe('OPEN');
  });

  it('respects CLOSED when cafe is inactive', async () => {
    store.set('cafe-1', { ...store.get('cafe-1'), active: false });

    const result = await service.computeAvailability('cafe-1');
    expect(result.status).toBe('CLOSED');
  });

  it('calculates ETA based on queue length', async () => {
    for (let i = 0; i < 3; i++) {
      addMerchantOrder(store, { cafeId: 'cafe-1', status: 'PREPARING' });
    }

    const result = await service.computeAvailability('cafe-1');
    expect(result.currentETA).toBe(45);
    expect(result.queueLength).toBe(3);
  });

  it('returns null for unknown cafe availability', async () => {
    const result = await service.getAvailability('nonexistent');
    expect(result).toBeNull();
  });
});

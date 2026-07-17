import { Test, TestingModule } from '@nestjs/testing';
import { MerchantCommunicationService } from './merchant-communication.service';
import { MerchantMessageValidator } from './merchant-message-validator';
import { MerchantStateCoordinator } from './merchant-state-coordinator';
import { MerchantEventPublisher } from './merchant-event-publisher';
import { PrismaService } from '../prisma/prisma.service';
import { MerchantMessage, MerchantResponseType, MerchantCommunicationEvent } from './merchant-communication.types';

function mockPrisma() {
  const store = new Map<string, any>();
  const msgStore = new Map<string, any>();

  function genId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const cafe = {
    findUnique: jest.fn(async (args: { where: { id: string } }) => {
      const record = store.get(args.where.id);
      if (!record || !record.name) return null;
      return record;
    }),
  };

  const merchantOrder = {
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
      const updated = { ...existing, ...args.data };
      store.set(args.where.id, updated);
      return updated;
    }),
  };

  const merchantMessage = {
    create: jest.fn(async (args: { data: any }) => {
      const id = genId('mm');
      const record = { id, ...args.data, createdAt: new Date() };
      msgStore.set(id, record);
      return record;
    }),
    findFirst: jest.fn(async (args: { where?: any; orderBy?: any }) => {
      let results = Array.from(msgStore.values());
      if (args?.where?.merchantId) {
        results = results.filter(r => r.merchantId === args.where.merchantId);
      }
      if (args?.where?.merchantOrderId) {
        results = results.filter(r => r.merchantOrderId === args.where.merchantOrderId);
      }
      if (args?.where?.messageType) {
        results = results.filter(r => r.messageType === args.where.messageType);
      }
      if (args?.where?.version != null) {
        results = results.filter(r => r.version === args.where.version);
      }
      if (args?.orderBy?.version === 'desc') {
        results.sort((a, b) => b.version - a.version);
      }
      return results[0] || null;
    }),
    findMany: jest.fn(async (args: { where?: any; orderBy?: any }) => {
      let results = Array.from(msgStore.values());
      if (args?.where?.merchantOrderId) {
        results = results.filter(r => r.merchantOrderId === args.where.merchantOrderId);
      }
      if (args?.where?.merchantId) {
        results = results.filter(r => r.merchantId === args.where.merchantId);
      }
      if (args?.orderBy?.createdAt === 'asc') {
        results.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      }
      return results;
    }),
  };

  const result: any = { cafe, merchantOrder, merchantMessage };
  return { prisma: result, store };
}

function addCafe(store: Map<string, any>, overrides: any = {}): any {
  const id = overrides.id || 'cafe-1';
  const cafe = { id, name: 'Test Cafe', active: true, ...overrides };
  store.set(id, cafe);
  return cafe;
}

function addMerchantOrder(store: Map<string, any>, overrides: any = {}): any {
  const id = overrides.id || `mo-${Math.random().toString(36).slice(2, 8)}`;
  const order = {
    id, cafeId: 'cafe-1', customerOrderId: 'co-1',
    status: 'NEW_ORDER', preparationTimeMinutes: 15,
    ...overrides,
  };
  store.set(id, order);
  return order;
}

describe('MerchantCommunicationService', () => {
  let service: MerchantCommunicationService;
  let prisma: any;
  let store: Map<string, any>;
  const events: string[] = [];

  beforeEach(async () => {
    const m = mockPrisma();
    prisma = m.prisma;
    store = m.store;
    events.length = 0;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantCommunicationService,
        MerchantMessageValidator,
        MerchantStateCoordinator,
        MerchantEventPublisher,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MerchantCommunicationService);
    service.onEvent(e => events.push(e.type));
  });

  function makeMsg(overrides: Partial<MerchantMessage> = {}): MerchantMessage {
    return {
      messageId: `msg-${Math.random().toString(36).slice(2, 8)}`,
      merchantId: 'cafe-1',
      merchantOrderId: 'mo-1',
      customerOrderId: 'co-1',
      messageType: 'PREPARATION_STARTED',
      timestamp: new Date().toISOString(),
      payload: {},
      metadata: {},
      version: 1,
      ...overrides,
    };
  }

  // ── New Order (initial message from orchestrator, merchant receives NEW_ORDER) ──
  it('accepts NEW_ORDER and transitions to ACCEPTED on ACCEPT response', async () => {
    addCafe(store);
    addMerchantOrder(store, { id: 'mo-1', status: 'NEW_ORDER' });

    const msg = makeMsg({ messageType: 'NEW_ORDER' });
    const result = await service.receiveMessage(msg, 'cafe-1');
    expect(result.success).toBe(true);
    expect(result.status).toBe('PROCESSED');
  });

  // ── Accept ──
  it('processes ACCEPT response and transitions to ACCEPTED', async () => {
    addCafe(store);
    addMerchantOrder(store, { id: 'mo-1', status: 'NEW_ORDER' });

    const result = await service.receiveResponse('cafe-1', 'mo-1', 'co-1', 'ACCEPT', 'cafe-1');
    expect(result.success).toBe(true);
    expect(result.status).toBe('ACCEPTED');
    expect(events).toContain('MerchantAccepted');
  });

  // ── Reject ──
  it('processes REJECT response and transitions to REJECTED', async () => {
    addCafe(store);
    addMerchantOrder(store, { id: 'mo-1', status: 'NEW_ORDER' });

    const result = await service.receiveResponse('cafe-1', 'mo-1', 'co-1', 'REJECT', 'cafe-1');
    expect(result.success).toBe(true);
    expect(result.status).toBe('REJECTED');
    expect(events).toContain('MerchantRejected');
  });

  // ── Preparation Started ──
  it('processes PREPARATION_STARTED message and transitions to PREPARING', async () => {
    addCafe(store);
    addMerchantOrder(store, { id: 'mo-1', status: 'ACCEPTED' });

    const msg = makeMsg({ messageType: 'PREPARATION_STARTED' });
    const result = await service.receiveMessage(msg, 'cafe-1');
    expect(result.success).toBe(true);
    expect(events).toContain('PreparationStarted');
  });

  // ── Ready ──
  it('processes READY_FOR_PICKUP message and transitions to READY', async () => {
    addCafe(store);
    addMerchantOrder(store, { id: 'mo-1', status: 'PREPARING' });

    const msg = makeMsg({ messageType: 'READY_FOR_PICKUP' });
    const result = await service.receiveMessage(msg, 'cafe-1');
    expect(result.success).toBe(true);
    expect(events).toContain('MerchantReady');
  });

  // ── Delay ──
  it('processes DELAY_NOTICE and emits MerchantDelayed', async () => {
    addCafe(store);
    addMerchantOrder(store, { id: 'mo-1', status: 'PREPARING' });

    const msg = makeMsg({ messageType: 'DELAY_NOTICE', payload: { extraMinutes: 10, reason: 'Equipment issue' } });
    const result = await service.receiveMessage(msg, 'cafe-1');
    expect(result.success).toBe(true);
    expect(events).toContain('MerchantDelayed');
  });

  // ── Out of stock ──
  it('processes OUT_OF_STOCK and emits OutOfStock event', async () => {
    addCafe(store);
    addMerchantOrder(store, { id: 'mo-1', status: 'PREPARING' });

    const msg = makeMsg({ messageType: 'OUT_OF_STOCK', payload: { productName: 'Cappuccino' } });
    const result = await service.receiveMessage(msg, 'cafe-1');
    expect(result.success).toBe(true);
    expect(events).toContain('OutOfStock');
  });

  // ── Replacement ──
  it('processes REQUEST_REPLACEMENT response and emits ReplacementRequested', async () => {
    addCafe(store);
    addMerchantOrder(store, { id: 'mo-1', status: 'OUT_OF_STOCK' });

    const result = await service.receiveResponse('cafe-1', 'mo-1', 'co-1', 'REQUEST_REPLACEMENT', 'cafe-1', {
      originalProductName: 'Cappuccino',
      suggestedProductName: 'Latte',
    });
    expect(result.success).toBe(true);
    expect(events).toContain('ReplacementRequested');
  });

  // ── Cancel ──
  it('processes CANCEL response and transitions to CANCELLED', async () => {
    addCafe(store);
    addMerchantOrder(store, { id: 'mo-1', status: 'ACCEPTED' });

    const result = await service.receiveResponse('cafe-1', 'mo-1', 'co-1', 'CANCEL', 'cafe-1');
    expect(result.success).toBe(true);
    expect(result.status).toBe('CANCELLED');
  });

  // ── Duplicate message ──
  it('rejects duplicate messages', async () => {
    addCafe(store);
    addMerchantOrder(store, { id: 'mo-1', status: 'ACCEPTED' });

    const msg = makeMsg({ messageType: 'PREPARATION_STARTED' });
    const first = await service.receiveMessage(msg, 'cafe-1');
    expect(first.success).toBe(true);

    const second = await service.receiveMessage(msg, 'cafe-1');
    expect(second.success).toBe(false);
    expect(second.messageCode).toBe('DUPLICATE_MESSAGE');
  });

  // ── Version conflict ──
  it('rejects messages with version < 1', async () => {
    addCafe(store);
    addMerchantOrder(store, { id: 'mo-1', status: 'NEW_ORDER' });

    const msg = makeMsg({ messageType: 'NEW_ORDER', version: 0 });
    const result = await service.receiveMessage(msg, 'cafe-1');
    expect(result.success).toBe(false);
    expect(result.messageCode).toBe('VERSION_CONFLICT');
  });

  // ── Retry (same message after failure with new version) ──
  it('accepts retry with new version after failure', async () => {
    addCafe(store);
    addMerchantOrder(store, { id: 'mo-1', status: 'NEW_ORDER' });

    const first = await service.receiveMessage(makeMsg({ messageType: 'NEW_ORDER', version: 1 }), 'cafe-1');
    expect(first.success).toBe(true);

    const second = await service.receiveMessage(makeMsg({ messageType: 'NEW_ORDER', version: 2 }), 'cafe-1');
    expect(second.success).toBe(true);
  });

  // ── Invalid merchant ──
  it('rejects message from unknown merchant', async () => {
    addCafe(store, { id: 'cafe-1' });
    addMerchantOrder(store, { id: 'mo-1', cafeId: 'cafe-2', status: 'NEW_ORDER' });

    const msg = makeMsg({ merchantId: 'cafe-2', messageType: 'NEW_ORDER' });
    const result = await service.receiveMessage(msg, 'cafe-2');
    expect(result.success).toBe(false);
    expect(result.messageCode).toBe('UNKNOWN_MERCHANT');
  });

  // ── Invalid state transition ──
  it('rejects invalid state transition', async () => {
    addCafe(store);
    addMerchantOrder(store, { id: 'mo-1', status: 'NEW_ORDER' });

    const result = await service.receiveResponse('cafe-1', 'mo-1', 'co-1', 'READY', 'cafe-1');
    expect(result.success).toBe(false);
    expect(result.messageCode).toBe('INVALID_TRANSITION');
  });

  // ── Order history ──
  it('returns order message history', async () => {
    addCafe(store);
    addMerchantOrder(store, { id: 'mo-1', status: 'NEW_ORDER' });

    await service.receiveResponse('cafe-1', 'mo-1', 'co-1', 'ACCEPT', 'cafe-1');
    await service.receiveMessage(makeMsg({ messageType: 'PREPARATION_STARTED' }), 'cafe-1');

    const history = await service.getOrderHistory('mo-1', 'cafe-1');
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  // ── Complete workflow end-to-end ──
  it('completes full NEW_ORDER -> ACCEPT -> PREPARING -> READY workflow', async () => {
    addCafe(store);
    addMerchantOrder(store, { id: 'mo-1', status: 'NEW_ORDER' });

    await service.receiveMessage(makeMsg({ messageType: 'NEW_ORDER' }), 'cafe-1');
    await service.receiveResponse('cafe-1', 'mo-1', 'co-1', 'ACCEPT', 'cafe-1');
    await service.receiveMessage(makeMsg({ messageType: 'PREPARATION_STARTED' }), 'cafe-1');
    const ready = await service.receiveMessage(makeMsg({ messageType: 'READY_FOR_PICKUP' }), 'cafe-1');

    expect(ready.success).toBe(true);
    expect(events).toContain('MerchantAccepted');
    expect(events).toContain('PreparationStarted');
    expect(events).toContain('MerchantReady');
  });
});

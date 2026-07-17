import { Test, TestingModule } from '@nestjs/testing';
import { QuickActionService, QuickAction, CALLBACK_VERSION, OrderDraft } from './quick-action.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IdempotencyService } from '../../common/idempotency.service';
import { EventBusService } from '../../events/event-bus.service';
import { EventsService } from '../../events/events.service';
import { PersonalizationProfileService } from '../../personalization/personalization-profile.service';
import { CustomerMemoryService } from '../../customer-memory/customer-memory.service';

describe('QuickActionService', () => {
  let service: QuickActionService;

  const mockPrisma = {
    telegramSession: {
      findUnique: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    customer: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'cust-1', name: 'أحمد' }),
      update: jest.fn().mockResolvedValue({}),
    },
    branch: {
      findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }),
    },
    order: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    product: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    staff: {
      findFirst: jest.fn().mockResolvedValue({ id: 'staff-1' }),
    },
    inCafeOrder: {
      create: jest.fn().mockResolvedValue({}),
    },
    processedMessage: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((fn: any) => fn(mockPrisma as any)),
  };

  const mockIdempotency = {
    isProcessed: jest.fn().mockResolvedValue({ duplicated: false }),
    generateKey: jest.fn((...parts: string[]) => parts.filter(Boolean).join(':')),
  };

  const mockEventBus = { publish: jest.fn() };
  const mockEvents = { emitToBarista: jest.fn() };
  const mockPersonalization = {
    getProfile: jest.fn().mockResolvedValue({
      level: 0,
      orderingProfile: {},
    }),
  };
  const mockMemory = {};

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuickActionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: IdempotencyService, useValue: mockIdempotency },
        { provide: EventBusService, useValue: mockEventBus },
        { provide: EventsService, useValue: mockEvents },
        { provide: PersonalizationProfileService, useValue: mockPersonalization },
        { provide: CustomerMemoryService, useValue: mockMemory },
      ],
    }).compile();

    service = module.get<QuickActionService>(QuickActionService);
  });

  // ── Reference ID generation ──
  test('generates a 6-character reference ID', () => {
    const refId = service.generateReferenceId();
    expect(refId).toHaveLength(6);
  });

  test('generates unique reference IDs', () => {
    const a = service.generateReferenceId();
    const b = service.generateReferenceId();
    expect(a).not.toBe(b);
  });

  // ── Callback building ──
  test('buildCallback produces correct format', () => {
    const cb = service.buildCallback(QuickAction.REPEAT_USUAL, 'abc123');
    expect(cb).toBe(`ru:${CALLBACK_VERSION}:abc123`);
  });

  test('buildCallback with extra appends after refId', () => {
    const cb = service.buildCallback(QuickAction.CHANGE_QTY, 'abc123', 'prod-1:3');
    expect(cb).toBe(`cq:${CALLBACK_VERSION}:abc123:prod-1:3`);
  });

  // ── Resolve callback ──
  test('malformed callback is rejected', async () => {
    const result = await service.resolveCallback('bad', 'cafe-1', '12345');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('malformed');
  });

  test('unknown action is rejected', async () => {
    const result = await service.resolveCallback('xx:1:abc123', 'cafe-1', '12345');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('unknown_action');
  });

  test('version mismatch is rejected', async () => {
    const result = await service.resolveCallback('ru:999:abc123', 'cafe-1', '12345');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('version_mismatch');
  });

  test('no session is marked expired', async () => {
    mockPrisma.telegramSession.findUnique.mockResolvedValueOnce(null);
    const result = await service.resolveCallback('ru:1:abc123', 'cafe-1', '12345');
    expect(result.valid).toBe(false);
    expect(result.expired).toBe(true);
    expect(result.error).toBe('no_session');
  });

  test('consumed session is marked expired', async () => {
    mockPrisma.telegramSession.findUnique.mockResolvedValueOnce({
      state: 'completed',
      expiresAt: new Date(Date.now() + 3600000),
      context: null,
    });
    const result = await service.resolveCallback('ru:1:abc123', 'cafe-1', '12345');
    expect(result.valid).toBe(false);
    expect(result.expired).toBe(true);
  });

  test('expired session is marked expired', async () => {
    mockPrisma.telegramSession.findUnique.mockResolvedValueOnce({
      state: 'building_order',
      expiresAt: new Date(Date.now() - 3600000),
      context: null,
    });
    const result = await service.resolveCallback('ru:1:abc123', 'cafe-1', '12345');
    expect(result.valid).toBe(false);
    expect(result.expired).toBe(true);
  });

  test('stale reference ID is rejected', async () => {
    mockPrisma.telegramSession.findUnique.mockResolvedValueOnce({
      state: 'building_order',
      expiresAt: new Date(Date.now() + 3600000),
      context: { draftRefId: 'different' },
    });
    const result = await service.resolveCallback('ru:1:abc123', 'cafe-1', '12345');
    expect(result.valid).toBe(false);
    expect(result.expired).toBe(true);
    expect(result.error).toBe('stale_ref');
  });

  test('valid callback resolves successfully', async () => {
    const draft = { version: 1, items: [], total: 0 };
    mockPrisma.telegramSession.findUnique.mockResolvedValueOnce({
      state: 'building_order',
      expiresAt: new Date(Date.now() + 3600000),
      context: { draft, draftRefId: 'abc123' },
    });
    const result = await service.resolveCallback('cd:1:abc123', 'cafe-1', '12345');
    expect(result.valid).toBe(true);
    expect(result.draft).toEqual(draft);
    expect(result.action).toBe(QuickAction.CONFIRM_DRAFT);
  });

  // ── Save/Load draft ──
  test('saveDraft creates session with upsert', async () => {
    const draft: OrderDraft = { version: 1, createdAt: Date.now(), items: [], total: 0 };
    const refId = await service.saveDraft('12345', 'cafe-1', draft, 'myref');
    expect(refId).toBe('myref');
    expect(mockPrisma.telegramSession.upsert).toHaveBeenCalled();
  });

  test('saveDraft generates refId when not provided', async () => {
    const draft: OrderDraft = { version: 1, createdAt: Date.now(), items: [], total: 0 };
    const refId = await service.saveDraft('12345', 'cafe-1', draft);
    expect(refId).toHaveLength(6);
  });

  test('loadDraft returns null when no session', async () => {
    mockPrisma.telegramSession.findUnique.mockResolvedValueOnce(null);
    const result = await service.loadDraft('12345', 'cafe-1');
    expect(result).toBeNull();
  });

  test('loadDraft returns draft when valid', async () => {
    const draft: OrderDraft = { version: 2, createdAt: Date.now(), items: [], total: 100 };
    mockPrisma.telegramSession.findUnique.mockResolvedValueOnce({
      state: 'building_order',
      context: { draft, draftRefId: 'abc123' },
    });
    const result = await service.loadDraft('12345', 'cafe-1');
    expect(result).not.toBeNull();
    expect(result!.draft.version).toBe(2);
    expect(result!.refId).toBe('abc123');
  });

  // ── Format helpers ──
  test('formatStatus maps all statuses', () => {
    expect(service.formatStatus('NEW')).toContain('جديد');
    expect(service.formatStatus('CONFIRMED')).toContain('تم التأكيد');
    expect(service.formatStatus('READY')).toContain('جاهز');
    expect(service.formatStatus('DELIVERED')).toContain('تم التوصيل');
    expect(service.formatStatus('CANCELLED')).toContain('ملغي');
  });

  test('formatDraftSummary shows items and total', () => {
    const draft: OrderDraft = {
      version: 1,
      createdAt: Date.now(),
      items: [{ productId: 'p1', productName: 'قهوة فاتح', quantity: 2, unitPrice: 15 }],
      total: 30,
      deliveryLocation: { name: 'محل ستايل' },
      paymentMethod: 'كاش',
    };
    const summary = service.formatDraftSummary(draft);
    expect(summary).toContain('2× قهوة فاتح');
    expect(summary).toContain('30 ج.م');
    expect(summary).toContain('محل ستايل');
    expect(summary).toContain('كاش');
  });

  test('formatDraftSummary shows customization when present', () => {
    const draft: OrderDraft = {
      version: 1,
      createdAt: Date.now(),
      items: [{ productId: 'p1', productName: 'قهوة', quantity: 1, unitPrice: 15, customization: { roast: 'فاتح', sugar: 'زيادة' } }],
      total: 15,
    };
    const summary = service.formatDraftSummary(draft);
    expect(summary).toContain('فاتح - زيادة');
  });

  // ── Balance ──
  test('getCustomerBalance returns default when no customer', async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce(null);
    const bal = await service.getCustomerBalance('cust-1', 'cafe-1');
    expect(bal.totalSpent).toBe(0);
  });

  // ── Eligible payment methods ──
  test('getEligiblePaymentMethods returns cash and balance', () => {
    const draft: OrderDraft = { version: 1, createdAt: Date.now(), items: [], total: 50 };
    const methods = service.getEligiblePaymentMethods(draft);
    expect(methods).toContain('كاش');
    expect(methods).toContain('الرصيد');
  });

  // ── Delivery estimate ──
  test('estimateDelivery returns formatted string', () => {
    const est = service.estimateDelivery();
    expect(est).toContain('دقيقة');
    expect(est).toContain('10');
  });

  // ── Customer retrieval ──
  test('getCustomerByTelegram returns existing customer', async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce({ id: 'cust-1', name: 'أحمد' });
    const result = await service.getCustomerByTelegram('cafe-1', '12345', 'branch-1');
    expect(result).not.toBeNull();
    expect(result!.customerName).toBe('أحمد');
    expect(result!.isNew).toBe(false);
  });

  test('getCustomerByTelegram creates new customer', async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce(null);
    const result = await service.getCustomerByTelegram('cafe-1', '12345', 'branch-1');
    expect(result).not.toBeNull();
    expect(result!.isNew).toBe(true);
  });

  // ── Usual order draft building ──
  test('buildUsualOrderDraft returns null when level < 2', async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce({ id: 'cust-1', name: 'أحمد' });
    mockPrisma.branch.findFirst.mockResolvedValue({ id: 'branch-1' });
    const draft = await service.buildUsualOrderDraft('cust-1', 'cafe-1', 'branch-1');
    expect(draft).toBeNull();
  });

  test('buildUsualOrderDraft returns null when no usual order', async () => {
    mockPersonalization.getProfile.mockResolvedValueOnce({
      level: 2,
      orderingProfile: {},
    });
    const draft = await service.buildUsualOrderDraft('cust-1', 'cafe-1', 'branch-1');
    expect(draft).toBeNull();
  });

  // ── Repeat last draft ──
  test('buildRepeatLastDraft returns null when no previous orders', async () => {
    mockPrisma.order.findFirst.mockResolvedValueOnce(null);
    const draft = await service.buildRepeatLastDraft('cust-1', 'cafe-1', 'branch-1');
    expect(draft).toBeNull();
  });

  test('buildRepeatLastDraft returns null when all products unavailable', async () => {
    mockPrisma.order.findFirst.mockResolvedValueOnce({
      id: 'order-1',
      items: [{ productId: 'p1', quantity: 1, unitPrice: 10 }],
    });
    mockPrisma.product.findMany.mockResolvedValueOnce([]);
    const draft = await service.buildRepeatLastDraft('cust-1', 'cafe-1', 'branch-1');
    expect(draft).toBeNull();
  });
});

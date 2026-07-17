import { Test, TestingModule } from '@nestjs/testing';
import { PostOrderService } from './post-order.service';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from '../common/idempotency.service';
import { EventBusService } from '../events/event-bus.service';

describe('PostOrderService', () => {
  let service: PostOrderService;

  const mockPrisma = {
    customerFeedback: {
      create: jest.fn().mockResolvedValue({}),
    },
    complaint: {
      create: jest.fn().mockResolvedValue({ id: 'comp-1' }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    compensation: {
      create: jest.fn().mockResolvedValue({ id: 'c-1' }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    customer: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    processedMessage: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  const mockIdempotency = {
    isProcessed: jest.fn().mockResolvedValue({ duplicated: false }),
  };

  const mockEventBus = { publish: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostOrderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: IdempotencyService, useValue: mockIdempotency },
        { provide: EventBusService, useValue: mockEventBus },
      ],
    }).compile();

    service = module.get<PostOrderService>(PostOrderService);
  });

  // ── Feedback ──
  test('submitFeedback with satisfied returns positive message', async () => {
    const result = await service.submitFeedback({
      orderId: 'order-1', customerId: 'cust-1', cafeId: 'cafe-1', satisfied: true,
    });
    expect(result.message).toContain('بالهنا والشفا');
    expect(mockPrisma.customerFeedback.create).toHaveBeenCalled();
  });

  test('submitFeedback with complaint creates complaint record', async () => {
    await service.submitFeedback({
      orderId: 'order-1', customerId: 'cust-1', cafeId: 'cafe-1',
      satisfied: false, category: 'QUALITY', comment: 'القهوة بايظة',
    });
    expect(mockPrisma.complaint.create).toHaveBeenCalled();
    expect(mockPrisma.customerFeedback.create).toHaveBeenCalled();
  });

  test('submitFeedback is idempotent on duplicate', async () => {
    mockIdempotency.isProcessed.mockResolvedValue({ duplicated: true, entityType: 'feedback', entityId: 'order-1' });
    const result = await service.submitFeedback({
      orderId: 'order-1', customerId: 'cust-1', cafeId: 'cafe-1', satisfied: true,
    });
    expect(result.message).toContain('بالهنا والشفا');
    expect(mockPrisma.customerFeedback.create).not.toHaveBeenCalled();
  });

  test('getFeedbackReply returns correct reply', () => {
    expect(service.getFeedbackReply(true)).toContain('بالهنا والشفا');
    expect(service.getFeedbackReply(false)).toContain('حقك علينا');
  });

  // ── Complaint ──
  test('createComplaint creates and returns id', async () => {
    mockIdempotency.isProcessed.mockResolvedValue({ duplicated: false });
    mockPrisma.complaint.create.mockResolvedValue({ id: 'comp-1' });
    const result = await service.createComplaint({
      cafeId: 'cafe-1', customerId: 'cust-1', orderId: 'order-1',
      category: 'QUALITY', description: 'القهوة مرة',
    });
    expect(result.id).toBe('comp-1');
    expect(mockEventBus.publish).toHaveBeenCalled();
  });

  test('createComplaint is idempotent', async () => {
    mockIdempotency.isProcessed.mockResolvedValue({ duplicated: true, entityType: 'complaint', entityId: 'comp-1' });
    const result = await service.createComplaint({
      cafeId: 'cafe-1', customerId: 'cust-1', orderId: 'order-1',
    });
    expect(result.message).toContain('بالفعل');
  });

  test('getComplaint rejects foreign cafe', async () => {
    mockPrisma.complaint.findUnique.mockResolvedValue({ id: 'comp-1', cafeId: 'other-cafe' });
    await expect(service.getComplaint('comp-1', 'cafe-1')).rejects.toThrow();
  });

  test('resolveComplaint updates status', async () => {
    mockPrisma.complaint.findUnique.mockResolvedValue({ id: 'comp-1', cafeId: 'cafe-1' });
    await service.resolveComplaint('comp-1', 'cafe-1', 'تم إعادة التجهيز');
    expect(mockPrisma.complaint.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'comp-1' },
      data: expect.objectContaining({ status: 'RESOLVED', resolution: 'تم إعادة التجهيز' }),
    }));
  });

  // ── Compensation ──
  test('createCompensation auto-approves low value', async () => {
    mockIdempotency.isProcessed.mockResolvedValue({ duplicated: false });
    mockPrisma.compensation.create.mockResolvedValue({ id: 'c-1' });
    mockPrisma.compensation.findUnique.mockResolvedValue({ id: 'c-1', cafeId: 'cafe-1' });
    const result = await service.createCompensation({
      cafeId: 'cafe-1', customerId: 'cust-1', type: 'FREE_PRODUCT',
      productId: 'prod-1', ownerApproved: false,
    });
    expect(result).toBeDefined();
    expect(result.requiresApproval).toBe(false);
    expect(result.message).toContain('تم تطبيق');
  });

  test('createCompensation requires approval for high value', async () => {
    mockIdempotency.isProcessed.mockResolvedValue({ duplicated: false });
    mockPrisma.compensation.create.mockResolvedValue({ id: 'c-1' });
    mockPrisma.compensation.findUnique.mockResolvedValue({ id: 'c-1', cafeId: 'cafe-1' });
    const result = await service.createCompensation({
      cafeId: 'cafe-1', customerId: 'cust-1', type: 'ACCOUNT_CREDIT',
      value: 100, ownerApproved: false,
    });
    expect(result).toBeDefined();
    expect(result.requiresApproval).toBe(true);
    expect(result.message).toBe('تم إرسال طلب التعويض للمراجعة.');
  });

  test('createCompensation is idempotent', async () => {
    mockIdempotency.isProcessed.mockResolvedValue({ duplicated: true, entityType: 'compensation', entityId: 'c-1' });
    const result = await service.createCompensation({
      cafeId: 'cafe-1', customerId: 'cust-1', type: 'FREE_PRODUCT', ownerApproved: false,
    });
    expect(result.message).toContain('بالفعل');
  });

  test('createCompensation requires real complaint - links to complaint', async () => {
    mockPrisma.complaint.update.mockResolvedValue({});
    const result = await service.createCompensation({
      cafeId: 'cafe-1', customerId: 'cust-1', complaintId: 'comp-1', type: 'FREE_PRODUCT', ownerApproved: false,
    });
    expect(result.id).toBe('c-1');
  });

  test('approveCompensation rejects if not PENDING', async () => {
    mockPrisma.compensation.findUnique.mockResolvedValue({ id: 'c-1', cafeId: 'cafe-1', status: 'APPLIED' });
    const result = await service.approveCompensation('c-1', 'cafe-1');
    expect(result.success).toBe(false);
  });

  test('approveCompensation approves and applies', async () => {
    mockPrisma.compensation.findUnique.mockResolvedValue({ id: 'c-1', cafeId: 'cafe-1', status: 'PENDING' });
    const result = await service.approveCompensation('c-1', 'cafe-1');
    expect(result.success).toBe(true);
  });

  test('approveCompensation rejects foreign cafe', async () => {
    mockPrisma.compensation.findUnique.mockResolvedValue({ id: 'c-1', cafeId: 'other-cafe' });
    await expect(service.approveCompensation('c-1', 'cafe-1')).rejects.toThrow();
  });

  // ── Support Case ──
  test('createSupportCase publishes event', async () => {
    await service.createSupportCase('cafe-1', 'cust-1', 'order-1', 'الطلب ناقص');
    expect(mockEventBus.publish).toHaveBeenCalled();
  });

  // ── Favorite Product Return ──
  test('checkFavoriteProductReturn checks preferredProducts', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([
      { id: 'cust-1', preferredProducts: { 'prod-1': 5, 'prod-2': 3 } },
      { id: 'cust-2', preferredProducts: { 'prod-3': 2 } },
    ]);
    const notified = await service.checkFavoriteProductReturn('cafe-1', 'prod-1');
    expect(notified).toContain('cust-1');
    expect(notified).not.toContain('cust-2');
  });
});

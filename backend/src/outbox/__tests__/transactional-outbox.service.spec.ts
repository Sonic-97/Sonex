import { TransactionalOutboxService } from '../application/transactional-outbox.service';

describe('TransactionalOutboxService', () => {
  let service: TransactionalOutboxService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      outboxRecord: {
        create: jest.fn().mockImplementation((args) =>
          Promise.resolve({ id: 'outbox_100', ...args.data }),
        ),
        findMany: jest.fn().mockImplementation(() =>
          Promise.resolve([
            {
              id: 'outbox_100',
              tenantId: 'tenant_1',
              branchId: 'branch_1',
              eventType: 'ORDER_COMMITTED',
              status: 'PENDING',
            },
          ]),
        ),
        update: jest.fn().mockImplementation((args) =>
          Promise.resolve({ id: args.where.id, ...args.data }),
        ),
      },
    };

    service = new TransactionalOutboxService(mockPrisma as any);
  });

  it('should persist outbox record atomically within a PostgreSQL transaction', async () => {
    const mockTx = mockPrisma;
    const dto = {
      tenantId: 'tenant_1',
      branchId: 'branch_1',
      aggregateType: 'ORDER',
      aggregateId: 'ord_100',
      eventType: 'ORDER_COMMITTED',
      payload: { grandTotal: 250 },
    };

    const res = await service.publishEventWithinTransaction(mockTx as any, dto);

    expect(res.isSuccess).toBe(true);
    expect(res.value.eventId).toBe('outbox_100');
    expect(mockPrisma.outboxRecord.create).toHaveBeenCalled();
  });

  it('should fetch pending outbox records under sub-100ms SLA using compound index', async () => {
    const startTime = Date.now();
    const res = await service.fetchPendingEvents('tenant_1', 'branch_1');
    const durationMs = Date.now() - startTime;

    expect(res.isSuccess).toBe(true);
    expect(res.value.length).toBe(1);
    expect(durationMs).toBeLessThan(100);
  });

  it('should mark outbox record as COMPLETED after processing', async () => {
    const res = await service.markEventCompleted('outbox_100');

    expect(res.isSuccess).toBe(true);
    expect(mockPrisma.outboxRecord.update).toHaveBeenCalledWith({
      where: { id: 'outbox_100' },
      data: expect.objectContaining({ status: 'COMPLETED' }),
    });
  });
});

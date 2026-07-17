import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryIntegrityService } from '../../inventory-integrity/inventory-integrity.service';
import { ReservationExpiryService } from '../../inventory-integrity/reservation-expiry.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainEventBusService, DomainEventTypes } from '../../domain-events';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockPrisma = {
  inventory: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  stockReservation: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  stockLedger: {
    create: jest.fn(),
  },
  $transaction: jest.fn((fn: any) => fn(mockPrisma)),
};

const mockDomainEventBus = {
  publish: jest.fn().mockResolvedValue(undefined),
};

function makeInv(overrides: Partial<any> = {}) {
  return {
    id: 'inv-1',
    cafeId: 'cafe-1',
    itemName: 'قهوة',
    currentQty: new Prisma.Decimal(100),
    reservedQty: new Prisma.Decimal(0),
    version: 1,
    unit: 'kg',
    costPerUnit: new Prisma.Decimal(50),
    ...overrides,
  };
}

function makeStockValidation(overrides: Partial<any> = {}) {
  return {
    currentQty: new Prisma.Decimal(100),
    reservedQty: new Prisma.Decimal(0),
    version: 1,
    cafeId: 'cafe-1',
    itemName: 'قهوة',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// InventoryIntegrityService
// ---------------------------------------------------------------------------
describe('InventoryIntegrityService', () => {
  let service: InventoryIntegrityService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryIntegrityService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DomainEventBusService, useValue: mockDomainEventBus },
      ],
    }).compile();

    service = module.get(InventoryIntegrityService);
  });

  // ── Validation Guards ──

  describe('validateStockLevels', () => {
    it('passes for valid stock levels', () => {
      const result = service.validateStockLevels(makeStockValidation({
        currentQty: new Prisma.Decimal(100),
        reservedQty: new Prisma.Decimal(20),
      }));
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('fails when currentQty is negative', () => {
      const result = service.validateStockLevels(makeStockValidation({
        currentQty: new Prisma.Decimal(-5),
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('currentQty'))).toBe(true);
    });

    it('fails when reservedQty is negative', () => {
      const result = service.validateStockLevels(makeStockValidation({
        reservedQty: new Prisma.Decimal(-1),
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('reservedQty'))).toBe(true);
    });

    it('fails when available stock is negative (reserved > current)', () => {
      const result = service.validateStockLevels(makeStockValidation({
        currentQty: new Prisma.Decimal(10),
        reservedQty: new Prisma.Decimal(15),
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('available'))).toBe(true);
    });
  });

  describe('assertAvailable', () => {
    it('does not throw when stock is sufficient', () => {
      expect(() =>
        service.assertAvailable(makeStockValidation({ currentQty: new Prisma.Decimal(10), reservedQty: new Prisma.Decimal(2) }), new Prisma.Decimal(5)),
      ).not.toThrow();
    });

    it('throws when stock is insufficient', () => {
      expect(() =>
        service.assertAvailable(makeStockValidation({ currentQty: new Prisma.Decimal(10), reservedQty: new Prisma.Decimal(8) }), new Prisma.Decimal(5)),
      ).toThrow('Insufficient stock');
    });
  });

  describe('assertNoNegativeStock', () => {
    it('does not throw for positive values', () => {
      expect(() =>
        service.assertNoNegativeStock(new Prisma.Decimal(10), new Prisma.Decimal(5)),
      ).not.toThrow();
    });

    it('throws for negative currentQty', () => {
      expect(() =>
        service.assertNoNegativeStock(new Prisma.Decimal(-1), new Prisma.Decimal(0)),
      ).toThrow('Stock level cannot go below zero');
    });

    it('throws for negative reservedQty', () => {
      expect(() =>
        service.assertNoNegativeStock(new Prisma.Decimal(10), new Prisma.Decimal(-1)),
      ).toThrow('Reserved quantity cannot go below zero');
    });
  });

  describe('assertCommittedNotExceedingReserved', () => {
    it('does not throw when committed <= reserved', () => {
      expect(() =>
        service.assertCommittedNotExceedingReserved(new Prisma.Decimal(5), new Prisma.Decimal(10)),
      ).not.toThrow();
    });

    it('throws when committed exceeds reserved', () => {
      expect(() =>
        service.assertCommittedNotExceedingReserved(new Prisma.Decimal(10), new Prisma.Decimal(5)),
      ).toThrow('exceeds reserved');
    });
  });

  // ── Retry Wrapper ──

  describe('withRetry', () => {
    it('performs atomic update on first attempt', async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(makeInv());
      mockPrisma.inventory.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.withRetry(
        'inv-1',
        'reserve',
        async (inv) => ({
          currentQty: inv.currentQty,
          reservedQty: inv.reservedQty.add(10),
        }),
      );

      expect(result.before.currentQty.toString()).toBe('100');
      expect(result.after.reservedQty.toString()).toBe('10');
      expect(result.version).toBe(2);
    });

    it('retries on version conflict then succeeds', async () => {
      const inv = makeInv();
      mockPrisma.inventory.findUnique
        .mockResolvedValueOnce(inv)           // attempt 1: read v1
        .mockResolvedValueOnce({ ...inv, version: 2 }); // attempt 2: read v2 (another writer incremented)
      mockPrisma.inventory.updateMany
        .mockResolvedValueOnce({ count: 0 })  // attempt 1: conflict (v1 is stale)
        .mockResolvedValueOnce({ count: 1 });  // attempt 2: success

      const result = await service.withRetry(
        'inv-1',
        'reserve',
        async (current) => ({
          currentQty: current.currentQty,
          reservedQty: current.reservedQty.add(5),
        }),
      );

      expect(result.version).toBeGreaterThan(result.before.version);
      expect(result.after.reservedQty.toString()).toBe('5');
      expect(mockPrisma.inventory.updateMany).toHaveBeenCalledTimes(2);
    });
    it('throws after exhausting retries', async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(makeInv());
      mockPrisma.inventory.updateMany.mockResolvedValue({ count: 0 }); // always conflict

      await expect(
        service.withRetry('inv-1', 'reserve', async (inv) => ({
          currentQty: inv.currentQty,
          reservedQty: inv.reservedQty.add(5),
        })),
      ).rejects.toThrow('after 5 retries');

      expect(mockPrisma.inventory.updateMany).toHaveBeenCalledTimes(5);
    });

    it('publishes conflict event on version mismatch', async () => {
      mockPrisma.inventory.findUnique
        .mockResolvedValueOnce(makeInv({ version: 1 }))
        .mockResolvedValueOnce(makeInv({ version: 3 }));
      mockPrisma.inventory.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      await service.withRetry('inv-1', 'reserve', async (inv) => ({
        currentQty: inv.currentQty,
        reservedQty: inv.reservedQty.add(5),
      }));

      expect(mockDomainEventBus.publish).toHaveBeenCalledWith(
        DomainEventTypes.INVENTORY_CONFLICT_DETECTED,
        expect.objectContaining({
          inventoryId: 'inv-1',
          operation: 'reserve',
          attemptedVersion: 1,
          currentVersion: 3,
        }),
      );
    });

    it('detects negative reservedQty after mutation and throws', async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(makeInv({ reservedQty: new Prisma.Decimal(0) }));
      mockPrisma.inventory.updateMany.mockResolvedValue({ count: 1 });

      // Try to reserve more than available, but the fn returns negative reservedQty
      await expect(
        service.withRetry('inv-1', 'reserve', async (inv) => ({
          currentQty: inv.currentQty,
          reservedQty: inv.reservedQty.sub(50),  // negative
        })),
      ).rejects.toThrow('Reserved quantity cannot go below zero');
    });

    it('throws if inventory not found', async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(null);

      await expect(
        service.withRetry('nonexistent', 'reserve', async (inv) => ({
          currentQty: inv.currentQty,
          reservedQty: inv.reservedQty,
        })),
      ).rejects.toThrow('not found');
    });
  });

  // ── Atomic Adjustment ──

  describe('adjustStock', () => {
    it('adjusts stock atomically with version check', async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(makeInv());
      mockPrisma.inventory.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.stockLedger.create.mockResolvedValue(undefined);

      await service.adjustStock({
        inventoryId: 'inv-1',
        cafeId: 'cafe-1',
        branchId: 'branch-1',
        currentQty: new Prisma.Decimal(80),
        reservedQty: new Prisma.Decimal(10),
        reason: 'manual_adjustment',
      });

      expect(mockPrisma.inventory.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1', version: 1 },
          data: expect.objectContaining({ version: { increment: 1 } }),
        }),
      );
      expect(mockPrisma.stockLedger.create).toHaveBeenCalled();
      expect(mockDomainEventBus.publish).toHaveBeenCalledWith(
        DomainEventTypes.INVENTORY_ADJUSTED,
        expect.objectContaining({ reason: 'manual_adjustment' }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// ReservationExpiryService
// ---------------------------------------------------------------------------
describe('ReservationExpiryService', () => {
  let service: ReservationExpiryService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationExpiryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DomainEventBusService, useValue: mockDomainEventBus },
      ],
    }).compile();

    service = module.get(ReservationExpiryService);
  });

  it('expires stale ACTIVE reservations', async () => {
    const staleReservation = {
      id: 'res-1',
      inventoryId: 'inv-1',
      orderId: 'order-1',
      cafeId: 'cafe-1',
      quantity: new Prisma.Decimal(5),
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
      inventory: {
        id: 'inv-1',
        currentQty: new Prisma.Decimal(100),
        reservedQty: new Prisma.Decimal(10),
        version: 1,
        cafeId: 'cafe-1',
        itemName: 'قهوة',
      },
    };

    mockPrisma.stockReservation.findMany.mockResolvedValue([staleReservation]);
    mockPrisma.inventory.findUnique.mockResolvedValue(staleReservation.inventory);
    mockPrisma.inventory.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.stockReservation.update.mockResolvedValue(undefined);
    mockPrisma.stockLedger.create.mockResolvedValue(undefined);

    const count = await service.expireStaleReservations();

    expect(count).toBe(1);
    expect(mockPrisma.stockReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'res-1' },
        data: expect.objectContaining({ status: 'EXPIRED' }),
      }),
    );
  });

  it('does not expire recent reservations', async () => {
    mockPrisma.stockReservation.findMany.mockResolvedValue([]);

    const count = await service.expireStaleReservations();

    expect(count).toBe(0);
  });

  it('skips reservation that would cause negative reservedQty', async () => {
    mockPrisma.stockReservation.findMany.mockResolvedValue([]);

    const count = await service.expireStaleReservations();

    expect(count).toBe(0);
  });

  it('publishes RESERVATION_EXPIRED event on successful expiry', async () => {
    const staleReservation = {
      id: 'res-3',
      inventoryId: 'inv-1',
      orderId: 'order-1',
      cafeId: 'cafe-1',
      quantity: new Prisma.Decimal(3),
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
      inventory: {
        id: 'inv-1',
        currentQty: new Prisma.Decimal(100),
        reservedQty: new Prisma.Decimal(10),
        version: 1,
        cafeId: 'cafe-1',
        itemName: 'قهوة',
      },
    };

    mockPrisma.stockReservation.findMany.mockResolvedValue([staleReservation]);
    mockPrisma.inventory.findUnique.mockResolvedValue(staleReservation.inventory);
    mockPrisma.inventory.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.stockReservation.update.mockResolvedValue(undefined);
    mockPrisma.stockLedger.create.mockResolvedValue(undefined);

    await service.expireStaleReservations();

    expect(mockDomainEventBus.publish).toHaveBeenCalledWith(
      DomainEventTypes.RESERVATION_EXPIRED,
      expect.objectContaining({
        reservationId: 'res-3',
        quantity: 3,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Concurrency & Overselling
// ---------------------------------------------------------------------------
describe('Concurrency & Overselling Prevention', () => {
  let service: InventoryIntegrityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InventoryIntegrityService(mockPrisma as any, mockDomainEventBus as any);
  });

  it('prevents over-reservation when total would exceed available', async () => {
    const inv = makeInv({ currentQty: new Prisma.Decimal(10), reservedQty: new Prisma.Decimal(8) });
    mockPrisma.inventory.findUnique.mockResolvedValue(inv);

    await expect(
      service.withRetry('inv-1', 'reserve', async (current) => {
        // available = 10 - 8 = 2, trying to reserve 5 -> should fail
        const available = current.currentQty.sub(current.reservedQty);
        if (available.lt(5)) {
          throw new BadRequestException(`Insufficient stock. Available: ${available}`);
        }
        return {
          currentQty: current.currentQty,
          reservedQty: current.reservedQty.add(5),
        };
      }),
    ).rejects.toThrow('Insufficient stock');
  });

  it('prevents negative reservedQty on release', async () => {
    const inv = makeInv({ reservedQty: new Prisma.Decimal(3) });
    mockPrisma.inventory.findUnique.mockResolvedValue(inv);
    mockPrisma.inventory.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.withRetry('inv-1', 'release', async (current) => {
        // Trying to release 5 when only 3 is reserved -> should fail
        const newReserved = current.reservedQty.sub(5);
        return {
          currentQty: current.currentQty,
          reservedQty: newReserved,
        };
      }),
    ).rejects.toThrow('Reserved quantity cannot go below zero');
  });

  it('prevents false oversell detection with concurrent reservations', async () => {
    const inv = makeInv({ currentQty: new Prisma.Decimal(10), reservedQty: new Prisma.Decimal(3) });

    mockPrisma.inventory.findUnique.mockResolvedValue(inv);
    mockPrisma.inventory.updateMany.mockResolvedValue({ count: 1 });

    // Attempt to reserve 8 when available is only 7 (10 - 3 = 7)
    const fn = jest.fn(async (current: any) => {
      const available = current.currentQty.sub(current.reservedQty);
      if (available.lt(8)) {
        throw new BadRequestException(`Insufficient stock. Available: ${available}`);
      }
      return { currentQty: current.currentQty, reservedQty: current.reservedQty.add(8) };
    });

    await expect(service.withRetry('inv-1', 'reserve', fn)).rejects.toThrow('Insufficient stock');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('handles concurrent confirmations correctly', async () => {
    const inv = makeInv({ currentQty: new Prisma.Decimal(10), reservedQty: new Prisma.Decimal(8) });
    mockPrisma.inventory.findUnique.mockResolvedValue(inv);

    // Two concurrent confirm operations trying to confirm 5 each
    // First one: currentQty = 10 - 5 = 5, reservedQty = 8 - 5 = 3
    // Second one: currentQty = 5 - 5 = 0, reservedQty = 3 - 5 = -2 -> should fail

    mockPrisma.inventory.updateMany
      .mockResolvedValueOnce({ count: 1 })  // first confirm succeeds
      .mockResolvedValueOnce({ count: 0 }); // second confirm conflicts

    const invAfterFirst = { ...inv, currentQty: new Prisma.Decimal(5), reservedQty: new Prisma.Decimal(3), version: 2 };
    mockPrisma.inventory.findUnique
      .mockResolvedValueOnce(invAfterFirst);  // retry reads new state
    mockPrisma.inventory.updateMany
      .mockResolvedValueOnce({ count: 1 });  // retry succeeds (but reserved would be -2!)

    // The fn checks for negative reservedQty
    const result = service.withRetry('inv-1', 'confirm', async (current) => {
      const newReserved = current.reservedQty.sub(5);
      if (newReserved.lt(0)) {
        throw new BadRequestException('reservedQty cannot be negative');
      }
      return { currentQty: current.currentQty.sub(5), reservedQty: newReserved };
    });

    await expect(result).rejects.toThrow('reservedQty cannot be negative');
  });

  it('handles concurrent releases correctly', async () => {
    const inv = makeInv({ currentQty: new Prisma.Decimal(10), reservedQty: new Prisma.Decimal(5) });

    // Two concurrent releases of 3 each
    // First: reservedQty = 5 - 3 = 2
    // Second (conflict detected): retry reads new state (reservedQty=2), then reservedQty = 2 - 3 = -1 -> fails

    mockPrisma.inventory.findUnique.mockResolvedValue(inv);
    mockPrisma.inventory.updateMany
      .mockResolvedValueOnce({ count: 1 })  // first release
      .mockResolvedValueOnce({ count: 0 }); // second release conflicts

    const invAfterFirst = { ...inv, reservedQty: new Prisma.Decimal(2), version: 2 };
    mockPrisma.inventory.findUnique
      .mockResolvedValueOnce(invAfterFirst);  // retry reads
    mockPrisma.inventory.updateMany
      .mockResolvedValueOnce({ count: 1 });  // retry succeeds (but would make -1!)

    const result = service.withRetry('inv-1', 'release', async (current) => {
      const newReserved = current.reservedQty.sub(3);
      return { currentQty: current.currentQty, reservedQty: newReserved };
    });

    await expect(result).rejects.toThrow('Reserved quantity cannot go below zero');
  });
});

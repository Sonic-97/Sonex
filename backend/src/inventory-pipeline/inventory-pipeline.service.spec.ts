import { Test, TestingModule } from '@nestjs/testing';
import { InventoryPipelineService } from './inventory-pipeline.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { InventoryCacheService } from '../inventory/services/inventory-cache.service';
import { InventoryIntegrityService } from '../inventory-integrity/inventory-integrity.service';
import { DomainEventBusService } from '../domain-events';
import { Prisma } from '@prisma/client';

describe('InventoryPipelineService', () => {
  let service: InventoryPipelineService;
  let mockPrisma: any;
  let mockTx: any;

  beforeEach(async () => {
    const baseTx = {
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      recipeIngredient: { findMany: jest.fn().mockResolvedValue([]) },
      inventory: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      stockReservation: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      stockLedger: { create: jest.fn().mockResolvedValue({}) },
      inventoryConsumption: { create: jest.fn().mockResolvedValue({}) },
    };

    mockTx = (overrides: Record<string, any> = {}) => {
      const merged: Record<string, any> = {};
      for (const key of new Set([...Object.keys(baseTx), ...Object.keys(overrides)])) {
        merged[key] = { ...baseTx[key], ...overrides[key] };
      }
      return merged;
    };

    mockPrisma = {
      inventory: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryPipelineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsService, useValue: { emit: jest.fn() } },
        { provide: AuditService, useValue: { logAction: jest.fn() } },
        { provide: NotificationService, useValue: { createNotification: jest.fn() } },
        { provide: InventoryCacheService, useValue: { setStock: jest.fn() } },
        {
          provide: InventoryIntegrityService,
          useValue: {
            assertAvailable: jest.fn((inventory: { currentQty: Prisma.Decimal; reservedQty: Prisma.Decimal; itemName: string }, needed: Prisma.Decimal) => {
              if (inventory.currentQty.sub(inventory.reservedQty).lt(needed)) {
                throw new Error(`Insufficient stock for ${inventory.itemName}`);
              }
            }),
            withRetry: jest.fn(async (
              _inventoryId: string,
              _operation: string,
              operation: (inventory: { currentQty: Prisma.Decimal; reservedQty: Prisma.Decimal }) => Promise<{ currentQty: Prisma.Decimal; reservedQty: Prisma.Decimal }>,
              tx: { inventory: { findUnique: () => Promise<{ currentQty: Prisma.Decimal; reservedQty: Prisma.Decimal; version: number }>; updateMany: (args: unknown) => Promise<{ count: number }> } },
            ) => {
              const before = await tx.inventory.findUnique();
              const after = await operation(before);
              await tx.inventory.updateMany({
                where: { id: _inventoryId, version: before.version },
                data: {
                  currentQty: after.currentQty,
                  reservedQty: after.reservedQty,
                  version: { increment: 1 },
                },
              });
              return { before, after, version: before.version + 1 };
            }),
          },
        },
        { provide: DomainEventBusService, useValue: { publish: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<InventoryPipelineService>(InventoryPipelineService);
  });

  // ── RESERVE ──

  it('should reserve inventory for non-refrigerated items with recipe', async () => {
    const tx = mockTx({
      recipeIngredient: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'ri-1', productId: 'p1', inventoryId: 'inv-1', quantity: 2, unit: 'g', inventory: { itemName: 'Coffee Beans', unit: 'g', currentQty: new Prisma.Decimal(1000), reservedQty: new Prisma.Decimal(0), costPerUnit: new Prisma.Decimal(5), cafeId: 'cafe-1' } },
        ]),
      },
      inventory: {
        findUnique: jest.fn().mockResolvedValue({ currentQty: new Prisma.Decimal(1000), reservedQty: new Prisma.Decimal(0), version: 1, cafeId: 'cafe-1', itemName: 'Coffee Beans', unit: 'g', costPerUnit: new Prisma.Decimal(5) }),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    const result = await service.reserve({
      orderId: 'order-1', cafeId: 'cafe-1', branchId: 'branch-1',
      items: [{ productId: 'p1', productName: 'Coffee', quantity: 2, isRefrigerated: false }],
    }, tx);

    expect(result.inventoryReserved).toHaveLength(1);
    expect(result.refrigeratorDeducted).toHaveLength(0);
    expect(tx.inventory.updateMany).toHaveBeenCalled();
    expect(tx.stockReservation.create).toHaveBeenCalled();
    expect(tx.stockLedger.create).toHaveBeenCalled();
  });

  it('should deduct refrigerator stock for refrigerated items', async () => {
    const tx = mockTx();

    const result = await service.reserve({
      orderId: 'order-1', cafeId: 'cafe-1', branchId: 'branch-1',
      items: [{ productId: 'p1', productName: 'Iced Coffee', quantity: 3, isRefrigerated: true }],
    }, tx);

    expect(result.refrigeratorDeducted).toHaveLength(1);
    expect(result.refrigeratorDeducted[0].quantity).toBe(3);
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', refrigeratorStock: { gte: 3 } },
      data: { refrigeratorStock: { decrement: 3 } },
    });
  });

  it('should throw when refrigerator stock is insufficient', async () => {
    const tx = mockTx({
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });

    await expect(service.reserve({
      orderId: 'order-1', cafeId: 'cafe-1', branchId: 'branch-1',
      items: [{ productId: 'p1', productName: 'Iced Coffee', quantity: 99, isRefrigerated: true }],
    }, tx)).rejects.toThrow('Insufficient refrigerator stock for Iced Coffee');
  });

  it('should throw when inventory stock is insufficient', async () => {
    const tx = mockTx({
      recipeIngredient: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'ri-1', productId: 'p1', inventoryId: 'inv-1', quantity: 10, unit: 'g', inventory: { itemName: 'Coffee Beans', unit: 'g', currentQty: new Prisma.Decimal(5), reservedQty: new Prisma.Decimal(0), costPerUnit: new Prisma.Decimal(1), cafeId: 'cafe-1' } },
        ]),
      },
      inventory: {
        findUnique: jest.fn().mockResolvedValue({ currentQty: new Prisma.Decimal(5), reservedQty: new Prisma.Decimal(0), version: 1, cafeId: 'cafe-1', itemName: 'Coffee Beans', unit: 'g', costPerUnit: new Prisma.Decimal(1) }),
      },
    });

    await expect(service.reserve({
      orderId: 'order-1', cafeId: 'cafe-1', branchId: 'branch-1',
      items: [{ productId: 'p1', productName: 'Coffee', quantity: 1, isRefrigerated: false }],
    }, tx)).rejects.toThrow('Insufficient stock for Coffee Beans');
  });

  // ── CONFIRM ──

  it('should confirm reservations and deduct stock', async () => {
    const tx = mockTx({
      stockReservation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'res-1', inventoryId: 'inv-1', quantity: new Prisma.Decimal(200), status: 'ACTIVE', cafeId: 'cafe-1', inventory: { itemName: 'Coffee Beans', costPerUnit: new Prisma.Decimal(5), unit: 'g' } },
        ]),
      },
      inventory: {
        findUnique: jest.fn().mockResolvedValue({ currentQty: new Prisma.Decimal(1000), reservedQty: new Prisma.Decimal(200), version: 1, cafeId: 'cafe-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    const result = await service.confirm('order-1', 'cafe-1', tx);

    expect(result.inventoryConfirmed).toHaveLength(1);
    expect(tx.inventory.updateMany).toHaveBeenCalled();
    expect(tx.stockReservation.update).toHaveBeenCalledWith({ where: { id: 'res-1' }, data: { status: 'CONFIRMED', confirmedAt: expect.any(Date) } });
    expect(tx.inventoryConsumption.create).toHaveBeenCalled();
    expect(tx.stockLedger.create).toHaveBeenCalled();
  });

  it('should throw on negative stock during confirm', async () => {
    const tx = mockTx({
      stockReservation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'res-1', inventoryId: 'inv-1', quantity: new Prisma.Decimal(9999), status: 'ACTIVE', cafeId: 'cafe-1', inventory: { itemName: 'Coffee Beans', costPerUnit: new Prisma.Decimal(5), unit: 'g' } },
        ]),
      },
      inventory: {
        findUnique: jest.fn().mockResolvedValue({ currentQty: new Prisma.Decimal(10), reservedQty: new Prisma.Decimal(9999), version: 1, cafeId: 'cafe-1' }),
      },
    });

    await expect(service.confirm('order-1', 'cafe-1', tx)).rejects.toThrow('Cannot confirm — negative stock');
  });

  // ── RELEASE ──

  it('should release active reservations (no stock change)', async () => {
    const tx = mockTx({
      stockReservation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'res-1', inventoryId: 'inv-1', quantity: new Prisma.Decimal(200), status: 'ACTIVE', cafeId: 'cafe-1' },
        ]),
      },
      inventory: {
        findUnique: jest.fn().mockResolvedValue({ currentQty: new Prisma.Decimal(1000), reservedQty: new Prisma.Decimal(200), version: 1, cafeId: 'cafe-1', itemName: 'Coffee Beans' }),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    const result = await service.release('order-1', tx);

    expect(result.inventoryReleased).toHaveLength(1);
    expect(result.inventoryReleased[0].action).toBe('release_active');
    expect(tx.inventory.updateMany).toHaveBeenCalled();
    expect(tx.stockReservation.update).toHaveBeenCalledWith({ where: { id: 'res-1' }, data: { status: 'RELEASED', releasedAt: expect.any(Date) } });
  });

  it('should restore stock for confirmed reservations', async () => {
    const tx = mockTx({
      stockReservation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'res-1', inventoryId: 'inv-1', quantity: new Prisma.Decimal(200), status: 'CONFIRMED', cafeId: 'cafe-1' },
        ]),
      },
      inventory: {
        findUnique: jest.fn().mockResolvedValue({ currentQty: new Prisma.Decimal(800), reservedQty: new Prisma.Decimal(0), version: 1, cafeId: 'cafe-1', itemName: 'Coffee Beans' }),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    const result = await service.release('order-1', tx);

    expect(result.inventoryReleased).toHaveLength(1);
    expect(result.inventoryReleased[0].action).toBe('restore_confirmed');
    // stock should go back up: 800 + 200 = 1000
    expect(tx.inventory.updateMany).toHaveBeenCalled();
  });

  // ── EDGE CASES ──

  it('should handle empty items list', async () => {
    const tx = mockTx();
    const result = await service.reserve({
      orderId: 'order-1', cafeId: 'cafe-1', branchId: 'branch-1',
      items: [],
    }, tx);
    expect(result.inventoryReserved).toHaveLength(0);
    expect(result.refrigeratorDeducted).toHaveLength(0);
  });

  it('should skip products without recipes', async () => {
    const tx = mockTx({
      recipeIngredient: { findMany: jest.fn().mockResolvedValue([]) },
    });

    const result = await service.reserve({
      orderId: 'order-1', cafeId: 'cafe-1', branchId: 'branch-1',
      items: [{ productId: 'p1', productName: 'Water', quantity: 1, isRefrigerated: false }],
    }, tx);

    expect(result.inventoryReserved).toHaveLength(0);
  });

  it('should release with no reservations (no-op)', async () => {
    const tx = mockTx({
      stockReservation: { findMany: jest.fn().mockResolvedValue([]) },
    });

    const result = await service.release('order-1', tx);
    expect(result.inventoryReleased).toHaveLength(0);
  });

  it('should confirm with no reservations (no-op)', async () => {
    const tx = mockTx({
      stockReservation: { findMany: jest.fn().mockResolvedValue([]) },
    });

    const result = await service.confirm('order-1', 'cafe-1', tx);
    expect(result.inventoryConfirmed).toHaveLength(0);
  });

  // ── REGRESSION: Complete lifecycle ──

  it('[R1] Reserve → Release (Create → Cancel): restores reservedQty only', async () => {
    const tx = mockTx({
      recipeIngredient: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'ri-1', productId: 'p1', inventoryId: 'inv-1', quantity: 2, unit: 'g', inventory: { itemName: 'Coffee Beans', unit: 'g', currentQty: new Prisma.Decimal(1000), reservedQty: new Prisma.Decimal(0), costPerUnit: new Prisma.Decimal(5), cafeId: 'cafe-1' } },
        ]),
      },
      inventory: {
        findUnique: jest.fn()
          // First call: reserve reads current stock
          .mockResolvedValueOnce({ currentQty: new Prisma.Decimal(1000), reservedQty: new Prisma.Decimal(0), version: 1, cafeId: 'cafe-1', itemName: 'Coffee Beans', unit: 'g', costPerUnit: new Prisma.Decimal(5) })
          // Second call: retry reads the inventory for reservation.
          .mockResolvedValueOnce({ currentQty: new Prisma.Decimal(1000), reservedQty: new Prisma.Decimal(0), version: 1, cafeId: 'cafe-1', itemName: 'Coffee Beans', unit: 'g', costPerUnit: new Prisma.Decimal(5) })
          // Third call: release reads stock with reservedQty=200.
          .mockResolvedValueOnce({ currentQty: new Prisma.Decimal(1000), reservedQty: new Prisma.Decimal(200), version: 2, cafeId: 'cafe-1', itemName: 'Coffee Beans' }),
        update: jest.fn().mockResolvedValue({}),
      },
      stockReservation: {
        create: jest.fn().mockResolvedValue({ id: 'res-1' }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'res-1', inventoryId: 'inv-1', quantity: new Prisma.Decimal(200), status: 'ACTIVE', cafeId: 'cafe-1' },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      stockLedger: { create: jest.fn().mockResolvedValue({}) },
    });

    // Step 1: Reserve
    const reserveResult = await service.reserve({
      orderId: 'order-1', cafeId: 'cafe-1', branchId: 'branch-1',
      items: [{ productId: 'p1', productName: 'Coffee', quantity: 100, isRefrigerated: false }],
    }, tx);
    expect(reserveResult.inventoryReserved).toHaveLength(1);

    // Step 2: Release (simulates cancel/void before confirm)
    const releaseResult = await service.release('order-1', tx);
    expect(releaseResult.inventoryReleased).toHaveLength(1);
    expect(releaseResult.inventoryReleased[0].action).toBe('release_active');
  });

  it('[R2] Reserve → Confirm → Release (Create → Confirm → Cancel): restores currentQty', async () => {
    // Each integrity operation reads inventory in addition to the initial reservation lookup.
    let findUniqueCount = 0;
    // Track which phase we're in for findMany: 0=initial, 1=confirm's findMany, 2=release's findMany
    let findManyCount = 0;

    const mockReservation = (status: string) => ({
      id: 'res-1', inventoryId: 'inv-1', quantity: new Prisma.Decimal(500),
      status, cafeId: 'cafe-1',
      inventory: { itemName: 'Coffee Beans', costPerUnit: new Prisma.Decimal(5), unit: 'g' },
    });

    const tx = mockTx({
      recipeIngredient: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'ri-1', productId: 'p1', inventoryId: 'inv-1', quantity: 5, unit: 'g', inventory: { itemName: 'Coffee Beans', unit: 'g', currentQty: new Prisma.Decimal(1000), reservedQty: new Prisma.Decimal(0), costPerUnit: new Prisma.Decimal(5), cafeId: 'cafe-1' } },
        ]),
      },
      inventory: {
        findUnique: jest.fn().mockImplementation(() => {
          findUniqueCount++;
          if (findUniqueCount === 1) return { currentQty: new Prisma.Decimal(1000), reservedQty: new Prisma.Decimal(0), version: 1, cafeId: 'cafe-1', itemName: 'Coffee Beans', unit: 'g', costPerUnit: new Prisma.Decimal(5) };
          if (findUniqueCount === 2) return { currentQty: new Prisma.Decimal(1000), reservedQty: new Prisma.Decimal(0), version: 1, cafeId: 'cafe-1', itemName: 'Coffee Beans' };
          if (findUniqueCount === 3) return { currentQty: new Prisma.Decimal(1000), reservedQty: new Prisma.Decimal(500), version: 2, cafeId: 'cafe-1', itemName: 'Coffee Beans' };
          return { currentQty: new Prisma.Decimal(500), reservedQty: new Prisma.Decimal(0), version: 3, cafeId: 'cafe-1', itemName: 'Coffee Beans' };
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      stockReservation: {
        create: jest.fn().mockResolvedValue({ id: 'res-1' }),
        findMany: jest.fn().mockImplementation(() => {
          findManyCount++;
          // 1st call (findManyCount=1) — confirm() looks for ACTIVE to promote to CONFIRMED
          if (findManyCount === 1) return [mockReservation('ACTIVE')];
          // 2nd call (findManyCount=2) — release() looks for ACTIVE/CONFIRMED, finds CONFIRMED
          return [mockReservation('CONFIRMED')];
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      inventoryConsumption: { create: jest.fn().mockResolvedValue({}) },
    });

    // Step 1: Reserve
    await service.reserve({
      orderId: 'order-1', cafeId: 'cafe-1', branchId: 'branch-1',
      items: [{ productId: 'p1', productName: 'Coffee', quantity: 100, isRefrigerated: false }],
    }, tx);

    // Step 2: Confirm
    const confirmResult = await service.confirm('order-1', 'cafe-1', tx);
    expect(confirmResult.inventoryConfirmed).toHaveLength(1);

    // Step 3: Release (simulates cancel after confirm)
    const releaseResult = await service.release('order-1', tx);
    expect(releaseResult.inventoryReleased).toHaveLength(1);
    expect(releaseResult.inventoryReleased[0].action).toBe('restore_confirmed');
  });

  it('[R3] Double release is idempotent (second call is no-op)', async () => {
    const tx = mockTx({
      stockReservation: {
        findMany: jest.fn()
          .mockResolvedValueOnce([
            { id: 'res-1', inventoryId: 'inv-1', quantity: new Prisma.Decimal(200), status: 'ACTIVE', cafeId: 'cafe-1' },
          ])
          .mockResolvedValueOnce([]),
      },
      inventory: {
        findUnique: jest.fn().mockResolvedValueOnce({ currentQty: new Prisma.Decimal(1000), reservedQty: new Prisma.Decimal(200), version: 1, cafeId: 'cafe-1', itemName: 'Coffee Beans' }),
        update: jest.fn().mockResolvedValue({}),
      },
      stockLedger: { create: jest.fn().mockResolvedValue({}) },
    });

    // First release
    const r1 = await service.release('order-1', tx);
    expect(r1.inventoryReleased).toHaveLength(1);

    // Second release (already RELEASED — finds nothing)
    const r2 = await service.release('order-1', tx);
    expect(r2.inventoryReleased).toHaveLength(0);
  });

  it('[R4] Concurrent version conflict on release throws and caller can retry', async () => {
    const tx = mockTx({
      stockReservation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'res-1', inventoryId: 'inv-1', quantity: new Prisma.Decimal(200), status: 'ACTIVE', cafeId: 'cafe-1' },
        ]),
      },
      inventory: {
        findUnique: jest.fn().mockResolvedValue({ currentQty: new Prisma.Decimal(1000), reservedQty: new Prisma.Decimal(200), version: 5, cafeId: 'cafe-1', itemName: 'Coffee Beans' }),
        // Version mismatch — updateMany with version:5 returns count=0
        update: jest.fn().mockResolvedValue({}),
      },
      stockLedger: { create: jest.fn().mockResolvedValue({}) },
    });

    const result = await service.release('order-1', tx);
    expect(result.inventoryReleased).toHaveLength(1);
    // The inventory.updateMany with version lock was called.
    expect(tx.inventory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'inv-1', version: 5 }),
      }),
    );
  });
});

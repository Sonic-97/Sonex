import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventBusService, DomainEventTypes } from '../domain-events';

export interface StockValidation {
  currentQty: Prisma.Decimal;
  reservedQty: Prisma.Decimal;
  version: number;
  cafeId: string;
  itemName: string;
}

export interface IntegrityCheckResult {
  valid: boolean;
  errors: string[];
}

@Injectable()
export class InventoryIntegrityService {
  private readonly logger = new Logger(InventoryIntegrityService.name);
  private readonly MAX_RETRIES = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventBus: DomainEventBusService,
  ) {}

  // ── VALIDATION GUARDS ──

  validateStockLevels(inv: StockValidation): IntegrityCheckResult {
    const errors: string[] = [];
    if (inv.currentQty.lt(0)) {
      errors.push(`currentQty (${inv.currentQty}) cannot be negative for ${inv.itemName}`);
    }
    if (inv.reservedQty.lt(0)) {
      errors.push(`reservedQty (${inv.reservedQty}) cannot be negative for ${inv.itemName}`);
    }
    if (inv.currentQty.sub(inv.reservedQty).lt(0)) {
      errors.push(`available stock (${inv.currentQty} - ${inv.reservedQty}) cannot be negative for ${inv.itemName}`);
    }
    return { valid: errors.length === 0, errors };
  }

  assertAvailable(inv: StockValidation, needed: Prisma.Decimal): void {
    const available = inv.currentQty.sub(inv.reservedQty);
    if (available.lt(needed)) {
      throw new BadRequestException(
        `Insufficient stock for ${inv.itemName}. Available: ${available.toString()}, needed: ${needed.toString()}`,
      );
    }
  }

  assertNoNegativeStock(currentQty: Prisma.Decimal, reservedQty: Prisma.Decimal): void {
    if (currentQty.lt(0)) {
      throw new BadRequestException('Stock level cannot go below zero');
    }
    if (reservedQty.lt(0)) {
      throw new BadRequestException('Reserved quantity cannot go below zero');
    }
  }

  assertCommittedNotExceedingReserved(committed: Prisma.Decimal, reserved: Prisma.Decimal): void {
    if (committed.gt(reserved)) {
      throw new BadRequestException(`Committed (${committed}) exceeds reserved (${reserved})`);
    }
  }

  // ── OPTIMISTIC RETRY WRAPPER ──

  async withRetry<T>(
    inventoryId: string,
    operation: 'reserve' | 'confirm' | 'release' | 'adjust',
    fn: (inv: StockValidation) => Promise<{ currentQty: Prisma.Decimal; reservedQty: Prisma.Decimal }>,
    tx?: Prisma.TransactionClient,
  ): Promise<{ before: StockValidation; after: { currentQty: Prisma.Decimal; reservedQty: Prisma.Decimal }; version: number }> {
    const db = tx || this.prisma;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      const inv = await db.inventory.findUnique({
        where: { id: inventoryId },
        select: { currentQty: true, reservedQty: true, version: true, cafeId: true, itemName: true },
      }) as StockValidation | null;

      if (!inv) {
        throw new BadRequestException(`Inventory ${inventoryId} not found`);
      }

      const validation = this.validateStockLevels(inv);
      if (!validation.valid) {
        throw new BadRequestException(`Inventory integrity violation: ${validation.errors.join('; ')}`);
      }

      const delta = await fn(inv);

      this.assertNoNegativeStock(delta.currentQty, delta.reservedQty);

      let updateResult: { count: number };

      if (tx) {
        updateResult = await tx.inventory.updateMany({
          where: { id: inventoryId, version: inv.version },
          data: {
            currentQty: delta.currentQty,
            reservedQty: delta.reservedQty,
            version: { increment: 1 },
          },
        });
      } else {
        updateResult = await this.prisma.inventory.updateMany({
          where: { id: inventoryId, version: inv.version },
          data: {
            currentQty: delta.currentQty,
            reservedQty: delta.reservedQty,
            version: { increment: 1 },
          },
        });
      }

      if (updateResult.count > 0) {
        return {
          before: inv,
          after: delta,
          version: inv.version + 1,
        };
      }

      if (attempt < this.MAX_RETRIES - 1) {
        const currentInv = await db.inventory.findUnique({
          where: { id: inventoryId },
          select: { version: true, itemName: true, cafeId: true },
        });

        this.domainEventBus.publish(DomainEventTypes.INVENTORY_CONFLICT_DETECTED, {
          inventoryId,
          itemName: inv.itemName,
          cafeId: inv.cafeId,
          orderId: undefined,
          attemptedVersion: inv.version,
          currentVersion: currentInv?.version || inv.version,
          operation,
          retryAttempt: attempt + 1,
        }).catch(() => {});

        this.logger.warn(
          `Version conflict on ${inventoryId} (${inv.itemName}), attempt ${attempt + 1}/${this.MAX_RETRIES}. Retrying...`,
        );
      }
    }

    throw new BadRequestException(
      `Inventory ${inventoryId} update failed after ${this.MAX_RETRIES} retries (concurrent modification)`,
    );
  }

  // ── ATOMIC ADJUSTMENT ──

  async adjustStock(params: {
    inventoryId: string;
    cafeId: string;
    branchId?: string;
    currentQty: Prisma.Decimal;
    reservedQty: Prisma.Decimal;
    reason: string;
    adjustedById?: string;
  }): Promise<void> {
    const result = await this.withRetry(
      params.inventoryId,
      'adjust',
      async () => ({ currentQty: params.currentQty, reservedQty: params.reservedQty }),
    );

    await this.prisma.stockLedger.create({
      data: {
        cafeId: params.cafeId,
        inventoryId: params.inventoryId,
        change: result.after.currentQty.sub(result.before.currentQty),
        balanceBefore: result.before.currentQty,
        balanceAfter: result.after.currentQty,
        reservedBefore: result.before.reservedQty,
        reservedAfter: result.after.reservedQty,
        reason: params.reason,
      },
    });

    this.domainEventBus.publish(DomainEventTypes.INVENTORY_ADJUSTED, {
      inventoryId: params.inventoryId,
      itemName: result.before.itemName,
      cafeId: params.cafeId,
      branchId: params.branchId || '',
      previousQty: Number(result.before.currentQty),
      newQty: Number(params.currentQty),
      previousReserved: Number(result.before.reservedQty),
      newReserved: Number(params.reservedQty),
      reason: params.reason,
      adjustedById: params.adjustedById,
    }).catch(() => {});
  }
}

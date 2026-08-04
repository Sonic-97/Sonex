import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { DomainEventBusService } from '../domain-events/domain-event-bus.service';
import { DomainEventTypes } from '../domain-events/domain-event.registry';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { InventoryCacheService } from '../inventory/services/inventory-cache.service';
import { InventoryIntegrityService } from '../inventory-integrity/inventory-integrity.service';
import { convertUnit } from '../inventory/inventory-unit.utils';
import type { PipelineItem, ReserveParams, ReserveResult, ConfirmResult, ReleaseResult } from './dto/pipeline.dto';

@Injectable()
export class InventoryPipelineService {
  private readonly logger = new Logger(InventoryPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly domainEventBus: DomainEventBusService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    private readonly inventoryCacheService: InventoryCacheService,
    private readonly integrityService: InventoryIntegrityService,
  ) {}

  // ── STEP 1: RESERVE (called inside order creation transaction) ──
  async reserve(params: ReserveParams, tx: Prisma.TransactionClient): Promise<ReserveResult> {
    const { orderId, cafeId, branchId, items } = params;
    const result: ReserveResult = { inventoryReserved: [], refrigeratorDeducted: [] };

    // --- A: Handle refrigerator stock ---
    for (const item of items) {
      if (!item.isRefrigerated) continue;
      const updated = await tx.product.updateMany({
        where: { id: item.productId, refrigeratorStock: { gte: item.quantity } },
        data: { refrigeratorStock: { decrement: item.quantity } },
      });
      if (updated.count === 0) {
        throw new BadRequestException(`Insufficient refrigerator stock for ${item.productName}`);
      }
      result.refrigeratorDeducted.push({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
      });
    }

    // --- B: Aggregate recipe ingredients across all items ---
    const recipeMap = new Map<string, {
      inventoryId: string;
      itemName: string;
      unit: string;
      totalNeeded: Prisma.Decimal;
      costPerUnit: Prisma.Decimal;
      cafeId: string;
    }>();

    const productIds = [...new Set(items.map(i => i.productId))];
    const recipes = await tx.recipeIngredient.findMany({
      where: { productId: { in: productIds } },
      include: { inventory: { select: { itemName: true, unit: true, currentQty: true, reservedQty: true, costPerUnit: true, cafeId: true } } },
    });

    const recipeByProduct = new Map<string, typeof recipes>();
    for (const r of recipes) {
      const list = recipeByProduct.get(r.productId) ?? [];
      list.push(r);
      recipeByProduct.set(r.productId, list);
    }

    for (const item of items) {
      const productRecipes = recipeByProduct.get(item.productId) ?? [];
      for (const ri of productRecipes) {
        const convertedQty = convertUnit(Number(ri.quantity), ri.unit, ri.inventory.unit);
        const totalNeeded = new Prisma.Decimal(convertedQty * item.quantity);
        const existing = recipeMap.get(ri.inventoryId);
        if (existing) {
          existing.totalNeeded = existing.totalNeeded.plus(totalNeeded);
        } else {
          recipeMap.set(ri.inventoryId, {
            inventoryId: ri.inventoryId,
            itemName: ri.inventory.itemName,
            unit: ri.inventory.unit,
            totalNeeded,
            costPerUnit: ri.inventory.costPerUnit,
            cafeId: ri.inventory.cafeId,
          });
        }
      }
    }

    // --- B2: Add extra ingredients from option choices (e.g. Large size milk, extra shot) ---
    for (const item of items) {
      if (!item.extraIngredients?.length) continue;
      for (const extra of item.extraIngredients) {
        const totalNeeded = new Prisma.Decimal(extra.quantity * item.quantity);
        const existing = recipeMap.get(extra.inventoryId);
        if (existing) {
          existing.totalNeeded = existing.totalNeeded.plus(totalNeeded);
        } else {
          recipeMap.set(extra.inventoryId, {
            inventoryId: extra.inventoryId,
            itemName: 'Extra ingredient',
            unit: extra.unit,
            totalNeeded,
            costPerUnit: new Prisma.Decimal(0),
            cafeId,
          });
        }
      }
    }

    // --- C: Reserve each ingredient (optimistic lock via retry wrapper) ---
    for (const [, ing] of recipeMap) {
      const inv = await tx.inventory.findUnique({
        where: { id: ing.inventoryId },
        select: { currentQty: true, reservedQty: true, version: true, cafeId: true, itemName: true, unit: true, costPerUnit: true },
      });
      if (!inv) continue;

      this.integrityService.assertAvailable(
        { currentQty: inv.currentQty, reservedQty: inv.reservedQty, version: inv.version, cafeId: inv.cafeId, itemName: inv.itemName },
        ing.totalNeeded,
      );

      const retryResult = await this.integrityService.withRetry(
        ing.inventoryId,
        'reserve',
        async (current) => ({
          currentQty: current.currentQty,
          reservedQty: current.reservedQty.add(ing.totalNeeded),
        }),
        tx,
      );

      await tx.stockReservation.create({
        data: {
          cafeId,
          inventoryId: ing.inventoryId,
          orderId,
          quantity: ing.totalNeeded,
          status: 'ACTIVE',
        },
      });

      await tx.stockLedger.create({
        data: {
          cafeId,
          inventoryId: ing.inventoryId,
          orderId,
          change: new Prisma.Decimal(0),
          balanceBefore: retryResult.before.currentQty,
          balanceAfter: retryResult.after.currentQty,
          reservedBefore: retryResult.before.reservedQty,
          reservedAfter: retryResult.after.reservedQty,
          reason: 'order_reservation',
        },
      });

      this.domainEventBus.publish(DomainEventTypes.INVENTORY_RESERVED, {
        orderId,
        cafeId,
        branchId,
        deductions: [{
          inventoryId: ing.inventoryId,
          itemName: ing.itemName,
          quantityDeducted: Number(ing.totalNeeded),
          unit: ing.unit,
          remainingStock: Number(retryResult.after.currentQty.sub(retryResult.after.reservedQty)),
          costPerUnit: Number(ing.costPerUnit),
          totalCost: Number(ing.totalNeeded) * Number(ing.costPerUnit),
        }],
        totalCost: Number(ing.totalNeeded) * Number(ing.costPerUnit),
      }).catch(err => this.logger.error(`Failed to publish INVENTORY_RESERVED: ${(err as Error).message}`));

      result.inventoryReserved.push({
        inventoryId: ing.inventoryId,
        itemName: ing.itemName,
        quantity: ing.totalNeeded.toString(),
      });
    }

    return result;
  }

  // ── STEP 2: CONFIRM (called inside order CONFIRMED status transition) ──
  async confirm(orderId: string, cafeId: string, tx: Prisma.TransactionClient): Promise<ConfirmResult> {
    const reservations = await tx.stockReservation.findMany({
      where: { orderId, status: 'ACTIVE' },
      include: { inventory: { select: { itemName: true, costPerUnit: true, unit: true } } },
    });

    const result: ConfirmResult = { inventoryConfirmed: [] };
    const lowStockItems: Array<{ inventoryId: string; itemName: string; remaining: string }> = [];

    for (const res of reservations) {
      const confirmResult = await this.integrityService.withRetry(
        res.inventoryId,
        'confirm',
        async (inv) => {
          const newReserved = inv.reservedQty.sub(res.quantity);
          const newCurrent = inv.currentQty.sub(res.quantity);
          if (newCurrent.lt(0)) {
            throw new BadRequestException(`Cannot confirm — negative stock would result for ${res.inventory.itemName}`);
          }
          return { currentQty: newCurrent, reservedQty: newReserved };
        },
        tx,
      );

      await tx.stockReservation.update({
        where: { id: res.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });

      await tx.inventoryConsumption.create({
        data: {
          cafeId,
          inventoryId: res.inventoryId,
          orderId,
          inCafeOrderId: null,
          productId: '',
          productName: '',
          quantity: res.quantity,
          unit: res.inventory.unit,
          costPerUnit: Number(res.inventory.costPerUnit),
          totalCost: Number(res.quantity) * Number(res.inventory.costPerUnit),
        },
      });

      await tx.stockLedger.create({
        data: {
          cafeId,
          inventoryId: res.inventoryId,
          orderId,
          change: res.quantity.negated(),
          balanceBefore: confirmResult.before.currentQty,
          balanceAfter: confirmResult.after.currentQty,
          reservedBefore: confirmResult.before.reservedQty,
          reservedAfter: confirmResult.after.reservedQty,
          reason: 'order_confirmation',
        },
      });

      result.inventoryConfirmed.push({
        inventoryId: res.inventoryId,
        itemName: res.inventory.itemName,
        deducted: res.quantity.toString(),
        remaining: confirmResult.after.currentQty.toString(),
      });

      lowStockItems.push({
        inventoryId: res.inventoryId,
        itemName: res.inventory.itemName,
        remaining: confirmResult.after.currentQty.toString(),
      });
    }

    const totalCost = result.inventoryConfirmed.reduce((sum, item) => sum + Number(item.deducted) * 0, 0);

    this.domainEventBus.publish(DomainEventTypes.INVENTORY_CONSUMED, {
      orderId,
      cafeId,
      branchId: '',
      deductions: result.inventoryConfirmed.map(item => ({
        inventoryId: item.inventoryId,
        itemName: item.itemName,
        quantityDeducted: Number(item.deducted),
        unit: 'piece',
        remainingStock: Number(item.remaining),
        costPerUnit: 0,
        totalCost: 0,
      })),
      totalCost: 0,
    }).catch(err => this.logger.error(`Failed to publish INVENTORY_CONSUMED: ${(err as Error).message}`));

    this.checkLowStock(lowStockItems).catch((err) => {
      this.logger.error(`Low stock check failed: ${(err as Error).message}`);
    });

    return result;
  }

  // ── STEP 3: RELEASE (called inside order cancel/void transaction) ──
  async release(orderId: string, tx: Prisma.TransactionClient): Promise<ReleaseResult> {
    const reservations = await tx.stockReservation.findMany({
      where: { orderId, status: { in: ['ACTIVE', 'CONFIRMED'] } },
    });

    const result: ReleaseResult = { inventoryReleased: [] };

    for (const res of reservations) {
      const releaseResult = await this.integrityService.withRetry(
        res.inventoryId,
        'release',
        async (inv) => {
          let newCurrent = inv.currentQty;
          let newReserved = inv.reservedQty;

          if (res.status === 'ACTIVE') {
            newReserved = inv.reservedQty.sub(res.quantity);
          } else if (res.status === 'CONFIRMED') {
            newCurrent = inv.currentQty.add(res.quantity);
          }
          return { currentQty: newCurrent, reservedQty: newReserved };
        },
        tx,
      );

      const action: 'release_active' | 'restore_confirmed' =
        res.status === 'CONFIRMED' ? 'restore_confirmed' : 'release_active';

      await tx.stockReservation.update({
        where: { id: res.id },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });

      const change = action === 'restore_confirmed' ? res.quantity : new Prisma.Decimal(0);

      await tx.stockLedger.create({
        data: {
          cafeId: releaseResult.before.cafeId,
          inventoryId: res.inventoryId,
          orderId,
          change,
          balanceBefore: releaseResult.before.currentQty,
          balanceAfter: releaseResult.after.currentQty,
          reservedBefore: releaseResult.before.reservedQty,
          reservedAfter: releaseResult.after.reservedQty,
          reason: action === 'restore_confirmed' ? 'order_restore' : 'order_release',
        },
      });

      this.domainEventBus.publish(DomainEventTypes.INVENTORY_RELEASED, {
        orderId,
        cafeId: releaseResult.before.cafeId,
        inventoryId: res.inventoryId,
        itemName: releaseResult.before.itemName,
        quantity: Number(res.quantity),
        action,
      }).catch(err => this.logger.error(`Failed to publish INVENTORY_RELEASED: ${(err as Error).message}`));

      result.inventoryReleased.push({
        inventoryId: res.inventoryId,
        action,
        quantity: res.quantity.toString(),
      });
    }

    return result;
  }

  // ── LOW STOCK CHECK (fire-and-forget after confirm) ──
  private async checkLowStock(
    items: Array<{ inventoryId: string; itemName: string; remaining: string }>,
  ): Promise<void> {
    for (const item of items) {
      const inventory = await this.prisma.inventory.findUnique({
        where: { id: item.inventoryId },
        select: { currentQty: true, minThreshold: true, itemName: true, cafeId: true, branchId: true },
      });
      if (!inventory) continue;

      const currentQty = new Prisma.Decimal(item.remaining);
      const threshold = inventory.minThreshold;
      let severity: 'warning' | 'critical' | null = null;

      if (currentQty.lte(threshold)) {
        severity = 'critical';
      } else if (currentQty.lte(threshold.mul(2))) {
        severity = 'warning';
      }

      if (severity) {
        this.eventsService.emit('low_stock.alert', {
          ingredientId: item.inventoryId,
          name: item.itemName,
          currentStock: currentQty.toString(),
          threshold: threshold.toString(),
          severity,
        });

        this.domainEventBus.publish(DomainEventTypes.INVENTORY_LOW_STOCK, {
          inventoryId: item.inventoryId,
          itemName: item.itemName,
          cafeId: inventory.cafeId,
          branchId: inventory.branchId || '',
          currentQty: Number(currentQty),
          threshold: Number(threshold),
          unit: 'piece',
        }).catch(err => this.logger.error(`Failed to publish INVENTORY_LOW_STOCK: ${(err as Error).message}`));

        if (severity === 'critical') {
          await this.notificationService.createNotification({
            cafeId: inventory.cafeId,
            branchId: inventory.branchId || undefined,
            type: 'LOW_STOCK',
            title: 'تنبيه نقص مخزون',
            message: `لقد انخفض مخزون ${item.itemName} إلى ${currentQty.toString()} وهو أقل من الحد الأدنى المسموح به (${threshold.toString()}).`,
            roleTarget: 'Cafe',
          });
        }
      }
    }
  }
}

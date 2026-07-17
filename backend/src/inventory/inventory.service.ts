import { BadRequestException, Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import { InventoryCacheService } from './services/inventory-cache.service';
import { QueueService } from '../queue/queue.service';
import { NotificationService } from '../notifications/notification.service';
import { generateEntityCode } from '../common/utils/code-generator';
import { convertUnit } from './inventory-unit.utils';

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly eventsService: EventsService,
    private readonly inventoryCacheService: InventoryCacheService,
    private readonly queueService: QueueService,
    private readonly notificationService: NotificationService,
  ) {}

  // ── OPTIMISTIC LOCK HELPER ──

  private async withOptimisticLock<T>(
    inventoryId: string,
    fn: (inventory: { currentQty: Prisma.Decimal; reservedQty: Prisma.Decimal; version: number; cafeId: string; itemName: string; unit: string; costPerUnit: Prisma.Decimal }) => { currentQty: Prisma.Decimal; reservedQty: Prisma.Decimal } | null,
    maxRetries = 3,
  ): Promise<{ before: { currentQty: Prisma.Decimal; reservedQty: Prisma.Decimal }; after: { currentQty: Prisma.Decimal; reservedQty: Prisma.Decimal }; version: number } | null> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const inv = await this.prisma.inventory.findUnique({
        where: { id: inventoryId },
        select: { currentQty: true, reservedQty: true, version: true, cafeId: true, itemName: true, unit: true, costPerUnit: true },
      });
      if (!inv) return null;

      const delta = fn(inv);
      if (!delta) return null;

      const result = await this.prisma.inventory.updateMany({
        where: { id: inventoryId, version: inv.version },
        data: {
          currentQty: delta.currentQty,
          reservedQty: delta.reservedQty,
          version: { increment: 1 },
        },
      });

      if (result.count > 0) {
        return { before: { currentQty: inv.currentQty, reservedQty: inv.reservedQty }, after: delta, version: inv.version + 1 };
      }
    }
    throw new BadRequestException(`Inventory ${inventoryId} update failed after ${maxRetries} retries (concurrent modification)`);
  }

  // ── STOCK LEDGER ──

  private async createLedgerEntry(params: {
    cafeId: string;
    inventoryId: string;
    orderId?: string;
    change: Prisma.Decimal;
    balanceBefore: Prisma.Decimal;
    balanceAfter: Prisma.Decimal;
    reservedBefore: Prisma.Decimal;
    reservedAfter: Prisma.Decimal;
    reason: string;
    idempotencyKey?: string;
  }): Promise<void> {
    await this.prisma.stockLedger.create({
      data: {
        cafeId: params.cafeId,
        inventoryId: params.inventoryId,
        orderId: params.orderId ?? null,
        change: params.change,
        balanceBefore: params.balanceBefore,
        balanceAfter: params.balanceAfter,
        reservedBefore: params.reservedBefore,
        reservedAfter: params.reservedAfter,
        reason: params.reason,
        idempotencyKey: params.idempotencyKey ?? null,
      },
    });
  }

  // ── RESERVATION ENGINE ──

  async reserveStock(orderId: string, cafeId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              include: { recipe: { include: { inventory: true } } },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    for (const item of order.items) {
      for (const ri of item.product.recipe ?? []) {
        const qty = new Prisma.Decimal(convertUnit(Number(ri.quantity), ri.unit, ri.inventory.unit) * item.quantity);

        const result = await this.withOptimisticLock(ri.inventoryId, (inv) => {
          const available = inv.currentQty.sub(inv.reservedQty);
          if (available.lt(qty)) {
            throw new BadRequestException(`Insufficient stock for ${inv.itemName}. Available: ${available.toString()}, needed: ${qty.toString()}`);
          }
          return { currentQty: inv.currentQty, reservedQty: inv.reservedQty.add(qty) };
        });

        if (!result) continue;

        await this.prisma.stockReservation.create({
          data: {
            cafeId,
            inventoryId: ri.inventoryId,
            orderId,
            quantity: qty,
            status: 'ACTIVE',
          },
        });

        await this.createLedgerEntry({
          cafeId,
          inventoryId: ri.inventoryId,
          orderId,
          change: new Prisma.Decimal(0),
          balanceBefore: result.before.currentQty,
          balanceAfter: result.after.currentQty,
          reservedBefore: result.before.reservedQty,
          reservedAfter: result.after.reservedQty,
          reason: 'order_reservation',
        });
      }
    }
  }

  async confirmReservation(orderId: string, cafeId?: string): Promise<Array<{ inventoryId: string; itemName: string; deducted: string; remaining: string }>> {
    const reservations = await this.prisma.stockReservation.findMany({
      where: { orderId, status: 'ACTIVE' },
      include: { inventory: { select: { itemName: true } } },
    });

    const deducted: Array<{ inventoryId: string; itemName: string; deducted: string; remaining: string }> = [];

    for (const res of reservations) {
      const result = await this.withOptimisticLock(res.inventoryId, (inv) => {
        const newReserved = inv.reservedQty.sub(res.quantity);
        const newCurrent = inv.currentQty.sub(res.quantity);
        if (newCurrent.lt(0)) {
          throw new BadRequestException(`Cannot confirm — negative stock for ${inv.itemName}`);
        }
        return { currentQty: newCurrent, reservedQty: newReserved };
      });

      if (!result) throw new NotFoundException(`Inventory ${res.inventoryId} not found for reservation confirm`);

      await this.prisma.stockReservation.update({
        where: { id: res.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });

      await this.prisma.inventoryConsumption.create({
        data: {
          cafeId: res.cafeId,
          inventoryId: res.inventoryId,
          orderId,
          inCafeOrderId: null,
          productId: '',
          productName: '',
          quantity: res.quantity,
          unit: '',
          costPerUnit: 0,
          totalCost: 0,
        },
      });

      await this.createLedgerEntry({
        cafeId: res.cafeId,
        inventoryId: res.inventoryId,
        orderId,
        change: res.quantity.negated(),
        balanceBefore: result.before.currentQty,
        balanceAfter: result.after.currentQty,
        reservedBefore: result.before.reservedQty,
        reservedAfter: result.after.reservedQty,
        reason: 'order_confirmation',
      });

      deducted.push({
        inventoryId: res.inventoryId,
        itemName: res.inventory.itemName,
        deducted: result.before.currentQty.sub(result.after.currentQty).toString(),
        remaining: result.after.currentQty.toString(),
      });
    }

    return deducted;
  }

  async releaseReservation(orderId: string, cafeId?: string): Promise<void> {
    const reservations = await this.prisma.stockReservation.findMany({
      where: { orderId, status: { in: ['ACTIVE', 'CONFIRMED'] } },
    });

    for (const res of reservations) {
      const result = await this.withOptimisticLock(res.inventoryId, (inv) => {
        let newCurrent = inv.currentQty;
        let newReserved = inv.reservedQty;
        if (res.status === 'ACTIVE') {
          newReserved = inv.reservedQty.sub(res.quantity);
        } else if (res.status === 'CONFIRMED') {
          newCurrent = inv.currentQty.add(res.quantity);
        }
        return { currentQty: newCurrent, reservedQty: newReserved };
      });

      if (!result) continue;

      await this.prisma.stockReservation.update({
        where: { id: res.id },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });

      await this.createLedgerEntry({
        cafeId: res.cafeId,
        inventoryId: res.inventoryId,
        orderId,
        change: res.status === 'CONFIRMED' ? res.quantity : new Prisma.Decimal(0),
        balanceBefore: result.before.currentQty,
        balanceAfter: result.after.currentQty,
        reservedBefore: result.before.reservedQty,
        reservedAfter: result.after.reservedQty,
        reason: res.status === 'CONFIRMED' ? 'order_restore' : 'order_release',
      });
    }
  }

// [REMOVED in PR #4 — All deduction logic unified into InventoryPipelineService]
// Old methods removed: deductRecipeStock, deductStock, deductStockForItems, restoreStockForItems

  // ── LOW STOCK INTELLIGENCE ──

  async checkLowStock(
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

  // ── QUERIES ──

  async findAll(branchId?: string, cafeId?: string) {
    const where: Prisma.InventoryWhereInput = {};
    if (cafeId) {
      where.cafeId = cafeId;
    }
    if (branchId) {
      where.branchId = branchId;
    }
    return this.prisma.inventory.findMany({
      where,
      orderBy: { itemName: 'asc' },
    });
  }

  async create(data: {
    itemName: string;
    emoji?: string;
    unit: string;
    currentQty: number;
    minThreshold: number;
    costPerUnit: number;
    cafeId: string;
    branchId: string;
  }) {
    const code = await generateEntityCode(this.prisma, data.cafeId, 'inventory');
    const item = await this.prisma.inventory.create({
      data: {
        cafeId: data.cafeId,
        branchId: data.branchId,
        itemName: data.itemName,
        code,
        emoji: data.emoji || '📦',
        unit: data.unit,
        currentQty: data.currentQty,
        minThreshold: data.minThreshold,
        costPerUnit: data.costPerUnit,
        version: 1,
      },
    });
    this.auditService.logAction({
      cafeId: data.cafeId,
      action: 'INVENTORY_CREATE',
      entity: 'Inventory',
      entityId: item.id,
      metadata: {
        itemName: data.itemName,
        code,
        unit: data.unit,
        category: data.emoji || '📦',
        costPerUnit: data.costPerUnit,
        currentQty: data.currentQty,
        minThreshold: data.minThreshold,
        branchId: data.branchId,
      },
    });
    return item;
  }

  async update(id: string, data: { itemName?: string; unit?: string; currentQty?: number; minThreshold?: number; costPerUnit?: number }, cafeId?: string) {
    const item = await this.prisma.inventory.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Inventory item not found');
    if (cafeId && item.cafeId !== cafeId) throw new ForbiddenException('Unauthorized cafe access');
    const updated = await this.prisma.inventory.update({ where: { id }, data });
    this.auditService.logAction({
      cafeId: item.cafeId,
      action: 'INVENTORY_UPDATE',
      entity: 'Inventory',
      entityId: id,
      metadata: {
        before: {
          itemName: item.itemName,
          unit: item.unit,
          currentQty: item.currentQty.toString(),
          minThreshold: item.minThreshold.toString(),
          costPerUnit: item.costPerUnit.toString(),
        },
        after: {
          itemName: updated.itemName,
          unit: updated.unit,
          currentQty: updated.currentQty.toString(),
          minThreshold: updated.minThreshold.toString(),
          costPerUnit: updated.costPerUnit.toString(),
        },
      },
    });
    return updated;
  }

  async remove(id: string, cafeId?: string) {
    const item = await this.prisma.inventory.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Inventory item not found');
    if (cafeId && item.cafeId !== cafeId) throw new ForbiddenException('Unauthorized cafe access');
    await this.prisma.inventory.delete({ where: { id } });
    this.auditService.logAction({
      cafeId: item.cafeId,
      action: 'INVENTORY_DELETE',
      entity: 'Inventory',
      entityId: id,
      metadata: {
        itemName: item.itemName,
        unit: item.unit,
        currentQty: item.currentQty.toString(),
        minThreshold: item.minThreshold.toString(),
        costPerUnit: item.costPerUnit.toString(),
        code: item.code,
      },
    });
  }

  async updateThreshold(id: string, minThreshold: number, cafeId?: string) {
    const item = await this.prisma.inventory.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Inventory item not found');
    if (cafeId && item.cafeId !== cafeId) throw new ForbiddenException('Unauthorized cafe access');
    const updated = await this.prisma.inventory.update({ where: { id }, data: { minThreshold } });
    this.auditService.logAction({
      cafeId: item.cafeId,
      action: 'INVENTORY_THRESHOLD_CHANGE',
      entity: 'Inventory',
      entityId: id,
      metadata: {
        itemName: item.itemName,
        oldThreshold: item.minThreshold.toString(),
        newThreshold: updated.minThreshold.toString(),
      },
    });
    return updated;
  }

  async getLowStockItems(cafeId: string) {
    const items = await this.prisma.inventory.findMany({
      where: { cafeId },
      orderBy: { itemName: 'asc' },
    });
    return items.filter((i) => Number(i.currentQty) <= Number(i.minThreshold));
  }

  async getStockMovements(cafeId: string, from?: string, to?: string) {
    const where: Record<string, unknown> = { cafeId };
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
      if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to);
    }
    return this.prisma.inventorySyncLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { inventory: { select: { itemName: true, unit: true } } },
    });
  }

  async refillStock(input: {
    inventoryId: string;
    quantity: number;
    cost?: number;
    supplier?: string;
    notes?: string;
    staffId?: string;
    cafeId: string;
    branchId: string;
  }) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new BadRequestException('Stock quantity must be greater than zero');
    }

    const inventory = await this.prisma.inventory.findUnique({
      where: { id: input.inventoryId },
    });
    if (!inventory) throw new NotFoundException('Inventory item not found');
    if (input.cafeId && inventory.cafeId !== input.cafeId) {
      throw new ForbiddenException('Unauthorized cafe access');
    }

    let targetBranchId = input.branchId;
    if (!targetBranchId) {
      const defaultBranch = await this.prisma.branch.findFirst({
        where: { cafeId: input.cafeId },
        select: { id: true },
      });
      targetBranchId = defaultBranch?.id;
    }
    if (!targetBranchId) throw new BadRequestException('No active branch found');

    const quantity = new Prisma.Decimal(input.quantity);
    const updated = await this.prisma.inventory.update({
      where: { id: input.inventoryId },
      data: { currentQty: { increment: quantity }, version: { increment: 1 } },
    });

    await this.prisma.inventoryPurchase.create({
      data: {
        cafeId: input.cafeId,
        branchId: targetBranchId,
        itemName: inventory.itemName,
        quantity: input.quantity,
        unit: inventory.unit,
        cost: input.cost ?? null,
        supplier: input.supplier ?? null,
        purchasedById: input.staffId ?? null,
        inventoryId: input.inventoryId,
        notes: input.notes ?? null,
      } as any,
    });

    await this.prisma.expense.create({
      data: {
        cafeId: input.cafeId,
        branchId: targetBranchId,
        category: 'Inventory Purchase',
        amount: input.cost ?? 0,
        description: `شراء ${inventory.itemName} - كمية: ${input.quantity} ${inventory.unit}`,
        expenseDate: new Date(),
      } as any,
    });

    await this.prisma.inventorySyncLog.create({
      data: {
        cafeId: input.cafeId,
        branchId: targetBranchId,
        inventoryId: input.inventoryId,
        change: Math.round(input.quantity),
        status: 'completed',
      } as any,
    });

    await this.createLedgerEntry({
      cafeId: input.cafeId,
      inventoryId: input.inventoryId,
      change: quantity,
      balanceBefore: inventory.currentQty,
      balanceAfter: updated.currentQty,
      reservedBefore: inventory.reservedQty ?? new Prisma.Decimal(0),
      reservedAfter: inventory.reservedQty ?? new Prisma.Decimal(0),
      reason: 'refill',
    });

    this.auditService.logAction({
      cafeId: input.cafeId,
      userId: input.staffId,
      action: 'STOCK_REFILL',
      entity: 'Inventory',
      entityId: input.inventoryId,
      metadata: {
        quantity: quantity.toString(),
        cost: input.cost?.toString(),
        supplier: input.supplier,
        beforeQty: inventory.currentQty.toString(),
        afterQty: updated.currentQty.toString(),
      },
    });

    return updated;
  }

  async addStock(input: {
    inventoryId: string;
    quantity: number;
    userId?: string;
    reason?: string;
    cafeId?: string;
  }) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new BadRequestException('Stock quantity must be greater than zero');
    }

    return this.prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({
        where: { id: input.inventoryId },
      });

      if (!inventory) {
        throw new NotFoundException(`Inventory item with ID ${input.inventoryId} not found`);
      }
      if (input.cafeId && inventory.cafeId !== input.cafeId) {
        throw new ForbiddenException('Unauthorized cafe access for this inventory item');
      }

      const quantity = new Prisma.Decimal(input.quantity);
      const updatedInventory = await tx.inventory.update({
        where: { id: input.inventoryId },
        data: {
          currentQty: { increment: quantity },
          version: { increment: 1 },
        },
      });

      await tx.stockLedger.create({
        data: {
          cafeId: inventory.cafeId,
          inventoryId: input.inventoryId,
          change: quantity,
          balanceBefore: inventory.currentQty,
          balanceAfter: updatedInventory.currentQty,
          reservedBefore: inventory.reservedQty ?? new Prisma.Decimal(0),
          reservedAfter: updatedInventory.reservedQty ?? new Prisma.Decimal(0),
          reason: input.reason ?? 'manual_adjustment',
        },
      });

      this.auditService.logAction({
        cafeId: input.cafeId,
        userId: input.userId,
        action: 'STOCK_ADDED',
        entity: 'Inventory',
        entityId: input.inventoryId,
        metadata: {
          quantity: quantity.toString(),
          reason: input.reason ?? null,
          beforeQty: inventory.currentQty.toString(),
          afterQty: updatedInventory.currentQty.toString(),
        },
      });

      return updatedInventory;
    });
  }

  // ── CONSUMPTION REPORTS ──

  async getConsumption(cafeId: string, from?: string, to?: string) {
    const where: Record<string, unknown> = { cafeId };
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
      if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to + 'T23:59:59.999Z');
    }
    return this.prisma.inventoryConsumption.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        inventory: { select: { itemName: true, unit: true, code: true, emoji: true } },
      },
    });
  }

  async getIngredientUsage(cafeId: string, from?: string, to?: string) {
    const where: Record<string, unknown> = { cafeId };
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
      if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to + 'T23:59:59.999Z');
    }
    const records = await this.prisma.inventoryConsumption.findMany({
      where,
      select: {
        inventoryId: true,
        quantity: true,
        totalCost: true,
        unit: true,
        inventory: { select: { itemName: true, code: true, emoji: true } },
      },
    });

    const grouped = new Map<string, { inventoryId: string; itemName: string; code: string; emoji: string; totalQuantity: number; totalCost: number; unit: string; count: number }>();
    for (const r of records) {
      const key = r.inventoryId;
      const existing = grouped.get(key);
      if (existing) {
        existing.totalQuantity += Number(r.quantity);
        existing.totalCost += Number(r.totalCost);
        existing.count += 1;
      } else {
        grouped.set(key, {
          inventoryId: key,
          itemName: r.inventory.itemName,
          code: r.inventory.code ?? '',
          emoji: r.inventory.emoji,
          totalQuantity: Number(r.quantity),
          totalCost: Number(r.totalCost),
          unit: r.unit,
          count: 1,
        });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => b.totalCost - a.totalCost);
  }

  async getMostConsumed(cafeId: string, from?: string, to?: string, limit = 10) {
    const usage = await this.getIngredientUsage(cafeId, from, to);
    return usage.slice(0, limit);
  }

  async getCustomUnits(cafeId: string) {
    return this.prisma.customUnit.findMany({
      where: { cafeId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
  }

  async createCustomUnit(name: string, cafeId: string) {
    if (!name || !name.trim()) {
      throw new BadRequestException('اسم الوحدة مطلوب');
    }
    const existing = await this.prisma.customUnit.findUnique({
      where: { cafeId_name: { cafeId, name: name.trim() } },
    });
    if (existing) {
      throw new BadRequestException('هذه الوحدة موجودة مسبقاً');
    }
    return this.prisma.customUnit.create({
      data: { cafeId, name: name.trim() },
      select: { id: true, name: true },
    });
  }
}





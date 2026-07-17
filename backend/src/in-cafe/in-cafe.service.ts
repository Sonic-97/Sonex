import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryPipelineService } from '../inventory-pipeline/inventory-pipeline.service';
import { FinancialEngineService } from '../financial-engine/financial-engine.service';
import { IdempotencyService } from '../common/idempotency.service';
import { AuditService } from '../audit/audit.service';
import { CreateInCafeOrderDto, SelectedOptionDto } from './dto/create-in-cafe-order.dto';
import type { IngredientImpact } from '../inventory-pipeline/dto/pipeline.dto';
import { UpdatePaymentDto, PaymentStatus } from './dto/update-payment.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { EditInCafeOrderDto } from './dto/edit-in-cafe-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { HoldOrderDto } from './dto/hold-order.dto';
import { UpdateOrderNoteDto } from './dto/update-order-note.dto';
import { AssignCustomerDto } from './dto/assign-customer.dto';

@Injectable()
export class InCafeService {
  private orderCounter = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly inventoryService: InventoryService,
    private readonly inventoryPipeline: InventoryPipelineService,
    private readonly financialEngine: FinancialEngineService,
    private readonly idempotencyService: IdempotencyService,
    private readonly auditService: AuditService,
  ) {}

  private generateCode(): string {
    this.orderCounter += 1;
    const seq = String(this.orderCounter % 10000).padStart(4, '0');
    const date = new Date();
    return `CF-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${seq}`;
  }

  async createOrder(dto: CreateInCafeOrderDto, cafeId?: string) {
    const products = await this.prisma.product.findMany({
      where: { id: { in: dto.items.map(i => i.productId) }, active: true, ...(cafeId ? { cafeId } : {}) },
    });

    if (products.length !== dto.items.length) {
      throw new BadRequestException('One or more products not found or inactive');
    }

    const productMap = new Map(products.map(p => [p.id, p]));

    // Preload all options for products that have selectedOptions
    const itemsWithOpts = dto.items.filter(i => i.selectedOptions?.length);
    const optionProductIds = [...new Set(itemsWithOpts.map(i => i.productId))];
    const allOptions = optionProductIds.length
      ? await this.prisma.productOption.findMany({
          where: { productId: { in: optionProductIds }, cafeId: cafeId! },
        })
      : [];
    const optionsByProduct = new Map<string, typeof allOptions>();
    for (const opt of allOptions) {
      const list = optionsByProduct.get(opt.productId) ?? [];
      list.push(opt);
      optionsByProduct.set(opt.productId, list);
    }

    // Pre-compute option-adjusted pricing and extra ingredients for each item
    const enrichedItems = dto.items.map(item => {
      const product = productMap.get(item.productId)!;
      const standardPrice = Number(product.cafePrice ?? product.price);
      let chargedPrice = item.unitPrice ?? standardPrice;
      const extraIngredients: IngredientImpact[] = [];
      const selectedOptionRecords: any[] = [];

      const productOptions = optionsByProduct.get(item.productId) ?? [];
      if (item.selectedOptions?.length && productOptions.length) {
        for (const sel of item.selectedOptions) {
          const opt = productOptions.find(o => o.id === sel.optionId);
          if (!opt) continue;
          const choices = (opt.choices as any[]) ?? [];
          const choice = choices.find((c: any) => c.label === sel.choiceLabel);
          if (!choice) continue;
          chargedPrice += Number(choice.priceAdjust ?? 0);
          if (choice.ingredientImpacts?.length) {
            for (const imp of choice.ingredientImpacts) {
              extraIngredients.push({
                inventoryId: imp.inventoryId,
                quantity: Number(imp.quantity),
                unit: imp.unit ?? 'g',
              });
            }
          }
          selectedOptionRecords.push({
            optionId: sel.optionId,
            optionName: opt.name,
            choiceLabel: sel.choiceLabel,
            priceAdjust: Number(choice.priceAdjust ?? 0),
            ingredientImpacts: (choice.ingredientImpacts ?? []).map((imp: any) => ({
              inventoryId: imp.inventoryId,
              quantity: Number(imp.quantity),
              unit: imp.unit ?? 'g',
            })),
          });
        }
      }

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: chargedPrice,
        notes: item.notes,
        selectedOptions: selectedOptionRecords,
        extraIngredients,
      };
    });

    const orderType = dto.orderType || 'DINE_IN';
    const sourceType = dto.sourceType || 'INSIDE_CAFE';
    const employeeId = dto.employeeId || null;
    const tableNumber = dto.tableNumber || null;
    const paymentStatus = dto.paymentStatus || 'NOT_PAID';
    const paymentMethod = dto.paymentMethod || null;

    const total = enrichedItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const isPaid = paymentStatus === 'PAID';
    const paidAmount = isPaid ? total : 0;
    const remainingBalance = isPaid ? 0 : total;

    if (dto.idempotencyKey && cafeId) {
      const existing = await this.idempotencyService.isProcessed('http_api', dto.idempotencyKey, cafeId);
      if (existing.duplicated && existing.entityId) {
        const replayedOrder = await this.prisma.inCafeOrder.findUnique({
          where: { id: existing.entityId },
          include: { items: { include: { product: true } }, createdBy: true, priceOverrides: true },
        });
        if (replayedOrder) {
          return { data: replayedOrder, replayed: true } as any;
        }
      }
    }

    const staff = await this.prisma.staff.findUnique({
      where: { id: dto.createdById },
      select: { branchId: true },
    });
    if (!staff) throw new BadRequestException('Creator staff not found');
    const branchId = staff.branchId;

    let customerId = dto.customerId;
    if (!customerId && dto.customerPhone) {
      const existing = await this.prisma.customer.findUnique({
        where: {
          cafeId_branchId_phone: {
            cafeId: cafeId!,
            branchId,
            phone: dto.customerPhone,
          },
        },
      });
      if (existing) {
        customerId = existing.id;
      }
    }

    const order = await this.prisma.$transaction(async tx => {
      if (customerId) {
        const prefProducts = await tx.customer.findUnique({
          where: { id: customerId },
          select: { preferredProducts: true, totalCafeVisits: true, totalCafeSpent: true },
        });

        const existingPrefs = (prefProducts?.preferredProducts as string[]) ?? [];
        const newPrefs = [...new Set([...existingPrefs, ...dto.items.map(i => i.productId)])];

        await tx.customer.update({
          where: { id: customerId },
          data: {
            totalCafeVisits: { increment: 1 },
            totalCafeSpent: { increment: total },
            preferredProducts: newPrefs,
            lastOrderDate: new Date(),
          },
        });
      }

      const created = await tx.inCafeOrder.create({
        data: {
          cafeId: cafeId!,
          branchId,
          code: this.generateCode(),
          customerName: dto.customerName ?? 'Walk-in Customer',
          customerPhone: dto.customerPhone ?? null,
          customerId: customerId ?? null,
          orderType,
          sourceType,
          employeeId,
          tableNumber,
          status: 'NEW',
          paymentStatus,
          paymentMethod,
          isPaid,
          paidAmount,
          remainingBalance,
          createdById: dto.createdById,
          total,
          items: {
            create: enrichedItems.map(i => ({
              cafeId: cafeId!,
              productId: i.productId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              notes: i.notes,
              selectedOptions: i.selectedOptions,
            })),
          },
        },
        include: { items: { include: { product: true } }, createdBy: true, priceOverrides: true },
      });

      if (isPaid) {
        await this.financialEngine.createFinancialTransaction(
          tx, cafeId!, paidAmount, 'pos', created.id, dto.createdById,
          { method: paymentMethod, orderType: 'in_cafe', orderCode: created.code },
        );

        if (paymentMethod === 'CASH') {
          await tx.staff.update({
            where: { id: dto.createdById },
            data: { currentCashWallet: { increment: paidAmount } }
          });
        }
      }

      // Inventory pipeline: reserve stock + deduct refrigerator stock
      const pipelineResult = await this.inventoryPipeline.reserve({
        orderId: created.id,
        cafeId: cafeId!,
        branchId: created.branchId,
        items: enrichedItems.map(i => {
          const p = productMap.get(i.productId)!;
          return {
            productId: i.productId,
            productName: p.name,
            quantity: i.quantity,
            isRefrigerated: p.isRefrigerated,
            refrigeratorInventoryId: p.refrigeratorInventoryId,
            extraIngredients: i.extraIngredients.length > 0 ? i.extraIngredients : undefined,
          };
        }),
      }, tx);

      if (pipelineResult.inventoryReserved.length > 0 || pipelineResult.refrigeratorDeducted.length > 0) {
        await tx.inCafeOrder.update({
          where: { id: created.id },
          data: { stockDeducted: true },
        });
      }

      if (dto.idempotencyKey) {
        await this.idempotencyService.record('http_api', dto.idempotencyKey, 'InCafeOrder', created.id, 'completed', cafeId!, tx);
      }

      return created;
    }) as any;

    // Emit product.updated events for real-time stock sync
    for (const item of dto.items) {
      const product = productMap.get(item.productId)!;
      if (product.isRefrigerated) {
        this.events.emit('product.updated', {
          productId: product.id,
          name: product.name,
          action: 'updated',
        });
      }
    }

    this.events.emitToOwner('inCafe.order.created', { order } as any);
    this.events.emitToBarista('inCafe.order.created', { order } as any);

    if (dto.idempotencyKey) {
      return { data: order, replayed: false } as any;
    }
    return order;
  }

  async updatePayment(id: string, dto: UpdatePaymentDto, staffId?: string, cafeId?: string) {
    const order = await this.prisma.inCafeOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('In-café order not found');
    if (cafeId && order.cafeId !== cafeId) throw new ForbiddenException('Unauthorized cafe access for this order');
    if (order.status === 'VOID') throw new BadRequestException('Cannot update payment for voided order');

    const previousStatus = order.paymentStatus;
    const effectivePaidAmount =
      dto.paymentStatus === PaymentStatus.PAID && dto.paidAmount === 0
        ? Number(order.total)
        : dto.paidAmount;
    const remainingBalance = Number(order.total) - effectivePaidAmount;

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.inCafeOrder.update({
        where: { id },
        data: {
          paymentStatus: dto.paymentStatus,
          paymentMethod: dto.paymentMethod ?? null,
          paidAmount: effectivePaidAmount,
          remainingBalance: remainingBalance > 0 ? remainingBalance : 0,
          isPaid: dto.paymentStatus === PaymentStatus.PAID,
          paymentTimestamp: effectivePaidAmount > 0 ? new Date() : undefined,
        },
        include: { items: { include: { product: true } }, createdBy: true },
      });

      if (dto.paymentStatus === PaymentStatus.PAID && previousStatus !== PaymentStatus.PAID) {
        await this.financialEngine.createFinancialTransaction(
          tx, order.cafeId, effectivePaidAmount, 'pos', order.id, staffId,
          { method: dto.paymentMethod, orderType: 'in_cafe', orderCode: updatedOrder.code },
        );

        if (dto.paymentMethod === 'CASH' && staffId) {
          await tx.staff.update({
            where: { id: staffId },
            data: { currentCashWallet: { increment: effectivePaidAmount } }
          });
        }
      }

      // PaymentLog belongs to delivery Order records only. In-cafe payments
      // are recorded through the financial transaction and audit log below.

      await this.auditService.logTransactional(tx, {
        cafeId: order.cafeId,
        action: 'PAYMENT_CHANGE',
        entityType: 'InCafeOrder',
        entityId: id,
        actorId: staffId ?? null,
        actorRole: staffId ? ('BARISTA' as any) : null,
        beforeState: { paymentStatus: previousStatus, paidAmount: Number(order.paidAmount) },
        afterState: { paymentStatus: dto.paymentStatus, paidAmount: effectivePaidAmount, paymentMethod: dto.paymentMethod ?? order.paymentMethod },
        metadata: { remainingBalance },
      });

      return updatedOrder;
    });

    this.events.emitToOwner('inCafe.payment.updated', { order: updated } as any);
    this.events.emitToBarista('inCafe.payment.updated', { order: updated } as any);

    if (dto.paymentStatus === PaymentStatus.PAID && previousStatus !== PaymentStatus.PAID) {
      this.events.emit('in_cafe_order.paid', {
        orderId: updated.id,
        cafeId: order.cafeId,
        total: Number(updated.total),
        paidAmount: effectivePaidAmount,
        staffId: staffId || null,
      });
    }

    return updated;
  }

  async updateOrderStatus(id: string, dto: UpdateOrderStatusDto, cafeId?: string) {
    const order = await this.prisma.inCafeOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (cafeId && order.cafeId !== cafeId) throw new ForbiddenException();
    if (order.status === 'VOID') throw new BadRequestException('Cannot update status of a voided order');

    const validTransitions: Record<string, string[]> = {
      NEW: ['PREPARING', 'ON_HOLD'],
      PREPARING: ['READY', 'ON_HOLD'],
      ON_HOLD: ['PREPARING', 'NEW'],
      READY: ['DELIVERED'],
      DELIVERED: ['COMPLETED'],
      COMPLETED: [],
    };

    const allowed = validTransitions[order.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Cannot transition from ${order.status} to ${dto.status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.inCafeOrder.update({
        where: { id },
        data: { status: dto.status },
        include: { items: { include: { product: true } }, createdBy: true, priceOverrides: true },
      });

      await this.auditService.logTransactional(tx, {
        cafeId: order.cafeId,
        action: 'ORDER_STATUS_UPDATED',
        entityType: 'InCafeOrder',
        entityId: id,
        actorRole: null,
        beforeState: { status: order.status },
        afterState: { status: dto.status },
        metadata: { previousStatus: order.status },
      });

      return updatedOrder;
    });

    await this.events.emit('in-cafe-order-updated', updated);
    return updated;
  }

  async voidOrder(id: string, reason: string, staffId?: string, cafeId?: string) {
    const order = await this.prisma.inCafeOrder.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('In-café order not found');
    if (cafeId && order.cafeId !== cafeId) throw new ForbiddenException('Unauthorized cafe access for this order');
    if (order.status === 'VOID') throw new BadRequestException('Order is already voided');

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.inCafeOrder.update({
        where: { id },
        data: { status: 'VOID', voidReason: reason },
        include: { items: { include: { product: true } }, createdBy: true },
      });

      const hoursSinceOrder = (Date.now() - order.createdAt.getTime()) / (1000 * 60 * 60);
      const isRecentOrder = hoursSinceOrder <= 12;

      if (order.isPaid && order.paymentMethod === 'CASH' && staffId && isRecentOrder) {
        await tx.staff.update({
          where: { id: staffId },
          data: { currentCashWallet: { decrement: order.paidAmount } }
        });
      }

      if (order.isPaid) {
        await tx.financialTransaction.create({
          data: {
            cafeId: order.cafeId,
            amount: -Number(order.paidAmount),
            type: 'income_void',
            source: 'pos',
            referenceId: order.id,
            employeeId: staffId || null,
          }
        });
      }

      if (order.stockDeducted) {
        // Restore refrigerator stock
        for (const item of order.items) {
          if (item.product.isRefrigerated) {
            await tx.product.update({
              where: { id: item.productId },
              data: { refrigeratorStock: { increment: item.quantity } },
            });
          }
        }

        // Release inventory reservations
        await this.inventoryPipeline.release(order.id, tx);

        await tx.inCafeOrder.update({
          where: { id },
          data: { stockDeducted: false },
        });
      }

      await this.auditService.logTransactional(tx, {
        cafeId: order.cafeId,
        action: 'PAYMENT_VOID',
        entityType: 'InCafeOrder',
        entityId: id,
        actorId: staffId ?? null,
        actorRole: staffId ? ('STAFF' as any) : null,
        beforeState: { status: order.status, paymentStatus: order.paymentStatus, isPaid: order.isPaid, paidAmount: Number(order.paidAmount) },
        afterState: { status: 'VOID', voidReason: reason, paymentStatus: 'VOID' },
        metadata: { reason, stockDeducted: order.stockDeducted },
      });

      return res;
    });

    for (const item of order.items) {
      if (item.product.isRefrigerated) {
        this.events.emit('product.updated', {
          productId: item.productId,
          name: item.product.name,
          action: 'updated',
        });
      }
    }

    this.events.emitToOwner('inCafe.order.updated', { order: updated } as any);
    this.events.emitToBarista('inCafe.order.updated', { order: updated } as any);

    return updated;
  }

  async getCustomerDebtSummary(cafeId?: string) {
    const where: any = {
      paymentStatus: { not: 'PAID' },
      status: { not: 'VOID' },
    };
    if (cafeId) where.cafeId = cafeId;
    const unpaidOrders = await this.prisma.inCafeOrder.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { items: { include: { product: true } }, createdBy: true },
    });

    const customerMap = new Map<string, {
      customerName: string;
      totalOwed: number;
      orderCount: number;
      oldestUnpaidDate: string;
      orders: any[];
    }>();

    for (const order of unpaidOrders) {
      const name = order.customerName || 'غير معروف';
      const existing = customerMap.get(name);
      const amount = Number(order.remainingBalance);

      if (existing) {
        existing.totalOwed += amount;
        existing.orderCount += 1;
        existing.orders.push(order);
      } else {
        customerMap.set(name, {
          customerName: name,
          totalOwed: amount,
          orderCount: 1,
          oldestUnpaidDate: order.createdAt.toISOString(),
          orders: [order],
        });
      }
    }

    const customers = Array.from(customerMap.values()).sort(
      (a, b) => b.totalOwed - a.totalOwed
    );

    const totalUnpaid = customers.reduce((s, c) => s + c.totalOwed, 0);

    return {
      totalUnpaid,
      customerCount: customers.length,
      customers,
    };
  }

  async findAll(status?: string, cafeId?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (cafeId) where.cafeId = cafeId;

    return this.prisma.inCafeOrder.findMany({
      where,
      include: {
        items: { include: { product: true } },
        createdBy: true,
        priceOverrides: { include: { overriddenBy: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(id: string, cafeId?: string) {
    const order = await this.prisma.inCafeOrder.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        createdBy: true,
        priceOverrides: { include: { overriddenBy: true } },
      },
    });
    if (!order) throw new NotFoundException('In-café order not found');
    if (cafeId && order.cafeId !== cafeId) {
      throw new NotFoundException('In-café order not found');
    }
    return order;
  }

  // ── Permission Check ──

  private async getStaffWithRole(staffId: string, cafeId: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      select: { id: true, role: true, cafeId: true, active: true },
    });
    if (!staff) throw new ForbiddenException('Staff not found');
    if (staff.cafeId !== cafeId) throw new ForbiddenException('Staff not in this cafe');
    if (!staff.active) throw new ForbiddenException('Staff account is inactive');
    return staff;
  }

  // ── Cancel Order ──

  async cancelOrder(id: string, dto: CancelOrderDto, staffId?: string, cafeId?: string) {
    const order = await this.prisma.inCafeOrder.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (cafeId && order.cafeId !== cafeId) throw new ForbiddenException();
    if (order.status === 'VOID' || order.status === 'COMPLETED') {
      throw new BadRequestException('Cannot cancel a voided or completed order');
    }
    if (order.status !== 'NEW') {
      throw new BadRequestException('Can only cancel orders in NEW status. Use void for orders already in progress.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.inCafeOrder.update({
        where: { id },
        data: { status: 'VOID', voidReason: dto.reason },
        include: { items: { include: { product: true } }, createdBy: true },
      });

      if (order.stockDeducted) {
        for (const item of order.items) {
          if (item.product.isRefrigerated) {
            await tx.product.update({
              where: { id: item.productId },
              data: { refrigeratorStock: { increment: item.quantity } },
            });
          }
        }

        await this.inventoryPipeline.release(order.id, tx);

        await tx.inCafeOrder.update({
          where: { id },
          data: { stockDeducted: false },
        });
      }

      await this.auditService.logTransactional(tx, {
        cafeId: order.cafeId,
        action: 'ORDER_CANCELLED',
        entityType: 'InCafeOrder',
        entityId: id,
        actorId: staffId ?? null,
        actorRole: staffId ? ('BARISTA' as any) : null,
        beforeState: { status: order.status, paymentStatus: order.paymentStatus },
        afterState: { status: 'VOID', voidReason: dto.reason },
        metadata: { reason: dto.reason, stockDeducted: order.stockDeducted },
      });

      return res;
    });

    for (const item of order.items) {
      if (item.product.isRefrigerated) {
        this.events.emit('product.updated', {
          productId: item.productId,
          name: item.product.name,
          action: 'updated',
        });
      }
    }

    this.events.emitToOwner('inCafe.order.updated', { order: updated } as any);
    this.events.emitToBarista('inCafe.order.updated', { order: updated } as any);

    return updated;
  }

  // ── Hold Order ──

  async holdOrder(id: string, dto: HoldOrderDto, cafeId?: string) {
    const order = await this.prisma.inCafeOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (cafeId && order.cafeId !== cafeId) throw new ForbiddenException();
    if (order.status === 'VOID' || order.status === 'COMPLETED') {
      throw new BadRequestException('Cannot hold a voided or completed order');
    }
    if (order.status === 'ON_HOLD') {
      throw new BadRequestException('Order is already on hold');
    }
    if (order.status !== 'NEW' && order.status !== 'PREPARING') {
      throw new BadRequestException('Can only hold orders in NEW or PREPARING status');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.inCafeOrder.update({
        where: { id },
        data: { status: 'ON_HOLD' },
        include: { items: { include: { product: true } }, createdBy: true },
      });

      await this.auditService.logTransactional(tx, {
        cafeId: order.cafeId,
        action: 'ORDER_HELD',
        entityType: 'InCafeOrder',
        entityId: id,
        actorRole: null,
        beforeState: { status: order.status },
        afterState: { status: 'ON_HOLD' },
        metadata: { reason: dto.reason ?? null },
      });

      return res;
    });

    this.events.emitToOwner('inCafe.order.updated', { order: updated } as any);
    this.events.emitToBarista('inCafe.order.updated', { order: updated } as any);

    return updated;
  }

  // ── Resume Held Order ──

  async resumeHeldOrder(id: string, cafeId?: string) {
    const order = await this.prisma.inCafeOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (cafeId && order.cafeId !== cafeId) throw new ForbiddenException();
    if (order.status !== 'ON_HOLD') {
      throw new BadRequestException('Order is not on hold');
    }

    const previousStatus = order.status;
    const targetStatus = 'PREPARING';

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.inCafeOrder.update({
        where: { id },
        data: { status: targetStatus },
        include: { items: { include: { product: true } }, createdBy: true },
      });

      await this.auditService.logTransactional(tx, {
        cafeId: order.cafeId,
        action: 'ORDER_RESUMED',
        entityType: 'InCafeOrder',
        entityId: id,
        actorRole: null,
        beforeState: { status: previousStatus },
        afterState: { status: targetStatus },
        metadata: {},
      });

      return res;
    });

    this.events.emitToOwner('inCafe.order.updated', { order: updated } as any);
    this.events.emitToBarista('inCafe.order.updated', { order: updated } as any);

    return updated;
  }

  // ── Edit Order ──

  async editOrder(id: string, dto: EditInCafeOrderDto, staffId?: string, cafeId?: string) {
    const order = await this.prisma.inCafeOrder.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (cafeId && order.cafeId !== cafeId) throw new ForbiddenException();
    if (order.status === 'VOID' || order.status === 'COMPLETED') {
      throw new BadRequestException('Cannot edit a voided or completed order');
    }
    if (order.status === 'DELIVERED') {
      throw new BadRequestException('Cannot edit a delivered order');
    }
    if (order.paymentStatus === 'PAID') {
      throw new BadRequestException('Cannot edit a paid order. Void and recreate instead.');
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: dto.items.map(i => i.productId) }, active: true, ...(cafeId ? { cafeId } : {}) },
    });

    if (products.length !== dto.items.length) {
      throw new BadRequestException('One or more products not found or inactive');
    }

    const productMap = new Map(products.map(p => [p.id, p]));

    // Preload options for items with selectedOptions
    const itemsWithOpts = dto.items.filter(i => i.selectedOptions?.length);
    const optionProductIds = [...new Set(itemsWithOpts.map(i => i.productId))];
    const allOptions = optionProductIds.length
      ? await this.prisma.productOption.findMany({
          where: { productId: { in: optionProductIds }, cafeId: cafeId! },
        })
      : [];
    const optionsByProduct = new Map<string, typeof allOptions>();
    for (const opt of allOptions) {
      const list = optionsByProduct.get(opt.productId) ?? [];
      list.push(opt);
      optionsByProduct.set(opt.productId, list);
    }

    // Compute new items with pricing + options + extra ingredients
    const enrichedItems = dto.items.map(item => {
      const product = productMap.get(item.productId)!;
      const standardPrice = Number(product.cafePrice ?? product.price);
      let chargedPrice = item.unitPrice ?? standardPrice;
      const extraIngredients: IngredientImpact[] = [];
      const selectedOptionRecords: any[] = [];

      const productOptions = optionsByProduct.get(item.productId) ?? [];
      if (item.selectedOptions?.length && productOptions.length) {
        for (const sel of item.selectedOptions) {
          const opt = productOptions.find(o => o.id === sel.optionId);
          if (!opt) continue;
          const choices = (opt.choices as any[]) ?? [];
          const choice = choices.find((c: any) => c.label === sel.choiceLabel);
          if (!choice) continue;
          chargedPrice += Number(choice.priceAdjust ?? 0);
          if (choice.ingredientImpacts?.length) {
            for (const imp of choice.ingredientImpacts) {
              extraIngredients.push({
                inventoryId: imp.inventoryId,
                quantity: Number(imp.quantity),
                unit: imp.unit ?? 'g',
              });
            }
          }
          selectedOptionRecords.push({
            optionId: sel.optionId,
            optionName: opt.name,
            choiceLabel: sel.choiceLabel,
            priceAdjust: Number(choice.priceAdjust ?? 0),
            ingredientImpacts: (choice.ingredientImpacts ?? []).map((imp: any) => ({
              inventoryId: imp.inventoryId,
              quantity: Number(imp.quantity),
              unit: imp.unit ?? 'g',
            })),
          });
        }
      }

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: chargedPrice,
        notes: item.notes,
        selectedOptions: selectedOptionRecords,
        extraIngredients,
      };
    });

    const newTotal = enrichedItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Release old inventory
      if (order.stockDeducted) {
        for (const oldItem of order.items) {
          if (oldItem.product.isRefrigerated) {
            await tx.product.update({
              where: { id: oldItem.productId },
              data: { refrigeratorStock: { increment: oldItem.quantity } },
            });
          }
        }
        await this.inventoryPipeline.release(order.id, tx);
      }

      // Delete old items
      await tx.inCafeOrderItem.deleteMany({ where: { orderId: id } });

      // Create new items
      await tx.inCafeOrderItem.createMany({
        data: enrichedItems.map(i => ({
          cafeId: order.cafeId,
          orderId: id,
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          notes: i.notes,
          selectedOptions: [],
        })),
      });

      // Update order totals
      const updatedOrder = await tx.inCafeOrder.update({
        where: { id },
        data: {
          total: newTotal,
          remainingBalance: Math.max(0, newTotal - Number(order.paidAmount)),
        },
        include: { items: { include: { product: true } }, createdBy: true, priceOverrides: true },
      });

      // Reserve new inventory (including extra ingredients from options)
      const pipelineResult = await this.inventoryPipeline.reserve({
        orderId: id,
        cafeId: order.cafeId,
        branchId: order.branchId,
        items: enrichedItems.map(i => {
          const p = productMap.get(i.productId)!;
          return {
            productId: i.productId,
            productName: p.name,
            quantity: i.quantity,
            isRefrigerated: p.isRefrigerated,
            refrigeratorInventoryId: p.refrigeratorInventoryId,
            extraIngredients: (i as any).extraIngredients?.length > 0 ? (i as any).extraIngredients : undefined,
          };
        }),
      }, tx);

      if (pipelineResult.inventoryReserved.length > 0 || pipelineResult.refrigeratorDeducted.length > 0) {
        await tx.inCafeOrder.update({
          where: { id },
          data: { stockDeducted: true },
        });
      }

      await this.auditService.logTransactional(tx, {
        cafeId: order.cafeId,
        action: 'ORDER_EDITED',
        entityType: 'InCafeOrder',
        entityId: id,
        actorId: staffId ?? null,
        actorRole: staffId ? ('BARISTA' as any) : null,
        beforeState: {
          total: Number(order.total),
          itemCount: order.items.length,
          status: order.status,
        },
        afterState: {
          total: newTotal,
          itemCount: enrichedItems.length,
          status: order.status,
        },
        metadata: { reason: dto.reason ?? null },
      });

      return updatedOrder;
    });

    this.events.emitToOwner('inCafe.order.updated', { order: updated } as any);
    this.events.emitToBarista('inCafe.order.updated', { order: updated } as any);

    return updated;
  }

  // ── Update Order Notes ──

  async updateOrderNote(id: string, dto: UpdateOrderNoteDto, cafeId?: string) {
    const order = await this.prisma.inCafeOrder.findUnique({ where: { id }, select: { id: true, cafeId: true, notes: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (cafeId && order.cafeId !== cafeId) throw new ForbiddenException();

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.inCafeOrder.update({
        where: { id },
        data: { notes: dto.notes ?? null },
        select: { id: true, notes: true },
      });

      await this.auditService.logTransactional(tx, {
        cafeId: order.cafeId,
        action: 'NOTE_UPDATED',
        entityType: 'InCafeOrder',
        entityId: id,
        actorRole: null,
        beforeState: { notes: order.notes },
        afterState: { notes: dto.notes ?? null },
        metadata: {},
      });

      return res;
    });

    return updated;
  }

  // ── Assign Customer to Order ──

  async assignCustomer(id: string, dto: AssignCustomerDto, cafeId?: string) {
    const order = await this.prisma.inCafeOrder.findUnique({
      where: { id },
      select: { id: true, cafeId: true, customerId: true, customerName: true, customerPhone: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (cafeId && order.cafeId !== cafeId) throw new ForbiddenException();

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.inCafeOrder.update({
        where: { id },
        data: {
          customerId: dto.customerId ?? order.customerId,
          customerName: dto.customerName ?? order.customerName,
          customerPhone: dto.customerPhone ?? order.customerPhone,
        },
        include: { items: { include: { product: true } }, createdBy: true },
      });

      await this.auditService.logTransactional(tx, {
        cafeId: order.cafeId,
        action: 'CUSTOMER_ASSIGNED',
        entityType: 'InCafeOrder',
        entityId: id,
        actorRole: null,
        beforeState: { customerId: order.customerId, customerName: order.customerName, customerPhone: order.customerPhone },
        afterState: { customerId: dto.customerId ?? order.customerId, customerName: dto.customerName ?? order.customerName, customerPhone: dto.customerPhone ?? order.customerPhone },
        metadata: {},
      });

      return res;
    });

    return updated;
  }

  // ── Order History (Audit Log) ──

  async getOrderHistory(id: string, cafeId?: string) {
    const order = await this.prisma.inCafeOrder.findUnique({
      where: { id },
      select: { id: true, cafeId: true, code: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (cafeId && order.cafeId !== cafeId) throw new NotFoundException('Order not found');

    const logs = await this.auditService.search(order.cafeId, {
      entityType: 'InCafeOrder',
      entityId: id,
      page: 1,
      limit: 100,
    });

    return {
      orderCode: order.code,
      totalEntries: logs.total,
      entries: logs.data,
    };
  }

  // ── Reprint Receipt ──

  async reprintReceipt(id: string, cafeId?: string) {
    const order = await this.prisma.inCafeOrder.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        createdBy: true,
        priceOverrides: { include: { overriddenBy: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (cafeId && order.cafeId !== cafeId) throw new NotFoundException('Order not found');

    const receipt = {
      receiptNumber: order.code,
      orderId: order.id,
      orderType: order.orderType,
      tableNumber: order.tableNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      items: order.items.map(i => ({
        productName: i.product.name,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        totalPrice: Number(i.unitPrice) * i.quantity,
        notes: i.notes,
      })),
      subtotal: Number(order.total),
      paidAmount: Number(order.paidAmount),
      remainingBalance: Number(order.remainingBalance),
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      isPaid: order.isPaid,
      status: order.status,
      createdBy: order.createdBy?.name ?? null,
      createdAt: order.createdAt.toISOString(),
      printedAt: new Date().toISOString(),
    };

    await this.auditService.logAction({
      cafeId: order.cafeId,
      action: 'RECEIPT_REPRINTED',
      entityType: 'InCafeOrder',
      entityId: id,
      actorRole: null,
      metadata: { receiptNumber: order.code },
    });

    return receipt;
  }

  // ── Kitchen Status Updates ──

  async getKitchenOrders(cafeId?: string) {
    const where: any = {
      status: { in: ['NEW', 'PREPARING', 'ON_HOLD'] },
    };
    if (cafeId) where.cafeId = cafeId;

    return this.prisma.inCafeOrder.findMany({
      where,
      include: {
        items: { include: { product: true } },
        createdBy: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}





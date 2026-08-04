import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { DomainEventBusService } from '../domain-events/domain-event-bus.service';
import { DomainEventTypes } from '../domain-events/domain-event.registry';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../common/idempotency.service';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryPipelineService } from '../inventory-pipeline/inventory-pipeline.service';
import { FinancialEngineService } from '../financial-engine/financial-engine.service';
import { CustomerLearningService } from '../customer-learning/customer-learning.service';
import { OrderStatusMachine } from './order-status-machine.service';
import { OrderItemsService, ItemInput } from './order-items.service';
import { OrderPaymentService } from './order-payment.service';
import { CreateUnifiedOrderDto, UnifiedChannel, UnifiedSource, UnifiedOrderType, UnifiedPaymentStatus } from './dto/create-unified-order.dto';
import { UpdateUnifiedOrderStatusDto, UnifiedFulfillmentStatus, UnifiedCancelStatus } from './dto/update-order-status.dto';
import { RecordPaymentDto } from './dto/payment.dto';
import { CreateRefundDto } from './dto/refund.dto';

@Injectable()
export class UnifiedOrdersService {
  private readonly logger = new Logger(UnifiedOrdersService.name);
  private codeCounter = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly domainEventBus: DomainEventBusService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
    private readonly inventoryService: InventoryService,
    private readonly inventoryPipeline: InventoryPipelineService,
    private readonly financialEngine: FinancialEngineService,
    private readonly customerLearningService: CustomerLearningService,
    private readonly statusMachine: OrderStatusMachine,
    private readonly orderItemsService: OrderItemsService,
    private readonly orderPaymentService: OrderPaymentService,
  ) {}

  // ── CREATE ORDER (all channels) ──
  async create(dto: CreateUnifiedOrderDto, cafeId: string, branchId?: string) {
    if (!dto.items?.length) {
      throw new BadRequestException('Order must contain at least one item');
    }

    // Idempotency
    if (dto.idempotencyKey) {
      const existing = await this.idempotencyService.isProcessed('unified_order', dto.idempotencyKey, cafeId);
      if (existing.duplicated && existing.entityId) {
        const replayed = await this.prisma.unifiedOrder.findUnique({
          where: { id: existing.entityId },
          include: { items: true, statusHistory: true },
        });
        if (replayed) return { data: replayed, replayed: true };
      }
    }

    // Resolve branch
    let targetBranchId = branchId;
    if (!targetBranchId) {
      const defaultBranch = await this.prisma.branch.findFirst({
        where: { cafeId },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      targetBranchId = defaultBranch?.id;
    }
    if (!targetBranchId) throw new BadRequestException('No active branch found');

    // Resolve customer
    const customerId = await this.resolveOrCreateCustomer(dto, cafeId, targetBranchId);

    // Resolve and snapshot items
    const { snapshots, total, subtotal, discountTotal, productMap } =
      await this.orderItemsService.resolveAndSnapshot(dto.items, cafeId, targetBranchId);

    const channel = dto.channel || UnifiedChannel.IN_CAFE;
    const source = dto.source || UnifiedSource.POS_TERMINAL;
    const orderType = dto.orderType || UnifiedOrderType.DINE_IN;
    const paymentStatus = dto.paymentStatus || UnifiedPaymentStatus.UNPAID;
    const isPaidUpfront = paymentStatus === UnifiedPaymentStatus.PAID;
    const amountPaid = isPaidUpfront ? Number(total) : (dto.amountPaid || 0);
    const remaining = isPaidUpfront ? 0 : Math.max(0, Number(total) - amountPaid);

    const order = await this.prisma.$transaction(async (tx) => {
      const code = await this.generateCode(tx, cafeId);

      const created = await tx.unifiedOrder.create({
        data: {
          cafeId,
          branchId: targetBranchId,
          code,
          channel,
          source,
          status: UnifiedFulfillmentStatus.NEW,
          paymentStatus,
          subtotal,
          discountTotal,
          grandTotal: total,
          amountPaid: new Prisma.Decimal(amountPaid),
          remainingAmount: new Prisma.Decimal(remaining),
          customerId: customerId ?? null,
          customerName: dto.customerName ?? null,
          customerPhone: dto.customerPhone ?? null,
          createdById: dto.createdById ?? null,
          collectedById: dto.collectedById ?? null,
          collectedRole: dto.collectedRole ?? null,
          employeeId: dto.employeeId ?? null,
          driverId: dto.driverId ?? null,
          address: dto.address ?? null,
          orderType,
          tableNumber: dto.tableNumber ?? null,
          sourceType: dto.sourceType ?? null,
          priority: dto.priority ?? 'NORMAL',
          notes: dto.notes ?? null,
          stockDeducted: dto.stockDeducted ?? false,
          isRevenueConfirmed: dto.isRevenueConfirmed ?? false,
          externalId: dto.externalId ?? null,
          idempotencyKey: dto.idempotencyKey ?? null,
          version: 1,
        },
      });

      // Create order items
      await this.orderItemsService.createItems(tx, created.id, cafeId, targetBranchId, snapshots);

      // Record initial status history
      await tx.unifiedOrderStatusHistory.create({
        data: {
          cafeId,
          orderId: created.id,
          fromStatus: 'CREATED',
          toStatus: UnifiedFulfillmentStatus.NEW,
          changedBy: dto.createdById ?? 'SYSTEM',
          changeType: 'STATUS',
          createdAt: new Date(),
        },
      });

      // Handle upfront payment
      if (isPaidUpfront && amountPaid > 0) {
        await tx.unifiedOrder.update({
          where: { id: created.id },
          data: { paidAt: new Date() },
        });

        await tx.unifiedOrderStatusHistory.create({
          data: {
            cafeId,
            orderId: created.id,
            fromStatus: 'UNPAID',
            toStatus: 'PAYMENT_PAID',
            changedBy: dto.collectedById ?? dto.createdById,
            changeType: 'PAYMENT',
            reason: `Upfront payment: ${amountPaid} EGP via ${dto.paymentMethod || 'CASH'}`,
            createdAt: new Date(),
          },
        });

        await this.financialEngine.createFinancialTransaction(
          tx, cafeId, amountPaid, 'pos', created.id, dto.collectedById || dto.createdById,
          { method: dto.paymentMethod || 'CASH', orderCode: created.code, orderType: 'unified' },
        );

        if (dto.paymentMethod === 'CASH' && dto.collectedById) {
          await tx.staff.update({
            where: { id: dto.collectedById },
            data: { currentCashWallet: { increment: amountPaid } },
          });
        }
      }

      // Inventory pipeline: reserve stock + deduct refrigerator stock
      const pipelineItems = dto.items.map(i => {
        const p = productMap.get(i.productId);
        return {
          productId: i.productId,
          productName: p?.name ?? 'Unknown',
          quantity: i.quantity,
          isRefrigerated: p?.isRefrigerated ?? false,
          refrigeratorInventoryId: p?.refrigeratorInventoryId,
        };
      });
      const unifiedPipelineResult = await this.inventoryPipeline.reserve({
        orderId: created.id, cafeId, branchId: targetBranchId, items: pipelineItems,
      }, tx);

      if (unifiedPipelineResult.inventoryReserved.length > 0 || unifiedPipelineResult.refrigeratorDeducted.length > 0) {
        await tx.unifiedOrder.update({
          where: { id: created.id },
          data: { stockDeducted: true },
        });
      }

      // Update customer
      if (customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            totalSpent: { increment: total },
            lastOrderDate: new Date(),
            ...(isPaidUpfront ? {} : { unpaidBalance: { increment: remaining } }),
          },
        });
      }

      // Record idempotency
      if (dto.idempotencyKey) {
        await this.idempotencyService.record('unified_order', dto.idempotencyKey, 'UnifiedOrder', created.id, 'completed', cafeId, tx);
      }

      return created;
    });

    // Emit events
    this.emitOrderCreated(order, snapshots);

    // Customer learning
    if (customerId) {
      this.customerLearningService.learn(cafeId, customerId).catch(err => {
        this.logger.error(`Customer learning failed: ${(err as Error).message}`);
      });
    }

    // Return full order
    return this.findOne(order.id, cafeId);
  }

  // ── FIND ONE ──
  async findOne(id: string, cafeId?: string) {
    const order = await this.prisma.unifiedOrder.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        refunds: true,
        customer: true,
        createdBy: { select: { id: true, name: true, role: true } },
        collectedBy: { select: { id: true, name: true, role: true } },
        employee: { select: { id: true, name: true } },
        driver: { select: { id: true, name: true } },
      },
    });
    if (!order) throw new NotFoundException('Unified order not found');
    if (cafeId && order.cafeId !== cafeId) throw new ForbiddenException('Unauthorized cafe access');
    return order;
  }

  // ── FIND ALL ──
  async findAll(filters: {
    cafeId: string;
    branchId?: string;
    channel?: string;
    source?: string;
    status?: string;
    paymentStatus?: string;
    customerId?: string;
    employeeId?: string;
    driverId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: Prisma.UnifiedOrderWhereInput = { cafeId: filters.cafeId };

    if (filters.branchId) where.branchId = filters.branchId;
    if (filters.channel) where.channel = filters.channel;
    if (filters.source) where.source = filters.source;
    if (filters.status) where.status = filters.status;
    if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.driverId) where.driverId = filters.driverId;

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    return this.prisma.unifiedOrder.findMany({
      where,
      include: {
        items: { include: { product: true } },
        customer: { select: { id: true, name: true, phone: true } },
        createdBy: { select: { id: true, name: true } },
        employee: { select: { id: true, name: true } },
        driver: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 100,
      skip: filters.offset ?? 0,
    });
  }

  // ── UPDATE STATUS ──
  async updateStatus(id: string, dto: UpdateUnifiedOrderStatusDto, cafeId?: string) {
    const order = await this.prisma.unifiedOrder.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Unified order not found');
    if (cafeId && order.cafeId !== cafeId) throw new ForbiddenException('Unauthorized cafe access');
    if (order.cancelStatus) throw new BadRequestException(`Order is ${order.cancelStatus}, cannot change status`);

    const fromStatus = order.status;
    const toStatus = dto.status;

    this.statusMachine.validateFulfillmentTransition(fromStatus, toStatus, dto.changedByRole, order.channel);

    const timestampField = this.statusMachine.getFulfillmentTimestampField(toStatus);
    const updateData: Record<string, unknown> = {
      status: toStatus,
      version: { increment: 1 },
    };
    if (timestampField) {
      updateData[timestampField] = new Date();
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.unifiedOrder.updateMany({
        where: { id, version: order.version },
        data: updateData as any,
      });

      if (result.count === 0) {
        throw new BadRequestException('Order was modified concurrently. Please retry.');
      }

      await tx.unifiedOrderStatusHistory.create({
        data: {
          cafeId: order.cafeId,
          orderId: id,
          fromStatus,
          toStatus,
          changedBy: dto.changedById ?? 'SYSTEM',
          changeType: 'STATUS',
          reason: dto.reason ?? null,
          createdAt: new Date(),
        },
      });

      // Pipeline confirm (deduct reserved stock)
      if (toStatus === UnifiedFulfillmentStatus.CONFIRMED) {
        await this.inventoryPipeline.confirm(id, cafeId, tx);
      }

      // Revenue confirmation at PAID
      if (toStatus === UnifiedFulfillmentStatus.PAID) {
        await tx.unifiedOrder.update({
          where: { id },
          data: { isRevenueConfirmed: true, paidAt: new Date() },
        });
      }

      await this.auditService.logTransactional(tx, {
        cafeId: order.cafeId,
        action: 'ORDER_STATUS_UPDATED',
        entityType: 'UnifiedOrder',
        entityId: id,
        actorId: dto.changedById ?? null,
        actorRole: (dto.changedByRole as any) ?? null,
        beforeState: { status: fromStatus },
        afterState: { status: toStatus },
        metadata: { reason: dto.reason },
      });

      return tx.unifiedOrder.findUnique({ where: { id }, include: { items: { include: { product: true } } } });
    });

    this.emitOrderStatusChanged(updated!, fromStatus, toStatus);
    this.emitOrderUpdated(updated!);

    if (toStatus === UnifiedFulfillmentStatus.READY) {
      this.eventsService.emit('order.ready', {
        orderId: id,
        code: updated!.code,
        channel: updated!.channel,
        branchId: updated!.branchId,
      });
    }

    return updated;
  }

  // ── CANCEL / VOID ──
  async cancel(id: string, cafeId?: string, reason?: string, cancelType: string = 'CANCELLED', changedById?: string) {
    const order = await this.prisma.unifiedOrder.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Unified order not found');
    if (cafeId && order.cafeId !== cafeId) throw new ForbiddenException('Unauthorized cafe access');

    this.statusMachine.validateCancelTransition(order.status, cancelType);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.unifiedOrder.updateMany({
        where: { id, version: order.version },
        data: {
          status: UnifiedFulfillmentStatus.CLOSED,
          cancelStatus: cancelType,
          cancelledAt: new Date(),
          voidedAt: cancelType === 'VOID' ? new Date() : undefined,
          version: { increment: 1 },
          ...(cancelType === 'VOID' ? { voidReason: reason } : {}),
        },
      });

      if (result.count === 0) {
        throw new BadRequestException('Order was modified concurrently. Please retry.');
      }

      await tx.unifiedOrderStatusHistory.create({
        data: {
          cafeId: order.cafeId,
          orderId: id,
          fromStatus: order.status,
          toStatus: cancelType,
          changedBy: changedById ?? 'SYSTEM',
          changeType: 'CANCELLATION',
          reason: reason ?? null,
          createdAt: new Date(),
        },
      });

      // Pipeline release (restores stock + releases reservations)
      await this.inventoryPipeline.release(id, tx);

      // Restore refrigerator stock
      for (const item of order.items) {
        if (item.product.isRefrigerated) {
          await tx.product.update({
            where: { id: item.productId },
            data: { refrigeratorStock: { increment: item.quantity } },
          });
        }
      }

      return tx.unifiedOrder.findUnique({ where: { id } });
    });

    this.eventsService.emit('order.cancelled', {
      orderId: id,
      code: updated!.code,
      cancelType,
      reason,
    });

    this.domainEventBus.publish(DomainEventTypes.ORDER_CANCELLED, {
      orderId: id,
      orderCode: updated!.code,
      cafeId: updated!.cafeId,
      branchId: updated!.branchId || '',
      from: order.status,
      to: cancelType,
      total: Number(updated!.grandTotal || 0),
      customerPhone: order.customerPhone,
      customerName: order.customerName,
      changedById: changedById || order.createdById,
    }).catch(err => this.logger.error(`Failed to publish ORDER_CANCELLED: ${(err as Error).message}`));

    return updated;
  }

  // ── RECORD PAYMENT ──
  async recordPayment(orderId: string, dto: RecordPaymentDto, cafeId: string) {
    return this.orderPaymentService.recordPayment(orderId, dto, cafeId);
  }

  // ── REFUND ──
  async processRefund(dto: CreateRefundDto, cafeId: string) {
    return this.orderPaymentService.processRefund(dto, cafeId);
  }

  // ── GET QUEUES ──
  async getBaristaQueue(cafeId: string, branchId?: string) {
    const where: Prisma.UnifiedOrderWhereInput = {
      cafeId,
      status: { in: [UnifiedFulfillmentStatus.NEW, UnifiedFulfillmentStatus.CONFIRMED, UnifiedFulfillmentStatus.PREPARING] },
      cancelStatus: null,
    };
    if (branchId) where.branchId = branchId;

    return this.prisma.unifiedOrder.findMany({
      where,
      include: {
        items: { include: { product: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getDriverQueue(cafeId: string, branchId?: string) {
    const where: Prisma.UnifiedOrderWhereInput = {
      cafeId,
      channel: UnifiedChannel.DELIVERY,
      status: { in: [UnifiedFulfillmentStatus.READY, UnifiedFulfillmentStatus.PICKED_UP] },
      cancelStatus: null,
    };
    if (branchId) where.branchId = branchId;

    return this.prisma.unifiedOrder.findMany({
      where,
      include: {
        items: { include: { product: true } },
        customer: { select: { id: true, name: true, phone: true } },
        driver: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ── PRIVATE HELPERS ──

  private async resolveOrCreateCustomer(dto: CreateUnifiedOrderDto, cafeId: string, branchId: string): Promise<string | null> {
    if (dto.customerId) return dto.customerId;

    if (dto.customerPhone) {
      const existing = await this.prisma.customer.upsert({
        where: {
          cafeId_branchId_phone: { cafeId, branchId, phone: dto.customerPhone },
        },
        update: { name: dto.customerName || undefined },
        create: {
          cafeId,
          branchId,
          phone: dto.customerPhone,
          name: dto.customerName || 'Walk-in Customer',
        },
      });
      return existing.id;
    }

    return null;
  }

  private async generateCode(tx: Prisma.TransactionClient, cafeId: string): Promise<string> {
    this.codeCounter += 1;
    const seq = String(this.codeCounter % 10000).padStart(4, '0');
    const date = new Date();
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const suffix = Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
    return `UNI-${dateStr}-${suffix}`;
  }

  private emitOrderCreated(order: any, snapshots: any[]) {
    this.eventsService.emit('order.created', {
      orderId: order.id,
      orderCode: order.code,
      cafeId: order.cafeId,
      branchId: order.branchId,
      customerId: order.customerId,
      customerPhone: order.customerPhone,
      status: order.status,
      total: Number(order.grandTotal),
      items: snapshots.map(s => ({
        productId: s.productId,
        productName: s.productName,
        quantity: s.quantity,
        unitPrice: Number(s.unitPrice),
      })),
      channel: order.channel,
      source: order.source,
      sourceType: order.sourceType,
      createdAt: order.createdAt?.toISOString?.() ?? new Date().toISOString(),
      createdById: order.createdById,
      employeeId: order.employeeId,
    });

    this.eventsService.broadcast('unified.order.created', {
      orderId: order.id,
      code: order.code,
      channel: order.channel,
      status: order.status,
      total: Number(order.grandTotal),
      branchId: order.branchId,
    });

    this.domainEventBus.publish(DomainEventTypes.ORDER_CREATED, {
      orderId: order.id,
      orderCode: order.code,
      cafeId: order.cafeId,
      branchId: order.branchId || '',
      customerId: order.customerId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      status: order.status,
      total: Number(order.grandTotal),
      items: snapshots.map(s => ({
        productId: s.productId,
        productName: s.productName,
        quantity: s.quantity,
        unitPrice: Number(s.unitPrice),
      })),
      sourceType: order.sourceType || order.channel || 'UNKNOWN',
      createdById: order.createdById,
      employeeId: order.employeeId,
    }).catch(err => this.logger.error(`Failed to publish ORDER_CREATED: ${(err as Error).message}`));
  }

  private emitOrderStatusChanged(order: any, fromStatus: string, toStatus: string) {
    this.eventsService.emit('order.status.changed', {
      orderId: order.id,
      from: fromStatus,
      to: toStatus,
      cafeId: order.cafeId,
      branchId: order.branchId,
      total: Number(order.grandTotal),
      customerPhone: order.customerPhone,
      customerName: order.customerName,
      timestamp: new Date().toISOString(),
    });

    const statusEventMap: Record<string, string> = {
      CONFIRMED: DomainEventTypes.ORDER_CONFIRMED,
      READY: DomainEventTypes.ORDER_READY,
      PICKED_UP: DomainEventTypes.ORDER_PICKED_UP,
      DELIVERED: DomainEventTypes.ORDER_DELIVERED,
      PAID: DomainEventTypes.ORDER_PAID,
      CANCELLED: DomainEventTypes.ORDER_CANCELLED,
    };

    const domainType = statusEventMap[toStatus];
    if (domainType) {
      this.domainEventBus.publish(domainType as any, {
        orderId: order.id,
        orderCode: order.code,
        cafeId: order.cafeId,
        branchId: order.branchId || '',
        from: fromStatus,
        to: toStatus,
        total: Number(order.grandTotal),
        customerPhone: order.customerPhone,
        customerName: order.customerName,
        changedById: order.createdById,
      }).catch(err => this.logger.error(`Failed to publish ${domainType}: ${(err as Error).message}`));
    }

    this.domainEventBus.publish(DomainEventTypes.ORDER_STATUS_CHANGED, {
      orderId: order.id,
      orderCode: order.code,
      cafeId: order.cafeId,
      branchId: order.branchId || '',
      from: fromStatus,
      to: toStatus,
      total: Number(order.grandTotal),
      customerPhone: order.customerPhone,
      customerName: order.customerName,
      changedById: order.createdById,
    }).catch(err => this.logger.error(`Failed to publish ORDER_STATUS_CHANGED: ${(err as Error).message}`));
  }

  private emitOrderUpdated(order: any) {
    this.eventsService.emit('order.updated', {
      orderId: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: Number(order.grandTotal),
      channel: order.channel,
      branchId: order.branchId,
    });

    this.eventsService.broadcast('unified.order.updated', {
      orderId: order.id,
      code: order.code,
      status: order.status,
      channel: order.channel,
      branchId: order.branchId,
    });
  }

  private emitOrderCancelled(order: any) {
    this.eventsService.emit('order.cancelled', {
      orderId: order.id,
      code: order.code,
      cafeId: order.cafeId,
      branchId: order.branchId,
      total: Number(order.grandTotal),
      customerPhone: order.customerPhone,
    });

    this.domainEventBus.publish(DomainEventTypes.ORDER_CANCELLED, {
      orderId: order.id,
      orderCode: order.code,
      cafeId: order.cafeId,
      branchId: order.branchId || '',
      from: order.status,
      to: 'CANCELLED',
      total: Number(order.grandTotal),
      customerPhone: order.customerPhone,
      customerName: order.customerName,
      changedById: order.updatedById,
    }).catch(err => this.logger.error(`Failed to publish ORDER_CANCELLED: ${(err as Error).message}`));
  }
}

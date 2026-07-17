import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { DomainEventBusService, DomainEventTypes } from '../domain-events';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvent } from '../events/events.service';
import { AuditService } from '../audit/audit.service';
import { FinancialEngineService } from '../financial-engine/financial-engine.service';

export interface MarkOrderPaymentDto {
  paymentStatus: string;
  amountPaid?: number;
  method?: string;
  collectedById?: string;
  collectedRole?: string;
  notes?: string;
}

export interface DriverConfirmDeliveryDto {
  orderId: string;
  driverId: string;
  amountCollected?: number;
  deliveryStatus?: string;
  notes?: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly domainEventBus: DomainEventBusService,
    private readonly auditService: AuditService,
    private readonly financialEngine: FinancialEngineService,
  ) {}

  async markOrderPayment(orderId: string, dto: MarkOrderPaymentDto, cafeId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { cafeId: true, total: true, paymentMethod: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.cafeId !== cafeId) throw new ForbiddenException('Unauthorized access to this order');

    const amountPaid = dto.amountPaid ?? Number(order.total);
    const remainingAmount = Math.max(0, Number(order.total) - amountPaid);

    const updated = await this.prisma.$transaction(async (tx) => {
      const freshOrder = await tx.order.findUnique({
        where: { id: orderId },
        select: { amountPaid: true, paymentStatus: true, branchId: true, customerId: true, total: true, paymentMethod: true },
      });
      if (!freshOrder) throw new NotFoundException('Order not found');

      const previousStatus = freshOrder.paymentStatus || 'UNPAID';
      const newlyPaidAmount = amountPaid - Number(freshOrder.amountPaid || 0);

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          paid: dto.paymentStatus === 'PAID',
          paymentStatus: dto.paymentStatus,
          amountPaid: new Prisma.Decimal(amountPaid),
          remainingAmount: new Prisma.Decimal(Math.max(0, Number(freshOrder.total) - amountPaid)),
          paymentMethod: dto.method ?? freshOrder.paymentMethod,
          paidAt: dto.paymentStatus === 'PAID' ? new Date() : dto.amountPaid ? new Date() : null,
          collectedById: dto.collectedById,
          collectedRole: dto.collectedRole,
        },
      });

      await this.financialEngine.createPaymentLog(tx, {
        cafeId: cafeId!,
        branchId: freshOrder.branchId,
        orderId,
        orderCode: updatedOrder.code,
        orderType: 'delivery',
        total: Number(freshOrder.total),
        previousAmountPaid: Number(freshOrder.amountPaid || 0),
        previousPaymentStatus: previousStatus,
        collectedAmount: amountPaid,
        paymentStatus: dto.paymentStatus,
        paymentMethod: dto.method,
        collectedById: dto.collectedById,
        collectedRole: dto.collectedRole,
        customerId: freshOrder.customerId,
        notes: dto.notes,
      }, newlyPaidAmount);

      if (newlyPaidAmount > 0) {
        await this.financialEngine.createFinancialTransaction(
          tx, cafeId!, newlyPaidAmount, 'pos', orderId, dto.collectedById,
          { method: dto.method || 'CASH', orderCode: updatedOrder.code, orderType: 'delivery' },
        );

        if ((dto.method === 'CASH' || !dto.method) && dto.collectedRole === 'BARISTA' && dto.collectedById) {
          await tx.staff.update({
            where: { id: dto.collectedById },
            data: { currentCashWallet: { increment: new Prisma.Decimal(newlyPaidAmount) } }
          });
        }
      }

      if (dto.paymentStatus === 'PAID' && freshOrder.customerId) {
        const delta = Number(freshOrder.total) - amountPaid;
        if (delta > 0) {
          await tx.customer.update({
            where: { id: freshOrder.customerId },
            data: { unpaidBalance: { decrement: delta } },
          });
        }
      }

      if (remainingAmount > 0 && freshOrder.customerId) {
        await tx.debt.create({
          data: {
            cafeId: cafeId!,
            branchId: freshOrder.branchId,
            customerId: freshOrder.customerId,
            orderId,
            amount: new Prisma.Decimal(remainingAmount),
            reason: dto.paymentStatus === 'PARTIAL_PAYMENT' ? 'Partial payment' : 'Unpaid delivery',
            collectedByRole: dto.collectedRole,
          } as any,
        });
      }

      await this.auditService.logTransactional(tx, {
        cafeId,
        action: 'PAYMENT_CHANGE',
        entityType: 'Order',
        entityId: orderId,
        actorId: dto.collectedById ?? null,
        actorRole: (dto.collectedRole as any) ?? null,
        beforeState: { paymentStatus: previousStatus, amountPaid: Number(freshOrder.amountPaid ?? 0) },
        afterState: { paymentStatus: dto.paymentStatus, amountPaid },
        metadata: { method: dto.method, notes: dto.notes, remainingAmount },
      });

      return updatedOrder;
    });

    this.financialEngine.emitPaymentEvents({
      cafeId: cafeId!,
      branchId: '',
      orderId: updated.id,
      orderCode: updated.code,
      orderType: 'delivery',
      total: Number(order.total),
      previousAmountPaid: 0,
      previousPaymentStatus: 'UNPAID',
      collectedAmount: amountPaid,
      paymentStatus: dto.paymentStatus,
      paymentMethod: dto.method,
      collectedById: dto.collectedById,
      collectedRole: dto.collectedRole,
    }, amountPaid, remainingAmount);

    return updated;
  }

  async confirmDriverDelivery(dto: DriverConfirmDeliveryDto, cafeId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { driver: true, customer: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.cafeId !== cafeId) throw new ForbiddenException('Unauthorized access to this delivery');

    if (dto.deliveryStatus === 'FAILED') {
      const updated = await this.prisma.order.update({
        where: { id: dto.orderId },
        data: {
          status: 'CANCELLED',
          paid: false,
          paymentStatus: 'UNPAID',
        },
      });

      this.eventsService.emit('payment.pending', {
        orderId: updated.id,
        orderCode: updated.code,
        remainingAmount: Number(order.total),
        collectedRole: 'DRIVER',
      });

      return updated;
    }

    const collected = dto.amountCollected ?? 0;
    const total = Number(order.total);
    const isFullyPaid = collected >= total;
    const remaining = Math.max(0, total - collected);
    const previousStatus = order.paymentStatus || 'UNPAID';

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: dto.orderId },
        data: {
          status: 'DELIVERED',
          paid: isFullyPaid,
          paymentStatus: isFullyPaid ? 'PAID' : collected > 0 ? 'PARTIAL_PAYMENT' : 'UNPAID',
          amountPaid: new Prisma.Decimal(collected),
          remainingAmount: new Prisma.Decimal(remaining),
          paymentMethod: collected > 0 ? 'CASH' : null,
          paidAt: collected > 0 ? new Date() : null,
          collectedById: dto.driverId,
          collectedRole: 'DRIVER',
          deliveredAt: new Date(),
        },
      });

      await tx.paymentLog.create({
        data: {
          cafeId: cafeId!,
          branchId: order.branchId,
          orderId: dto.orderId,
          previousStatus,
          newStatus: updatedOrder.paymentStatus,
          amount: new Prisma.Decimal(collected),
          method: collected > 0 ? 'CASH' : null,
          collectedById: dto.driverId,
          collectedRole: 'DRIVER',
          notes: dto.notes || null,
        } as any,
      });

      if (isFullyPaid && order.customer) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            totalOrders: { increment: 1 },
            lastOrderDate: new Date(),
          },
        });
      }

      await this.auditService.logTransactional(tx, {
        cafeId,
        action: 'PAYMENT_CHANGE',
        entityType: 'Order',
        entityId: dto.orderId,
        actorId: dto.driverId,
        actorRole: 'DRIVER',
        beforeState: { paymentStatus: previousStatus, amountPaid: 0 },
        afterState: { paymentStatus: updatedOrder.paymentStatus, amountPaid: collected },
        metadata: { deliveryStatus: dto.deliveryStatus, notes: dto.notes, remaining },
      });

      return updatedOrder;
    });

    this.eventsService.emit('payment.updated', {
      orderId: updated.id,
      orderCode: updated.code,
      paymentStatus: updated.paymentStatus,
      amountPaid: Number(updated.amountPaid),
      remainingAmount: Number(updated.remainingAmount),
      collectedById: dto.driverId,
      collectedRole: 'DRIVER',
    });

    if (isFullyPaid) {
      this.eventsService.emit('payment.collected', {
        orderId: updated.id,
        orderCode: updated.code,
        amount: collected,
        collectedById: dto.driverId,
        collectedRole: 'DRIVER',
      });
    } else {
      this.eventsService.emit('payment.pending', {
        orderId: updated.id,
        orderCode: updated.code,
        remainingAmount: remaining,
        collectedRole: 'DRIVER',
      });
    }

    this.eventsService.emit('order.delivered', {
      orderId: updated.id,
      orderCode: updated.code,
      driverId: dto.driverId,
      paymentStatus: updated.paymentStatus,
      amountCollected: collected,
    });

    this.eventsService.emit(isFullyPaid ? 'payment.collected' : 'payment.pending', {
      orderId: updated.id,
      orderCode: updated.code,
      amount: collected,
      remainingAmount: remaining,
      collectedRole: 'DRIVER',
    });

    if (isFullyPaid) {
      this.domainEventBus.publish(DomainEventTypes.PAYMENT_COMPLETED, {
        orderId: updated.id,
        orderCode: updated.code,
        cafeId: cafeId!,
        branchId: updated.branchId || '',
        amount: collected,
        method: 'CASH',
        paymentStatus: 'PAID',
        remainingAmount: 0,
        collectedById: dto.driverId,
        collectedByRole: 'DRIVER',
        isDelivery: true,
      }).catch(err => this.logger.error(`Failed to publish PAYMENT_COMPLETED: ${(err as Error).message}`));
    } else if (remaining > 0 && collected > 0) {
      this.domainEventBus.publish(DomainEventTypes.DEBT_CREATED, {
        orderId: updated.id,
        orderCode: updated.code || '',
        cafeId: cafeId!,
        branchId: updated.branchId || '',
        customerName: order.customer?.name || '',
        customerPhone: order.customer?.phone,
        amount: remaining,
        source: 'DELIVERY',
      }).catch(err => this.logger.error(`Failed to publish DEBT_CREATED: ${(err as Error).message}`));
    }

    this.domainEventBus.publish(DomainEventTypes.ORDER_DELIVERED, {
      orderId: updated.id,
      orderCode: updated.code,
      cafeId: cafeId!,
      branchId: updated.branchId || '',
      from: order.status,
      to: 'DELIVERED',
      total: total,
      customerPhone: order.customer?.phone,
      customerName: order.customer?.name,
      changedById: dto.driverId,
    }).catch(err => this.logger.error(`Failed to publish ORDER_DELIVERED: ${(err as Error).message}`));

    return updated;
  }

  async getPaymentLogs(orderId: string, cafeId?: string) {
    if (cafeId) {
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { cafeId: true } });
      if (order && order.cafeId !== cafeId) throw new ForbiddenException('Unauthorized access');
    }
    return this.prisma.paymentLog.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      include: { collectedBy: { select: { id: true, name: true, role: true } } },
    });
  }

  async getUnpaidOrders(cafeId: string) {
    const where: Record<string, unknown> = {
      paid: false,
      paymentStatus: { in: ['UNPAID', 'PARTIAL_PAYMENT'] },
    };
    if (cafeId) where.cafeId = cafeId;
    return this.prisma.order.findMany({
      where: where as any,
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { id: true, name: true, phone: true } }, driver: { select: { id: true, name: true } } },
    });
  }

  async getBaristaDailyClosing(baristaId: string, date: string, cafeId?: string) {
    const startDate = new Date(date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    const whereBase: Record<string, unknown> = {
      collectedById: baristaId,
      collectedRole: 'BARISTA',
      createdAt: { gte: startDate, lt: endDate },
    };
    if (cafeId) whereBase.cafeId = cafeId;

    const payments = await this.prisma.paymentLog.findMany({ where: whereBase as any, orderBy: { createdAt: 'asc' } });
    const cashLogs = payments.filter(p => p.method === 'CASH' || !p.method);
    const cardLogs = payments.filter(p => p.method !== 'CASH' && p.method);
    const totalCash = cashLogs.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalCard = cardLogs.reduce((sum, p) => sum + Number(p.amount), 0);
    const orderIds = [...new Set(payments.map(p => p.orderId))];
    const orders = orderIds.length ? await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, code: true, total: true, status: true, customerId: true, customerName: true },
    }) : [];

    return {
      baristaId,
      date,
      summary: { totalPayments: payments.length, totalCash, totalCard, totalAmount: totalCash + totalCard },
      cashLogs, cardLogs,
      orders,
    };
  }

  async getDriverDailyClosing(driverId: string, date: string, cafeId?: string) {
    const startDate = new Date(date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    const whereBase: Record<string, unknown> = {
      collectedById: driverId,
      collectedRole: 'DRIVER',
      createdAt: { gte: startDate, lt: endDate },
    };
    if (cafeId) whereBase.cafeId = cafeId;

    const payments = await this.prisma.paymentLog.findMany({ where: whereBase as any });
    const totalCollected = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const orderIds = [...new Set(payments.map(p => p.orderId))];
    const orders = orderIds.length ? await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, code: true, total: true, status: true },
    }) : [];

    return { driverId, date, totalCollected, payments, orders };
  }

  async getDailyReconciliation(date: string, cafeId?: string) {
    const startDate = new Date(date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    const whereBase: Record<string, unknown> = {
      createdAt: { gte: startDate, lt: endDate },
      method: { not: null },
    };
    if (cafeId) whereBase.cafeId = cafeId;

    const payments = await this.prisma.paymentLog.findMany({ where: whereBase as any });
    const cashPayments = payments.filter(p => p.method === 'CASH');
    const cardPayments = payments.filter(p => p.method !== 'CASH');
    const walletPayments: any[] = [];

    const cashByBarista: Record<string, number> = {};
    for (const p of cashPayments) {
      const key = p.collectedById || 'unknown';
      cashByBarista[key] = (cashByBarista[key] || 0) + Number(p.amount);
    }

    return {
      date,
      cashPayments, cardPayments, walletPayments,
      totalCash: cashPayments.reduce((s, p) => s + Number(p.amount), 0),
      totalCard: cardPayments.reduce((s, p) => s + Number(p.amount), 0),
      totalWallet: walletPayments.reduce((s, p) => s + Number(p.amount), 0),
      cashByBarista,
      totalPayments: payments.length,
    };
  }

  async getDebtRecords(settled: boolean, cafeId?: string) {
    const where: Record<string, unknown> = { settled };
    if (cafeId) where.cafeId = cafeId;
    return this.prisma.debt.findMany({
      where: where as any,
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });
  }

  async getUnifiedDebtOverview(cafeId: string) {
    const debts = await this.prisma.debt.findMany({ where: { cafeId, settled: false }, include: { customer: true } });
    const inCafeOrders = await this.prisma.inCafeOrder.findMany({ where: { cafeId, paymentStatus: 'UNPAID' }, include: { items: true, customer: true } });
    const orders = await this.prisma.order.findMany({ where: { cafeId, paid: false }, include: { customer: true } });

    const customerMap = new Map<string, { name: string; phone?: string; totalDebt: number; orders: any[] }>();

    for (const d of debts) {
      if (!d.customerId) continue;
      const c = customerMap.get(d.customerId) || { name: d.customer?.name || 'Unknown', phone: d.customer?.phone, totalDebt: 0, orders: [] };
      c.totalDebt += Number(d.amount);
      c.orders.push({ type: 'debt', id: d.id, amount: Number(d.amount), createdAt: d.createdAt });
      customerMap.set(d.customerId, c);
    }

    for (const o of inCafeOrders) {
      if (!o.customerId) continue;
      const c = customerMap.get(o.customerId) || { name: o.customer?.name || 'Unknown', phone: o.customer?.phone, totalDebt: 0, orders: [] };
      const unpaid = Number(o.total) - Number(o.paidAmount || 0);
      if (unpaid <= 0) continue;
      c.totalDebt += unpaid;
      c.orders.push({ type: 'in_cafe', id: o.id, amount: unpaid, createdAt: o.createdAt });
      customerMap.set(o.customerId, c);
    }

    for (const o of orders) {
      if (!o.customerId) continue;
      const c = customerMap.get(o.customerId) || { name: o.customer?.name || 'Unknown', phone: o.customer?.phone, totalDebt: 0, orders: [] };
      const unpaid = Number(o.total) - Number(o.amountPaid || 0);
      if (unpaid <= 0) continue;
      c.totalDebt += unpaid;
      c.orders.push({ type: 'delivery', id: o.id, amount: unpaid, createdAt: o.createdAt });
      customerMap.set(o.customerId, c);
    }

    const customers = Array.from(customerMap.values()).sort((a, b) => b.totalDebt - a.totalDebt);
    const totalOutstanding = customers.reduce((s, c) => s + c.totalDebt, 0);
    return { customers, totalOutstanding, customerCount: customers.length };
  }

  async settleDebt(debtId: string, settledById: string, cafeId?: string) {
    const debt = await this.prisma.debt.findUnique({ where: { id: debtId } });
    if (!debt) throw new NotFoundException('Debt not found');
    if (cafeId && debt.cafeId !== cafeId) throw new ForbiddenException('Unauthorized access');

    const updated = await this.prisma.$transaction(async (tx) => {
      const settled = await tx.debt.update({
        where: { id: debtId },
        data: { settled: true, settledAt: new Date(), settledById },
      });

      await tx.customer.update({
        where: { id: debt.customerId },
        data: { unpaidBalance: { decrement: debt.amount } },
      });

      await this.auditService.logTransactional(tx, {
        cafeId: cafeId ?? debt.cafeId,
        action: 'DEBT_SETTLE',
        entityType: 'Debt',
        entityId: debtId,
        actorId: settledById,
        actorRole: null,
        beforeState: { settled: false, amount: Number(debt.amount) },
        afterState: { settled: true, settledById },
        metadata: { customerId: debt.customerId },
      });

      return settled;
    });

    this.eventsService.emit('debt.settled', { debtId, settledById });

    this.domainEventBus.publish(DomainEventTypes.DEBT_PAID, {
      debtId,
      orderId: '',
      orderCode: '',
      cafeId: cafeId ?? debt.cafeId,
      branchId: debt.branchId || '',
      customerName: '',
      amount: Number(debt.amount),
      paidById: settledById || '',
      paidAt: new Date().toISOString(),
    }).catch(err => this.logger.error(`Failed to publish DEBT_PAID: ${(err as Error).message}`));

    return updated;
  }
}

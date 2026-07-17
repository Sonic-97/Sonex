import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditService } from '../audit/audit.service';
import { FinancialEngineService } from '../financial-engine/financial-engine.service';
import { RecordPaymentDto, SplitPaymentItemDto } from './dto/payment.dto';
import { CreateRefundDto } from './dto/refund.dto';
import { UnifiedPaymentStatusEnum } from './dto/update-order-status.dto';
import { OrderStatusMachine } from './order-status-machine.service';

@Injectable()
export class OrderPaymentService {
  private readonly logger = new Logger(OrderPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly auditService: AuditService,
    private readonly statusMachine: OrderStatusMachine,
    private readonly financialEngine: FinancialEngineService,
  ) {}

  async recordPayment(orderId: string, dto: RecordPaymentDto, cafeId: string) {
    const order = await this.prisma.unifiedOrder.findUnique({
      where: { id: orderId },
      select: { cafeId: true, grandTotal: true, amountPaid: true, paymentStatus: true, remainingAmount: true, branchId: true, code: true, customerId: true },
    });
    if (!order) throw new NotFoundException('Unified order not found');
    if (order.cafeId !== cafeId) throw new ForbiddenException('Unauthorized access');

    this.statusMachine.validatePaymentTransition(order.paymentStatus, dto.paymentStatus || 'PAID');

    const total = Number(order.grandTotal);
    const previouslyPaid = Number(order.amountPaid);
    const newTotalPaid = previouslyPaid + dto.amount;
    const newRemaining = Math.max(0, total - newTotalPaid);
    const isFullyPaid = newTotalPaid >= total;
    const newPaymentStatus = isFullyPaid ? 'PAID' : newTotalPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.unifiedOrder.update({
        where: { id: orderId },
        data: {
          paymentStatus: dto.paymentStatus || newPaymentStatus,
          amountPaid: new Prisma.Decimal(newTotalPaid),
          remainingAmount: new Prisma.Decimal(newRemaining),
          paidAt: isFullyPaid ? new Date() : undefined,
        },
      });

      await this.financialEngine.createPaymentLog(tx, {
        cafeId,
        branchId: order.branchId,
        orderId,
        orderCode: order.code,
        orderType: 'unified',
        total,
        previousAmountPaid: previouslyPaid,
        previousPaymentStatus: order.paymentStatus,
        collectedAmount: newTotalPaid,
        paymentStatus: dto.paymentStatus || newPaymentStatus,
        paymentMethod: dto.method,
        collectedById: dto.collectedById,
        collectedRole: dto.collectedRole,
        customerId: order.customerId,
        notes: dto.notes,
        splitPayments: dto.splitPayments?.map(s => ({ method: s.method as any, amount: s.amount })),
      }, dto.amount);

      await this.financialEngine.createFinancialTransactionForPayment(tx, {
        cafeId,
        branchId: order.branchId,
        orderId,
        orderCode: order.code,
        orderType: 'unified',
        total,
        previousAmountPaid: previouslyPaid,
        previousPaymentStatus: order.paymentStatus,
        collectedAmount: newTotalPaid,
        paymentStatus: dto.paymentStatus || newPaymentStatus,
        paymentMethod: dto.method,
        collectedById: dto.collectedById,
        collectedRole: dto.collectedRole,
        customerId: order.customerId,
        notes: dto.notes,
        splitPayments: dto.splitPayments?.map(s => ({ method: s.method as any, amount: s.amount })),
      }, dto.amount);

      await this.financialEngine.updateCashWallet(tx, {
        cafeId,
        branchId: order.branchId,
        orderId,
        orderCode: order.code,
        orderType: 'unified',
        total,
        previousAmountPaid: previouslyPaid,
        previousPaymentStatus: order.paymentStatus,
        collectedAmount: newTotalPaid,
        paymentStatus: dto.paymentStatus || newPaymentStatus,
        paymentMethod: dto.method,
        collectedById: dto.collectedById,
        collectedRole: dto.collectedRole,
        customerId: order.customerId,
        notes: dto.notes,
      }, dto.amount);

      await this.financialEngine.updateCustomerOnPayment(tx, {
        cafeId,
        branchId: order.branchId,
        orderId,
        orderCode: order.code,
        orderType: 'unified',
        total,
        previousAmountPaid: previouslyPaid,
        previousPaymentStatus: order.paymentStatus,
        collectedAmount: newTotalPaid,
        paymentStatus: dto.paymentStatus || newPaymentStatus,
        paymentMethod: dto.method,
        collectedById: dto.collectedById,
        collectedRole: dto.collectedRole,
        customerId: order.customerId,
        notes: dto.notes,
      });

      await this.financialEngine.handleDebtOnPayment(tx, {
        cafeId,
        branchId: order.branchId,
        orderId,
        orderCode: order.code,
        orderType: 'unified',
        total,
        previousAmountPaid: previouslyPaid,
        previousPaymentStatus: order.paymentStatus,
        collectedAmount: newTotalPaid,
        paymentStatus: dto.paymentStatus || newPaymentStatus,
        paymentMethod: dto.method,
        collectedById: dto.collectedById,
        collectedRole: dto.collectedRole,
        customerId: order.customerId,
        notes: dto.notes,
      }, newRemaining);

      await tx.unifiedOrderStatusHistory.create({
        data: {
          cafeId,
          orderId,
          fromStatus: order.paymentStatus,
          toStatus: `PAYMENT_${dto.paymentStatus || newPaymentStatus}`,
          changedBy: dto.collectedById,
          changeType: 'PAYMENT',
          reason: dto.notes || `Payment recorded: ${dto.amount} EGP via ${dto.method || 'CASH'}`,
          createdAt: new Date(),
        },
      });

      await this.auditService.logTransactional(tx, {
        cafeId,
        action: 'PAYMENT_CHANGE',
        entityType: 'UnifiedOrder',
        entityId: orderId,
        actorId: dto.collectedById,
        actorRole: dto.collectedRole as any,
        beforeState: { paymentStatus: order.paymentStatus, amountPaid: previouslyPaid },
        afterState: { paymentStatus: dto.paymentStatus || newPaymentStatus, amountPaid: newTotalPaid },
        metadata: { method: dto.method, notes: dto.notes, remainingAmount: newRemaining },
      });

      return updatedOrder;
    });

    this.financialEngine.emitPaymentEvents({
      cafeId,
      branchId: order.branchId,
      orderId,
      orderCode: order.code,
      orderType: 'unified',
      total,
      previousAmountPaid: previouslyPaid,
      previousPaymentStatus: order.paymentStatus,
      collectedAmount: newTotalPaid,
      paymentStatus: dto.paymentStatus || newPaymentStatus,
      paymentMethod: dto.method,
      collectedById: dto.collectedById,
      collectedRole: dto.collectedRole,
      customerId: order.customerId,
      notes: dto.notes,
    }, dto.amount, newRemaining);

    return updated;
  }

  async processRefund(dto: CreateRefundDto, cafeId: string) {
    const result = await this.financialEngine.processRefund({
      cafeId,
      branchId: '',
      orderId: dto.orderId,
      refundAmount: dto.amount,
      reason: dto.reason,
      processedById: dto.processedById,
      itemIds: dto.itemIds,
      restoreInventory: true,
    });

    await this.prisma.unifiedOrder.update({
      where: { id: dto.orderId },
      data: {
        paymentStatus: result.newPaymentStatus,
        amountPaid: new Prisma.Decimal(Math.max(0, result.newAmountPaid)),
      },
    });

    return { id: result.refundId, ...result };
  }

  async getPaymentHistory(orderId: string, cafeId?: string) {
    if (cafeId) {
      const order = await this.prisma.unifiedOrder.findUnique({
        where: { id: orderId },
        select: { cafeId: true },
      });
      if (order && order.cafeId !== cafeId) throw new ForbiddenException('Unauthorized access');
    }

    const statusHistory = await this.prisma.unifiedOrderStatusHistory.findMany({
      where: { orderId, changeType: 'PAYMENT' },
      orderBy: { createdAt: 'asc' },
    });

    const refunds = await this.prisma.unifiedRefund.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });

    return { statusHistory, refunds };
  }

  async settleDebt(debtId: string, settledById: string, cafeId?: string, amount?: number) {
    return this.financialEngine.settleDebt({ debtId, cafeId, settledById, settleAmount: amount });
  }
}

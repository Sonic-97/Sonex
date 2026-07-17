import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { PaymentService } from '../payment/payment.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ClosingService {
  private readonly logger = new Logger(ClosingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly paymentService: PaymentService,
  ) {}

  private getDayRange(dateStr?: string) {
    const dayStart = dateStr
      ? new Date(dateStr + 'T00:00:00.000Z')
      : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    return { dayStart, dayEnd };
  }

  async getEndOfDayData(cafeId: string, dateStr?: string) {
    const { dayStart, dayEnd } = this.getDayRange(dateStr);
    const dateLabel = dayStart.toISOString().slice(0, 10);

    const [
      rawDebts,
      paidOrders,
      inCafeDebts,
      inCafePaidOrders,
      allStaff,
      inventoryPurchases,
      pendingSettlements,
      staffEarnings,
      driverEarnings,
      paymentLogs,
      employeePayments,
    ] = await Promise.all([
      // 1. Unpaid/partial orders incl customer + staff who created order
      this.prisma.order.findMany({
        where: {
          cafeId,
          paymentStatus: { in: ['UNPAID', 'PARTIAL_PAYMENT'] },
          status: { notIn: ['CANCELLED', 'NEW'] },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          staff: { select: { id: true, name: true } },
          driver: { select: { id: true, name: true } },
        },
      }),

      // 2. Paid orders today
      this.prisma.order.findMany({
        where: {
          cafeId,
          paymentStatus: 'PAID',
          paidAt: { gte: dayStart, lt: dayEnd },
        },
        include: {
          customer: { select: { id: true, name: true } },
          collectedBy: { select: { id: true, name: true, role: true } },
          staff: { select: { id: true, name: true } },
        },
      }),

      // 1b. InCafe unpaid orders
      this.prisma.inCafeOrder.findMany({
        where: {
          cafeId,
          paymentStatus: { in: ['NOT_PAID', 'PARTIALLY_PAID'] },
          status: { notIn: ['VOID', 'NEW'] },
        },
        orderBy: { createdAt: 'desc' },
        include: { createdBy: { select: { id: true, name: true } } },
      }),

      // 2b. InCafe paid orders today
      this.prisma.inCafeOrder.findMany({
        where: {
          cafeId,
          paymentStatus: 'PAID',
          paymentTimestamp: { gte: dayStart, lt: dayEnd },
        },
        include: { createdBy: { select: { id: true, name: true, role: true } } },
      }),

      // 3. All staff for salary calculation
      this.prisma.staff.findMany({
        where: { cafeId, active: true },
        select: { id: true, name: true, salary: true, role: true },
      }),

      // 4. Inventory purchases today
      this.prisma.inventoryPurchase.aggregate({
        where: { cafeId, createdAt: { gte: dayStart, lt: dayEnd } },
        _sum: { cost: true },
        _count: true,
      }),

      // 5. Pending driver cash settlements
      this.prisma.driverCashSettlement.findMany({
        where: { cafeId, status: 'PENDING' },
        include: {
          driver: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),

      // 6. Staff earnings
      this.prisma.staffEarning.findMany({
        where: { cafeId },
        include: { staff: { select: { id: true, name: true, role: true, salary: true } } },
        orderBy: { totalEarnings: 'desc' },
      }),

      // 7. Driver earnings
      this.prisma.driverEarning.findMany({
        where: { cafeId },
        include: { driver: { select: { id: true, name: true } } },
        orderBy: { earnings: 'desc' },
      }),

      // 8. Payment logs today for collections breakdown
      this.prisma.paymentLog.findMany({
        where: { cafeId, createdAt: { gte: dayStart, lt: dayEnd } },
        include: { collectedBy: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'desc' },
      }),

      // 9. Employee payments today
      this.prisma.employeePayment.aggregate({
        where: { cafeId, date: { gte: dayStart, lt: dayEnd } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    // Transform debts (delivery + in-cafe)
    const allDebts = [
      ...rawDebts.map((o) => ({
        orderId: o.id,
        orderCode: o.code,
        customerName: o.customer?.name || 'Unknown',
        customerPhone: o.customer?.phone || '',
        amount: Number(o.total),
        remainingAmount: Number(o.remainingAmount),
        paymentStatus: o.paymentStatus,
        employeeName: o.staff?.name || o.driver?.name || '—',
        employeeRole: o.staff ? 'BARISTA' : o.driver ? 'DRIVER' : null,
        createdAt: o.createdAt.toISOString(),
        source: 'order',
      })),
      ...inCafeDebts.map((o) => ({
        orderId: o.id,
        orderCode: o.code,
        customerName: o.customerName || 'Walk-in',
        customerPhone: o.customerPhone || '',
        amount: Number(o.total),
        remainingAmount: Number(o.remainingBalance),
        paymentStatus: o.paymentStatus,
        employeeName: o.createdBy?.name || '—',
        employeeRole: 'BARISTA',
        createdAt: o.createdAt.toISOString(),
        source: 'in_cafe',
      })),
    ];

    // Merge paid orders
    const allPaidOrders = [
      ...paidOrders.map((o) => ({ ...o, _source: 'order' })),
      ...inCafePaidOrders.map((o) => ({
        id: o.id,
        code: o.code,
        total: o.total,
        amountPaid: o.paidAmount,
        paymentMethod: o.paymentMethod,
        paidAt: o.paymentTimestamp,
        customer: { id: o.customerId || '', name: o.customerName },
        collectedBy: o.createdBy ? { id: o.createdBy.id, name: o.createdBy.name, role: o.createdBy.role as any } : null,
        staff: o.createdBy ? { id: o.createdBy.id, name: o.createdBy.name } : null,
        _source: 'in_cafe',
      })),
    ];

    // Revenue from paid orders today
    const revenue = allPaidOrders.reduce((s, o) => s + Number(o.total), 0);
    const totalCollected = allPaidOrders.reduce((s, o) => s + Number(o.amountPaid), 0);

    // Expenses
    const totalSalaries = allStaff.reduce((s, st) => s + Number(st.salary), 0);
    const totalInventoryCost = inventoryPurchases._sum.cost || 0;
    const totalEmployeePayments = Number(employeePayments._sum.amount || 0);
    const expenses = {
      salaries: totalSalaries,
      inventoryPurchases: Number(totalInventoryCost),
      employeePayments: totalEmployeePayments,
      total: totalSalaries + Number(totalInventoryCost) + totalEmployeePayments,
    };

    // Profit
    const profit = revenue - expenses.total;

    // Collections by staff (payment logs + in-cafe payments)
    const collectionsByStaff: Record<string, { name: string; role: string; count: number; total: number }> = {};
    for (const log of paymentLogs) {
      const id = log.collectedById || 'unknown';
      if (!collectionsByStaff[id]) {
        collectionsByStaff[id] = { name: log.collectedBy?.name || 'Unknown', role: log.collectedBy?.role || '—', count: 0, total: 0 };
      }
      collectionsByStaff[id].count++;
      collectionsByStaff[id].total += Number(log.amount);
    }
    for (const o of inCafePaidOrders) {
      const id = o.createdById || 'unknown';
      if (!collectionsByStaff[id]) {
        collectionsByStaff[id] = { name: o.createdBy?.name || 'Unknown', role: o.createdBy?.role || '—', count: 0, total: 0 };
      }
      collectionsByStaff[id].count++;
      collectionsByStaff[id].total += Number(o.paidAmount || o.total);
    }

    return {
      date: dateLabel,
      debts: allDebts,
      revenue: {
        totalRevenue: revenue,
        totalCollected,
        totalOrders: allPaidOrders.length,
        orders: allPaidOrders.map((o) => ({
          orderId: o.id,
          orderCode: o.code,
          customerName: o.customer?.name || 'Unknown',
          amount: Number(o.total),
          collectedAmount: Number(o.amountPaid),
          method: o.paymentMethod,
          collectedBy: o.collectedBy?.name || '—',
          collectedRole: o.collectedBy?.role || '—',
          employeeName: o.staff?.name || '—',
          paidAt: o.paidAt?.toISOString(),
        })),
      },
      expenses,
      profit,
      collections: {
        byStaff: Object.entries(collectionsByStaff).map(([id, val]) => ({ id, ...val })),
        totalTransactions: paymentLogs.length,
      },
      earnings: {
        staff: staffEarnings.map((e) => ({
          id: e.staffId,
          name: e.staff?.name || 'Unknown',
          role: e.staff?.role || '—',
          salary: Number(e.staff?.salary || 0),
          totalOrdersHandled: e.totalOrdersHandled,
          bonus: Number(e.bonus),
          totalEarnings: Number(e.totalEarnings),
        })),
        drivers: driverEarnings.map((e) => ({
          id: e.driverId,
          name: e.driver?.name || 'Unknown',
          deliveries: e.deliveries,
          earnings: Number(e.earnings),
        })),
      },
      pendingCash: pendingSettlements.map((s) => ({
        id: s.id,
        driverId: s.driverId,
        driverName: s.driver?.name || 'Unknown',
        amount: Number(s.amount),
        createdAt: s.createdAt.toISOString(),
      })),
    };
  }

  async markPaid(orderId: string, cafeId: string, collectedById: string, collectedRole: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.cafeId !== cafeId) throw new ForbiddenException('Unauthorized cafe access for this order');

    const dto = {
      orderId,
      paymentStatus: 'PAID' as const,
      amountPaid: Number(order.total),
      method: order.paymentMethod || 'CASH',
      collectedById,
      collectedRole: collectedRole as 'DRIVER' | 'BARISTA',
      notes: 'Marked as paid via closing',
    };

    return this.paymentService.markOrderPayment(orderId, dto, cafeId);
  }

  async getPendingShifts(cafeId: string) {
    return this.prisma.cashHandover.findMany({
      where: {
        cafeId,
        status: { in: ['AWAITING_HANDOFF', 'AWAITING_CONFIRMATION'] }
      },
      include: {
        staff: {
          select: { name: true, role: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getConfirmedShifts(cafeId: string) {
    return this.prisma.cashHandover.findMany({
      where: {
        cafeId,
        status: 'CONFIRMED'
      },
      include: {
        staff: {
          select: { name: true, role: true }
        }
      },
      orderBy: { confirmedByOwner: 'desc' },
      take: 100,
    });
  }

  async confirmShift(shiftId: string, cafeId: string, deliveredCash: number) {
    const shift = await this.prisma.cashHandover.findUnique({
      where: { id: shiftId, cafeId }
    });
    if (!shift) {
      throw new BadRequestException('Shift not found');
    }

    if (shift.status === 'CONFIRMED') {
      throw new BadRequestException('Shift already confirmed');
    }

    const updated = await this.prisma.cashHandover.update({
      where: { id: shiftId },
      data: {
        status: 'CONFIRMED',
        deliveredCash,
        confirmedByOwner: new Date()
      },
      include: {
        staff: {
          select: { name: true }
        }
      }
    });

    return updated;
  }
}

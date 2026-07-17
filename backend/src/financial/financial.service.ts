import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { FinancialEngineService } from '../financial-engine/financial-engine.service';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvent } from '../events/events.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class FinancialService {
  private readonly logger = new Logger(FinancialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly financialEngine: FinancialEngineService,
  ) {}

  // ── EVENT HANDLERS ──

  @OnEvent('order.delivered')
  async handleOrderDelivered(event: AppEvent) {
    const { orderId } = event.payload as { orderId: string };
    await this.confirmRevenue(orderId);
  }

  @OnEvent('order.cancelled')
  async handleOrderCancelled(event: AppEvent) {
    const { orderId } = event.payload as { orderId: string };
    await this.rollbackRevenue(orderId);
  }

  @OnEvent('in_cafe_order.paid')
  async handleInCafeOrderPaid(event: AppEvent) {
    const payload = event.payload as { orderId: string; cafeId: string; total: number; paidAmount: number; staffId: string | null };
    await this.confirmInCafeRevenue(payload.orderId, payload.cafeId, payload.total);
  }

  // ── CORE FINANCIAL LOGIC ──

  async confirmRevenue(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: true } },
        customer: true,
        staff: true,
        driver: true,
      },
    });

    if (!order) {
      this.logger.warn(`confirmRevenue: Order ${orderId} not found`);
      return;
    }

    if (order.isRevenueConfirmed) {
      this.logger.warn(`confirmRevenue: Order ${orderId} already confirmed`);
      return;
    }

    if (order.status !== 'DELIVERED') {
      this.logger.warn(`confirmRevenue: Order ${orderId} not DELIVERED (${order.status})`);
      return;
    }

    const totalRevenue = Number(order.total);

    const totalCost = order.items.reduce((acc, item) => {
      return acc + item.quantity * Number(item.product.cost);
    }, 0);

    const profit = totalRevenue - totalCost;

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          isRevenueConfirmed: true,
          profit: new Prisma.Decimal(profit),
        },
      });

      await this.financialEngine.confirmRevenueInTx(tx, order.cafeId, totalRevenue, profit);

      await tx.customer.update({
        where: { id: order.customerId },
        data: {
          totalSpent: new Prisma.Decimal(Number(order.customer.totalSpent) + totalRevenue),
          lastOrderDate: order.deliveredAt || new Date(),
          totalOrders: order.customer.totalOrders + 1,
        },
      });

      if (order.staffId && order.staff) {
        const existing = await tx.staffEarning.findUnique({
          where: { staffId: order.staffId },
        });

        const staffBonus = totalRevenue >= 50 ? new Prisma.Decimal(2.0) : new Prisma.Decimal(0);

        if (existing) {
          await tx.staffEarning.update({
            where: { staffId: order.staffId },
            data: {
              totalOrdersHandled: existing.totalOrdersHandled + 1,
              bonus: new Prisma.Decimal(Number(existing.bonus) + Number(staffBonus)),
              totalEarnings: new Prisma.Decimal(
                Number(existing.totalEarnings) + Number(staffBonus),
              ),
            },
          });
        } else {
          await tx.staffEarning.create({
            data: {
              cafeId: order.cafeId,
              staffId: order.staffId,
              totalOrdersHandled: 1,
              bonus: staffBonus,
              totalEarnings: staffBonus,
            } as any,
          });
        }
      }

      if (order.driverId && order.driver) {
        const driverEarningAmount = new Prisma.Decimal(totalRevenue * 0.05);

        const existing = await tx.driverEarning.findUnique({
          where: { driverId: order.driverId },
        });

        if (existing) {
          await tx.driverEarning.update({
            where: { driverId: order.driverId },
            data: {
              deliveries: existing.deliveries + 1,
              earnings: new Prisma.Decimal(Number(existing.earnings) + Number(driverEarningAmount)),
            },
          });
        } else {
          await tx.driverEarning.create({
            data: {
              cafeId: order.cafeId,
              driverId: order.driverId,
              deliveries: 1,
              earnings: driverEarningAmount,
            } as any,
          });
        }

        const driver = await tx.driver.findUnique({ where: { id: order.driverId } });
        if (driver) {
          await tx.driver.update({
            where: { id: order.driverId },
            data: {
              totalDeliveries: driver.totalDeliveries + 1,
              totalRevenue: new Prisma.Decimal(Number(driver.totalRevenue) + totalRevenue),
            },
          });
        }
      }
    });

    this.emitFinanceEvents(order, totalRevenue, profit);

    this.logger.log(`Revenue confirmed for Order ${order.code}: $${totalRevenue.toFixed(2)} (profit: $${profit.toFixed(2)})`);
  }

  async rollbackRevenue(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });

    if (!order) {
      this.logger.warn(`rollbackRevenue: Order ${orderId} not found`);
      return;
    }

    if (!order.isRevenueConfirmed) {
      this.logger.log(`rollbackRevenue: Order ${orderId} was never confirmed — nothing to rollback`);
      return;
    }

    const totalRevenue = Number(order.total);

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          isRevenueConfirmed: false,
        },
      });

      await this.financialEngine.rollbackRevenueInTx(tx, order.cafeId, totalRevenue);

      if (order.customer) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            totalSpent: new Prisma.Decimal(
              Math.max(0, Number(order.customer.totalSpent) - totalRevenue),
            ),
            totalOrders: Math.max(0, order.customer.totalOrders - 1),
          },
        });
      }
    });

    this.logger.log(`Revenue rolled back for Order ${order.code}: -$${totalRevenue.toFixed(2)}`);
  }

  // ── EVENT EMISSION ──

  private emitFinanceEvents(
    order: {
      id: string;
      code: string;
      total: Prisma.Decimal;
      customerId: string;
      staffId?: string | null;
      driverId?: string | null;
    },
    totalRevenue: number,
    profit: number,
  ) {
    this.eventsService.emit('finance.revenue.updated', {
      orderId: order.id,
      orderCode: order.code,
      totalRevenue,
      profit,
      timestamp: new Date().toISOString(),
    });

    this.eventsService.emit('finance.customer.updated', {
      customerId: order.customerId,
      amount: totalRevenue,
    });

    if (order.staffId) {
      this.eventsService.emit('finance.staff.updated', {
        staffId: order.staffId,
        orderId: order.id,
      });
    }

    if (order.driverId) {
      this.eventsService.emit('finance.driver.updated', {
        driverId: order.driverId,
        earnings: totalRevenue * 0.05,
      });
    }

    this.eventsService.emit('finance.daily.snapshot', {
      totalRevenue,
      profit,
      ordersCount: 1,
    });
  }

  async confirmInCafeRevenue(orderId: string, cafeId: string, totalRevenue: number) {
    const order = await this.prisma.inCafeOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      this.logger.warn(`confirmInCafeRevenue: InCafeOrder ${orderId} not found`);
      return;
    }
    if (order.isRevenueConfirmed) {
      this.logger.warn(`confirmInCafeRevenue: InCafeOrder ${orderId} already confirmed`);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.inCafeOrder.update({
        where: { id: orderId },
        data: { isRevenueConfirmed: true },
      });

      await this.financialEngine.confirmRevenueInTx(tx, cafeId, totalRevenue, 0);
    });

    this.logger.log(`InCafe revenue confirmed for Order ${order.code}: $${totalRevenue.toFixed(2)}`);
  }

  // ── REST ENDPOINT HELPERS ──

  async getTodayFinancials(cafeId: string) {
    if (!cafeId) {
      throw new Error('cafeId is required');
    }
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [daily, inCafeRevenue, totalDebt, topEarningStaff, topEarningDriver] = await Promise.all([
      this.prisma.dailyRevenue.findFirst({ where: { cafeId, date: todayStart } }),

      this.prisma.inCafeOrder.aggregate({
        where: { cafeId, createdAt: { gte: todayStart, lte: todayEnd }, paymentStatus: 'PAID' },
        _sum: { total: true },
        _count: true,
      }),

      this.prisma.debt.aggregate({
        where: { cafeId, settled: false },
        _sum: { amount: true },
      }),

      this.prisma.staffEarning.findFirst({
        orderBy: { totalEarnings: 'desc' },
        include: { staff: true },
      }),

      this.prisma.driverEarning.findFirst({
        orderBy: { earnings: 'desc' },
        include: { driver: true },
      }),
    ]);

    const orders = await this.prisma.order.findMany({
      where: {
        cafeId,
        createdAt: { gte: todayStart, lte: todayEnd },
        isRevenueConfirmed: true,
      },
      include: {
        items: { include: { product: true } },
        staff: true,
        driver: true,
        customer: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const inCafeOrders = await this.prisma.inCafeOrder.findMany({
      where: {
        cafeId,
        createdAt: { gte: todayStart, lte: todayEnd },
        paymentStatus: 'PAID',
      },
      include: { items: { include: { product: true } }, createdBy: true },
      orderBy: { createdAt: 'desc' },
    });

    const revenueByProduct: Record<string, { name: string; category: string; revenue: number; quantity: number }> = {};

    for (const order of orders) {
      for (const item of order.items) {
        if (!revenueByProduct[item.productId]) {
          revenueByProduct[item.productId] = {
            name: item.product.name,
            category: item.product.category,
            revenue: 0,
            quantity: 0,
          };
        }
        revenueByProduct[item.productId].revenue += item.quantity * Number(item.unitPrice);
        revenueByProduct[item.productId].quantity += item.quantity;
      }
    }

    for (const order of inCafeOrders) {
      for (const item of order.items) {
        if (!revenueByProduct[item.productId]) {
          revenueByProduct[item.productId] = {
            name: item.product.name,
            category: item.product.category,
            revenue: 0,
            quantity: 0,
          };
        }
        revenueByProduct[item.productId].revenue += item.quantity * Number(item.unitPrice);
        revenueByProduct[item.productId].quantity += item.quantity;
      }
    }

    const topProducts = Object.entries(revenueByProduct)
      .map(([productId, data]) => ({ productId, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      daily: {
        totalRevenue: (daily ? Number(daily.totalRevenue) : 0) + Number(inCafeRevenue._sum.total || 0),
        totalProfit: daily ? Number(daily.totalProfit) : 0,
        totalOrders: (daily ? daily.totalOrders : 0) + (inCafeRevenue._count || 0),
      },
      totalCustomerDebt: Number(totalDebt._sum?.amount || 0),
      topStaff: topEarningStaff
        ? {
            id: topEarningStaff.staff.id,
            name: topEarningStaff.staff.name,
            totalOrdersHandled: topEarningStaff.totalOrdersHandled,
            totalEarnings: Number(topEarningStaff.totalEarnings),
          }
        : null,
      topDriver: topEarningDriver
        ? {
            id: topEarningDriver.driver.id,
            name: topEarningDriver.driver.name,
            deliveries: topEarningDriver.deliveries,
            earnings: Number(topEarningDriver.earnings),
          }
        : null,
      topProducts,
    };
  }

  async getAllStaffEarnings(cafeId: string) {
    return this.prisma.staffEarning.findMany({
      where: { cafeId },
      include: { staff: true },
      orderBy: { totalEarnings: 'desc' },
    });
  }

  async getAllDriverEarnings(cafeId: string) {
    return this.prisma.driverEarning.findMany({
      where: { cafeId },
      include: { driver: true },
      orderBy: { earnings: 'desc' },
    });
  }
}





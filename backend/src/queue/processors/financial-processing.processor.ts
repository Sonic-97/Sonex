import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '../queue.config';
import { QueueService } from '../queue.service';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../../events/events.service';
import { TenantContextService } from '../../common/tenant-context.service';
import { Prisma } from '@prisma/client';

@Processor(QUEUE_NAMES.FINANCIAL_PROCESSING, { concurrency: 2 })
export class FinancialProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(FinancialProcessingProcessor.name);

  constructor(
    private readonly queueService: QueueService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {
    super();
  }

  async process(job: Job<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const { cafeId } = job.data as { cafeId?: string };

    const idempotent = await this.redisService.checkIdempotency(`job:${job.id}`);
    if (idempotent) {
      this.logger.warn(`Financial job ${job.id} already processed`);
      return { skipped: true, reason: 'idempotency' };
    }

    const execute = () => {
      switch (job.name) {
        case 'confirm-revenue':
          return this.handleConfirmRevenue(job);
        case 'rollback-revenue':
          return this.handleRollbackRevenue(job);
        default:
          this.logger.warn(`Unknown financial job: ${job.name}`);
          return { error: `Unknown job: ${job.name}` };
      }
    };

    try {
      const result = cafeId ? TenantContextService.run(cafeId, execute) : await execute();

      await this.redisService.setIdempotency(`job:${job.id}`, 'completed');

      this.eventsService.emit('financial.job.completed', {
        jobId: job.id,
        jobName: job.name,
        result,
      });

      return result;
    } catch (err) {
      this.logger.error(`Financial job ${job.id} failed: ${(err as Error).message}`);
      if (job.attemptsMade >= (job.opts?.attempts ?? 5) - 1) {
        await this.queueService.sendToDeadLetter(QUEUE_NAMES.FINANCIAL_PROCESSING, {
          name: job.name,
          data: job.data,
          error: (err as Error).message,
        });
      }
      throw err;
    }
  }

  private async handleConfirmRevenue(job: Job<Record<string, unknown>>) {
    const { orderId } = job.data as { orderId: string };

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: true } },
        customer: true,
        staff: true,
        driver: true,
      },
    });

    if (!order) throw new Error(`Order ${orderId} not found`);
    if (order.isRevenueConfirmed) {
      this.logger.warn(`Order ${orderId} already confirmed — skipping`);
      return { skipped: true, reason: 'already_confirmed' };
    }
    if (order.status !== 'DELIVERED') {
      this.logger.warn(`Order ${orderId} not DELIVERED (${order.status}) — skipping`);
      return { skipped: true, reason: `status_${order.status}` };
    }

    const totalRevenue = Number(order.total);
    const totalCost = order.items.reduce((acc, item) => acc + item.quantity * Number(item.product.cost), 0);
    const profit = totalRevenue - totalCost;

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          isRevenueConfirmed: true,
          profit: new Prisma.Decimal(profit),
        },
      });

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const daily = await tx.dailyRevenue.findFirst({ where: { date: todayStart } });
      if (daily) {
        await tx.dailyRevenue.update({
          where: { id: daily.id },
          data: {
            totalRevenue: new Prisma.Decimal(Number(daily.totalRevenue) + totalRevenue),
            totalProfit: new Prisma.Decimal(Number(daily.totalProfit) + profit),
            totalOrders: daily.totalOrders + 1,
          },
        });
      } else {
        await tx.dailyRevenue.create({
          data: {
            cafeId: order.cafeId,
            date: todayStart,
            totalRevenue: new Prisma.Decimal(totalRevenue),
            totalProfit: new Prisma.Decimal(profit),
            totalOrders: 1,
          } as any,
        });
      }

      await tx.customer.update({
        where: { id: order.customerId },
        data: {
          totalSpent: new Prisma.Decimal(Number(order.customer.totalSpent) + totalRevenue),
          lastOrderDate: order.deliveredAt || new Date(),
          totalOrders: order.customer.totalOrders + 1,
        },
      });

      if (order.staffId && order.staff) {
        const staffBonus = totalRevenue >= 50 ? new Prisma.Decimal(2.0) : new Prisma.Decimal(0);
        await tx.staffEarning.upsert({
          where: { staffId: order.staffId },
          create: {
            cafeId: order.cafeId,
            staffId: order.staffId,
            totalOrdersHandled: 1,
            bonus: staffBonus,
            totalEarnings: staffBonus,
          } as any,
          update: {
            totalOrdersHandled: { increment: 1 },
            bonus: { increment: staffBonus },
            totalEarnings: { increment: staffBonus },
          },
        });
      }

      if (order.driverId && order.driver) {
        const commission = new Prisma.Decimal(totalRevenue * 0.05);
        await tx.driverEarning.upsert({
          where: { driverId: order.driverId },
          create: {
            cafeId: order.cafeId,
            driverId: order.driverId,
            deliveries: 1,
            earnings: commission,
          } as any,
          update: {
            deliveries: { increment: 1 },
            earnings: { increment: commission },
          },
        });

        await tx.driver.update({
          where: { id: order.driverId },
          data: {
            totalDeliveries: { increment: 1 },
            totalRevenue: new Prisma.Decimal(Number(order.driver.totalRevenue) + totalRevenue),
          },
        });
      }
    });

    this.eventsService.emit('finance.revenue.updated', {
      orderId: order.id,
      orderCode: order.code,
      totalRevenue,
      profit,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Revenue confirmed for Order ${order.code}: $${totalRevenue.toFixed(2)} (profit: $${profit.toFixed(2)})`);

    return {
      orderId,
      totalRevenue,
      profit,
      status: 'confirmed',
    };
  }

  private async handleRollbackRevenue(job: Job<Record<string, unknown>>) {
    const { orderId } = job.data as { orderId: string };

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });

    if (!order) throw new Error(`Order ${orderId} not found`);
    if (!order.isRevenueConfirmed) {
      this.logger.warn(`Order ${orderId} was never confirmed — nothing to rollback`);
      return { skipped: true, reason: 'not_confirmed' };
    }

    const totalRevenue = Number(order.total);

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { isRevenueConfirmed: false },
      });

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const daily = await tx.dailyRevenue.findFirst({ where: { date: todayStart } });
      if (daily && daily.totalOrders > 0) {
        await tx.dailyRevenue.update({
          where: { id: daily.id },
          data: {
            totalRevenue: new Prisma.Decimal(Math.max(0, Number(daily.totalRevenue) - totalRevenue)),
            totalOrders: Math.max(0, daily.totalOrders - 1),
          },
        });
      }

      if (order.customer) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            totalSpent: new Prisma.Decimal(Math.max(0, Number(order.customer.totalSpent) - totalRevenue)),
            totalOrders: Math.max(0, order.customer.totalOrders - 1),
          },
        });
      }
    });

    this.logger.log(`Revenue rolled back for Order ${order.code}: -$${totalRevenue.toFixed(2)}`);

    return { orderId, rolledBack: true };
  }
}





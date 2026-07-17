import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '../queue.config';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../../events/events.service';
import { TenantContextService } from '../../common/tenant-context.service';

interface DailyAggregationData {
  date: string;
  totalRevenue?: number;
  totalOrders?: number;
  totalProfit?: number;
}

@Processor(QUEUE_NAMES.ANALYTICS_PROCESSING, { concurrency: 1 })
export class AnalyticsProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsProcessingProcessor.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {
    super();
  }

  async process(job: Job<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const { cafeId } = job.data as { cafeId?: string };
    const execute = () => {
      switch (job.name) {
        case 'process-daily-aggregation':
          return this.handleDailyAggregation(job);
        case 'update-staff-performance':
          return this.handleStaffPerformance(job);
        case 'update-financial-cache':
          return this.handleFinancialCacheUpdate(job);
        default:
          this.logger.warn(`Unknown analytics job: ${job.name}`);
          return { error: `Unknown job: ${job.name}` };
      }
    };
    try {
      return cafeId ? TenantContextService.run(cafeId, execute) : execute();
    } catch (err) {
      this.logger.error(`Analytics job ${job.id} failed: ${(err as Error).message}`);
      throw err;
    }
  }

  private async handleDailyAggregation(job: Job<Record<string, unknown>>) {
    const { date } = job.data as { date: string };
    const startDate = new Date(date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    const deliveredOrders = await this.prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        deliveredAt: { gte: startDate, lt: endDate },
      },
      include: { items: { include: { product: true } } },
    });

    const totalRevenue = deliveredOrders.reduce((sum, o) => sum + Number(o.total), 0);
    const totalCost = deliveredOrders.reduce((sum, o) =>
      sum + o.items.reduce((s, i) => s + i.quantity * Number(i.product.cost), 0), 0);
    const totalProfit = totalRevenue - totalCost;

    const hourlyBuckets: Record<string, number> = {};
    for (const order of deliveredOrders) {
      if (order.deliveredAt) {
        const hour = order.deliveredAt.getHours().toString().padStart(2, '0');
        hourlyBuckets[hour] = (hourlyBuckets[hour] || 0) + 1;
      }
    }

    const cacheKey = `analytics:daily:${date}`;
    await this.redisService.setDashboardCache(cacheKey, {
      date,
      totalRevenue,
      totalProfit,
      totalOrders: deliveredOrders.length,
      totalCost,
    } as Record<string, unknown>);

    this.eventsService.emit('analytics.daily.updated', {
      date,
      totalRevenue,
      totalProfit,
      totalOrders: deliveredOrders.length,
    });

    this.logger.log(`Daily aggregation for ${date}: $${totalRevenue} revenue, $${totalProfit} profit`);

    return {
      date,
      totalRevenue,
      totalProfit,
      totalOrders: deliveredOrders.length,
    };
  }

  private async handleStaffPerformance(job: Job<Record<string, unknown>>) {
    const { staffId, orderId, status } = job.data as {
      staffId: string;
      orderId: string;
      status: string;
    };

    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      include: {
        orders: {
          where: { createdAt: { gte: new Date(new Date().toISOString().split('T')[0]) } },
          select: { id: true, status: true, total: true },
        },
      },
    });

    if (!staff) {
      this.logger.warn(`Staff ${staffId} not found for performance update`);
      return { skipped: true, reason: 'staff_not_found' };
    }

    const ordersHandled = staff.orders.length;
    const completed = staff.orders.filter((o) => o.status === 'DELIVERED').length;
    const cancelled = staff.orders.filter((o) => o.status === 'CANCELLED').length;
    const totalRevenue = staff.orders.reduce((sum, o) => sum + Number(o.total), 0);
    const completionRate = ordersHandled > 0 ? (completed / ordersHandled) * 100 : 100;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.prisma.staffPerformance.upsert({
      where: { cafeId_staffId_date: { cafeId: staff.cafeId, staffId, date: today } },
      create: {
        cafeId: staff.cafeId,
        staffId,
        date: today,
        ordersHandled,
        totalRevenue,
        cancellationCount: cancelled,
        completionRate,
      } as any,
      update: {
        ordersHandled,
        totalRevenue,
        cancellationCount: cancelled,
        completionRate,
      },
    });

    this.eventsService.emit('staff.performance.updated', {
      staffId,
      staffName: staff.name,
      ordersHandled,
      totalRevenue,
      completionRate,
    });

    return { staffId, ordersHandled, cancellationCount: cancelled };
  }

  private async handleFinancialCacheUpdate(job: Job<Record<string, unknown>>) {
    const payload = job.data as unknown as DailyAggregationData;

    const cacheKey = `analytics:financial:latest`;
    await this.redisService.setDashboardCache(cacheKey, {
      ...payload,
      cachedAt: new Date().toISOString(),
    } as Record<string, unknown>);

    return { status: 'cached' };
  }
}





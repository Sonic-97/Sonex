import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvent } from '../events/events.service';
import { QueueService } from './queue.service';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QueueBridge {
  private readonly logger = new Logger(QueueBridge.name);

  constructor(
    private readonly queueService: QueueService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  private async cafeIdFromOrder(orderId: string): Promise<string | undefined> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { cafeId: true },
    });
    return order?.cafeId;
  }

  @OnEvent('order.delivered')
  async onOrderDelivered(event: AppEvent) {
    const { orderId } = event.payload as { orderId: string };
    const cafeId = await this.cafeIdFromOrder(orderId);
    const dedupKey = `financial:${orderId}`;

    if (await this.redisService.acquireLock(dedupKey, 30000)) {
      try {
        await this.queueService.addFinancialJob(
          'confirm-revenue',
          { orderId, cafeId, eventTimestamp: event.timestamp },
          { jobId: `financial-confirm-${orderId}` },
        );
      } finally {
        await this.redisService.releaseLock(dedupKey);
      }
    }
  }

  @OnEvent('order.cancelled')
  async onOrderCancelled(event: AppEvent) {
    const { orderId } = event.payload as { orderId: string };
    const cafeId = await this.cafeIdFromOrder(orderId);

    await this.queueService.addFinancialJob(
      'rollback-revenue',
      { orderId, cafeId, eventTimestamp: event.timestamp },
      { jobId: `financial-rollback-${orderId}` },
    );
  }

  @OnEvent('order.created')
  async onOrderCreated(event: AppEvent) {
    const payload = event.payload as Record<string, unknown>;
    const cafeId = await this.cafeIdFromOrder(payload.orderId as string);

    await this.queueService.addNotificationJob(
      'order-created-notify',
      { ...payload, cafeId, eventTimestamp: event.timestamp },
      { jobId: `notify-created-${payload.orderId}` },
    );
  }

  @OnEvent('order.ready')
  async onOrderReady(event: AppEvent) {
    const payload = event.payload as Record<string, unknown>;
    const cafeId = await this.cafeIdFromOrder(payload.orderId as string);

    await this.queueService.addNotificationJob(
      'order-ready-notify',
      { ...payload, cafeId, eventTimestamp: event.timestamp },
      { jobId: `notify-ready-${payload.orderId}` },
    );
  }

  @OnEvent('order.status.changed')
  async onOrderStatusChanged(event: AppEvent) {
    const payload = event.payload as { orderId: string; status: string; staffId?: string };
    const { orderId, status, staffId } = payload;
    const cafeId = await this.cafeIdFromOrder(orderId);

    if (status === 'DELIVERED') {
      await this.queueService.addAnalyticsJob(
        'process-daily-aggregation',
        { date: new Date().toISOString().split('T')[0], cafeId },
        { jobId: `analytics-daily-${new Date().toISOString().split('T')[0]}` },
      );
    }

    if (staffId) {
      await this.queueService.addAnalyticsJob(
        'update-staff-performance',
        { staffId, orderId, status, cafeId, eventTimestamp: event.timestamp },
        { jobId: `staff-perf-${staffId}-${orderId}` },
      );
    }
  }

  @OnEvent('finance.daily.snapshot')
  async onFinanceDailySnapshot(event: AppEvent) {
    const payload = event.payload as Record<string, unknown>;

    await this.queueService.addAnalyticsJob(
      'update-financial-cache',
      { ...payload, eventTimestamp: event.timestamp },
    );
  }
}





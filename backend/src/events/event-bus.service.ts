import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { EventsService } from './events.service';
import { QueueService } from '../queue/queue.service';
import { EventDedupService } from './event-dedup.service';
import { EventEnvelope, EventPayloadMap } from './event-schemas';

const EVENT_SOURCE = 'event-bus';

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly queueService: QueueService,
    private readonly eventDedup: EventDedupService,
  ) {}

  private queueForEvent(eventType: string): keyof QueueService | null {
    if (eventType.startsWith('order.')) return 'addOrderJob' as any;
    if (eventType.startsWith('payment.') || eventType.startsWith('financial.')) return 'addFinancialJob' as any;
    if (eventType.startsWith('inventory.')) return 'addInventoryJob' as any;
    if (eventType.startsWith('whatsapp.') || eventType === 'pending-reply.created') return 'addWhatsAppJob' as any;
    if (eventType.startsWith('analytics.')) return 'addAnalyticsJob' as any;
    if (eventType.startsWith('notification.') || eventType === 'order.ready' || eventType === 'order.delivered') return 'addNotificationJob' as any;
    return null;
  }

  private buildEnvelope<T extends keyof EventPayloadMap>(
    eventType: T,
    payload: EventPayloadMap[T],
    cafeId: string,
    correlationId?: string,
    causationId?: string,
  ): EventEnvelope<EventPayloadMap[T]> {
    const eventId = uuid();
    return {
      eventId,
      eventType: eventType as string,
      eventVersion: 1,
      timestamp: new Date().toISOString(),
      source: EVENT_SOURCE,
      cafeId,
      correlationId: correlationId || eventId,
      causationId: causationId || eventId,
      payload,
    };
  }

  async publish<T extends keyof EventPayloadMap>(
    eventType: T,
    payload: EventPayloadMap[T],
    cafeId: string,
    options?: { correlationId?: string; causationId?: string; dedupKey?: string; dedupTtl?: number },
  ): Promise<void> {
    if (options?.dedupKey) {
      const dedupKey = `event:dedup:${options.dedupKey}`;
      const duplicate = await this.eventDedup.isDuplicate(dedupKey, options.dedupTtl ?? 86400);
      if (duplicate) {
        this.logger.debug(`Dedup: skipping duplicate event ${eventType} key=${options.dedupKey}`);
        return;
      }
    }

    const envelope = this.buildEnvelope(eventType, payload, cafeId, options?.correlationId, options?.causationId);

    this.eventsService.emit(eventType as string, envelope.payload as any, cafeId);

    const queueMethod = this.queueForEvent(eventType as string);
    if (queueMethod) {
      try {
        await (this.queueService[queueMethod] as any)(eventType as string, envelope as any);
      } catch (err) {
        this.logger.error(`Failed to enqueue event ${eventType}: ${(err as Error).message}`);
      }
    }
  }
}

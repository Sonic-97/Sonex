import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ModuleRef } from '@nestjs/core';
import { DomainEventType, DomainEventPayloadMap } from './domain-event.registry';
import { DomainEvent, DomainEventHandler } from './domain-event.interface';
import { EventsService } from '../events/events.service';
import { QueueService } from '../queue/queue.service';
import { EventDedupService } from '../events/event-dedup.service';
import { TenantContextService } from '../common/tenant-context.service';

const DOMAIN_EVENT_SOURCE = 'domain-event-bus';

@Injectable()
export class DomainEventBusService implements OnModuleInit {
  private readonly logger = new Logger(DomainEventBusService.name);
  private readonly handlers = new Map<string, DomainEventHandler[]>();

  constructor(
    private readonly eventsService: EventsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly queueService: QueueService,
    private readonly eventDedup: EventDedupService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('DomainEventBusService initialized');
  }

  registerHandler(eventType: string, handler: DomainEventHandler): void {
    const existing = this.handlers.get(eventType) || [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
    this.logger.debug(`Handler registered for ${eventType}: ${handler.constructor?.name || 'anonymous'}`);
  }

  private buildDomainEvent(
    eventType: string,
    payload: Record<string, unknown>,
    cafeId: string,
    branchId: string,
    orderId: string,
    userId: string,
    options?: {
      correlationId?: string;
      causationId?: string;
      traceId?: string;
    },
  ): DomainEvent {
    const eventId = uuid();
    const traceId = options?.traceId || uuid();
    const correlationId = options?.correlationId || eventId;
    const causationId = options?.causationId || eventId;

    return {
      eventId,
      eventType,
      eventVersion: 1,
      timestamp: new Date().toISOString(),
      source: DOMAIN_EVENT_SOURCE,
      cafeId,
      branchId,
      orderId,
      userId,
      correlationId,
      causationId,
      traceId,
      payload,
    };
  }

  private async validateEvent(
    eventType: string,
    payload: Record<string, unknown>,
    cafeId: string,
  ): Promise<void> {
    if (!eventType) {
      throw new Error('eventType is required');
    }
    if (!payload) {
      throw new Error('payload is required');
    }
    if (!cafeId) {
      throw new Error('cafeId is required for domain events');
    }
  }

  private resolveCafeId(cafeId?: string): string {
    return cafeId || TenantContextService.cafeId || 'unknown';
  }

  private queueForEvent(eventType: string): keyof QueueService | null {
    if (eventType.includes('incare') || eventType.includes('staff.purchase')) return 'addNotificationJob' as any;
    if (eventType.includes('order')) return 'addOrderJob' as any;
    if (eventType.includes('payment') || eventType.includes('finance') || eventType.includes('debt') || eventType.includes('refund')) return 'addFinancialJob' as any;
    if (eventType.includes('inventory') || eventType.includes('recipe')) return 'addInventoryJob' as any;
    if (eventType.includes('customer') || eventType.includes('employee') || eventType.includes('branch')) return 'addAnalyticsJob' as any;
    return null;
  }

  async publish<T extends DomainEventType>(
    eventType: T,
    payload: any,
    cafeId?: string,
    branchId?: string,
    orderId?: string,
    userId?: string,
    options?: {
      correlationId?: string;
      causationId?: string;
      traceId?: string;
      dedupKey?: string;
      dedupTtl?: number;
    },
  ): Promise<void> {
    const resolvedCafeId = this.resolveCafeId(cafeId);
    const rawPayload = payload as unknown as Record<string, unknown>;

    await this.validateEvent(eventType as string, rawPayload, resolvedCafeId);

    if (options?.dedupKey) {
      const dedupKey = `domain-event:dedup:${options.dedupKey}`;
      const duplicate = await this.eventDedup.isDuplicate(dedupKey, options.dedupTtl ?? 86400);
      if (duplicate) {
        this.logger.debug(`Dedup: skipping duplicate domain event ${eventType} key=${options.dedupKey}`);
        return;
      }
    }

    const rawEventType = eventType as string;
    const envelope = this.buildDomainEvent(
      rawEventType,
      rawPayload,
      resolvedCafeId,
      branchId || '',
      orderId || '',
      userId || '',
      options,
    );

    this.eventsService.emit(rawEventType, envelope as any, resolvedCafeId);
    this.eventEmitter.emit(rawEventType, envelope);

    const handlers = this.handlers.get(rawEventType) || [];
    for (const handler of handlers) {
      if (handler.supports(rawEventType)) {
        try {
          await handler.handle(envelope as any);
        } catch (err) {
          this.logger.error(`Handler ${handler.constructor?.name || 'unknown'} failed for ${rawEventType}: ${(err as Error).message}`);
        }
      }
    }

    const queueMethod = this.queueForEvent(rawEventType);
    if (queueMethod) {
      try {
        await (this.queueService[queueMethod] as any)(rawEventType, envelope as any);
      } catch (err) {
        this.logger.error(`Failed to enqueue domain event ${rawEventType}: ${(err as Error).message}`);
      }
    }
  }

  async publishMany(
    events: Array<{
      eventType: DomainEventType;
      payload: any;
      cafeId?: string;
      branchId?: string;
      orderId?: string;
      userId?: string;
      options?: {
        correlationId?: string;
        causationId?: string;
        traceId?: string;
        dedupKey?: string;
        dedupTtl?: number;
      };
    }>,
  ): Promise<void> {
    await Promise.all(
      events.map((e) =>
        this.publish(e.eventType, e.payload, e.cafeId, e.branchId, e.orderId, e.userId, e.options),
      ),
    );
  }
}

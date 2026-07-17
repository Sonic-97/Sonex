import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEventTypes } from '../domain-event.registry';
import { DomainEvent, DomainEventHandler } from '../domain-event.interface';
import { EventsService } from '../../events/events.service';

@Injectable()
export class DesktopSyncSubscriber implements DomainEventHandler {
  private readonly logger = new Logger(DesktopSyncSubscriber.name);

  constructor(
    private readonly eventsService: EventsService,
  ) {}

  supports(eventType: string): boolean {
    return [
      DomainEventTypes.ORDER_CREATED,
      DomainEventTypes.ORDER_CONFIRMED,
      DomainEventTypes.ORDER_READY,
      DomainEventTypes.ORDER_PICKED_UP,
      DomainEventTypes.ORDER_DELIVERED,
      DomainEventTypes.ORDER_PAID,
      DomainEventTypes.ORDER_CANCELLED,
      DomainEventTypes.ORDER_REFUNDED,
      DomainEventTypes.INVENTORY_CONSUMED,
      DomainEventTypes.INVENTORY_REFILLED,
      DomainEventTypes.INVENTORY_LOW_STOCK,
      DomainEventTypes.INCARE_ORDER_CREATED,
      DomainEventTypes.INCARE_PAYMENT_UPDATED,
    ].includes(eventType as any);
  }

  async handle(event: DomainEvent): Promise<void> {
    this.logger.debug(`DesktopSyncSubscriber handling ${event.eventType}`);
  }

  @OnEvent(DomainEventTypes.ORDER_CREATED)
  async onOrderCreated(event: DomainEvent<any>): Promise<void> {
    this.broadcastSync('order.created', event);
  }

  @OnEvent(DomainEventTypes.ORDER_CONFIRMED)
  async onOrderConfirmed(event: DomainEvent<any>): Promise<void> {
    this.broadcastSync('order.confirmed', event);
  }

  @OnEvent(DomainEventTypes.ORDER_READY)
  async onOrderReady(event: DomainEvent<any>): Promise<void> {
    this.broadcastSync('order.ready', event);
  }

  @OnEvent(DomainEventTypes.ORDER_PICKED_UP)
  async onOrderPickedUp(event: DomainEvent<any>): Promise<void> {
    this.broadcastSync('order.picked_up', event);
  }

  @OnEvent(DomainEventTypes.ORDER_DELIVERED)
  async onOrderDelivered(event: DomainEvent<any>): Promise<void> {
    this.broadcastSync('order.delivered', event);
  }

  @OnEvent(DomainEventTypes.ORDER_PAID)
  async onOrderPaid(event: DomainEvent<any>): Promise<void> {
    this.broadcastSync('order.paid', event);
  }

  @OnEvent(DomainEventTypes.ORDER_CANCELLED)
  async onOrderCancelled(event: DomainEvent<any>): Promise<void> {
    this.broadcastSync('order.cancelled', event);
  }

  @OnEvent(DomainEventTypes.ORDER_REFUNDED)
  async onOrderRefunded(event: DomainEvent<any>): Promise<void> {
    this.broadcastSync('order.refunded', event);
  }

  @OnEvent(DomainEventTypes.INVENTORY_REFILLED)
  async onInventoryRefilled(event: DomainEvent<any>): Promise<void> {
    this.broadcastSync('inventory.refilled', event);
  }

  @OnEvent(DomainEventTypes.INVENTORY_LOW_STOCK)
  async onLowStock(event: DomainEvent<any>): Promise<void> {
    this.broadcastSync('inventory.low_stock', event);
  }

  private broadcastSync(type: string, event: DomainEvent<any>): void {
    this.eventsService.broadcast(`desktop.sync.${type}`, {
      eventId: event.eventId,
      correlationId: event.correlationId,
      traceId: event.traceId,
      cafeId: event.cafeId,
      branchId: event.branchId,
      orderId: event.orderId,
      userId: event.userId,
      payload: { ...event.payload, timestamp: event.timestamp },
    });
    this.logger.debug(`Desktop sync: ${type} for cafe ${event.payload.cafeId}`);
  }
}

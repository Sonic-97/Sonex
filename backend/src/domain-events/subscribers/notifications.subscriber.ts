import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEventTypes } from '../domain-event.registry';
import { DomainEvent, DomainEventHandler } from '../domain-event.interface';
import { EventsService } from '../../events/events.service';

@Injectable()
export class NotificationsSubscriber implements DomainEventHandler {
  private readonly logger = new Logger(NotificationsSubscriber.name);

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
      DomainEventTypes.INCARE_ORDER_CREATED,
      DomainEventTypes.INCARE_PAYMENT_UPDATED,
      DomainEventTypes.INVENTORY_LOW_STOCK,
      DomainEventTypes.INVENTORY_REFILLED,
      DomainEventTypes.STAFF_PURCHASE_CREATED,
    ].includes(eventType as any);
  }

  async handle(event: DomainEvent): Promise<void> {
    this.logger.debug(`NotificationsSubscriber handling ${event.eventType}`);
  }

  @OnEvent(DomainEventTypes.ORDER_CREATED)
  async onOrderCreated(event: DomainEvent<any>): Promise<void> {
    const { cafeId, orderId, orderCode, total } = event.payload;
    this.logger.log(`Notification: new order ${orderCode} (${total} EGP) at cafe ${cafeId}`);
    this.eventsService.broadcast('notification.order.created', { orderId, orderCode, total, cafeId, timestamp: event.timestamp });
  }

  @OnEvent(DomainEventTypes.ORDER_CONFIRMED)
  async onOrderConfirmed(event: DomainEvent<any>): Promise<void> {
    this.eventsService.broadcast('notification.order.confirmed', { orderId: event.payload.orderId, orderCode: event.payload.orderCode, cafeId: event.payload.cafeId, timestamp: event.timestamp });
  }

  @OnEvent(DomainEventTypes.ORDER_READY)
  async onOrderReady(event: DomainEvent<any>): Promise<void> {
    this.eventsService.broadcast('notification.order.ready', { orderId: event.payload.orderId, orderCode: event.payload.orderCode, cafeId: event.payload.cafeId, timestamp: event.timestamp });
  }

  @OnEvent(DomainEventTypes.ORDER_PICKED_UP)
  async onOrderPickedUp(event: DomainEvent<any>): Promise<void> {
    this.eventsService.broadcast('notification.order.picked_up', { orderId: event.payload.orderId, orderCode: event.payload.orderCode, cafeId: event.payload.cafeId, timestamp: event.timestamp });
  }

  @OnEvent(DomainEventTypes.ORDER_DELIVERED)
  async onOrderDelivered(event: DomainEvent<any>): Promise<void> {
    this.eventsService.broadcast('notification.order.delivered', { orderId: event.payload.orderId, orderCode: event.payload.orderCode, cafeId: event.payload.cafeId, timestamp: event.timestamp });
  }

  @OnEvent(DomainEventTypes.ORDER_PAID)
  async onOrderPaid(event: DomainEvent<any>): Promise<void> {
    this.eventsService.broadcast('notification.order.paid', { orderId: event.payload.orderId, orderCode: event.payload.orderCode, amount: event.payload.amount, cafeId: event.payload.cafeId, timestamp: event.timestamp });
  }

  @OnEvent(DomainEventTypes.ORDER_CANCELLED)
  async onOrderCancelled(event: DomainEvent<any>): Promise<void> {
    this.eventsService.broadcast('notification.order.cancelled', { orderId: event.payload.orderId, orderCode: event.payload.orderCode, cafeId: event.payload.cafeId, timestamp: event.timestamp });
  }

  @OnEvent(DomainEventTypes.INCARE_ORDER_CREATED)
  async onInCafeOrderCreated(event: DomainEvent<any>): Promise<void> {
    this.eventsService.broadcast('notification.incare.order.created', { orderId: event.payload.orderId, customerName: event.payload.customerName, cafeId: event.payload.cafeId, timestamp: event.timestamp });
  }

  @OnEvent(DomainEventTypes.INCARE_PAYMENT_UPDATED)
  async onInCafePaymentUpdated(event: DomainEvent<any>): Promise<void> {
    this.eventsService.broadcast('notification.incare.payment.updated', { orderId: event.payload.orderId, cafeId: event.payload.cafeId, timestamp: event.timestamp });
  }

  @OnEvent(DomainEventTypes.INVENTORY_LOW_STOCK)
  async onLowStock(event: DomainEvent<any>): Promise<void> {
    this.eventsService.broadcast('notification.inventory.low_stock', { itemName: event.payload.itemName, currentQty: event.payload.currentQty, cafeId: event.payload.cafeId, timestamp: event.timestamp });
  }

  @OnEvent(DomainEventTypes.STAFF_PURCHASE_CREATED)
  async onStaffPurchaseCreated(event: DomainEvent<any>): Promise<void> {
    this.eventsService.broadcast('notification.staff.purchase.created', { purchaseId: event.payload.purchaseId, amount: event.payload.amount, cafeId: event.payload.cafeId, timestamp: event.timestamp });
  }
}

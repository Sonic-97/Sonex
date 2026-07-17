import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEventTypes } from '../domain-event.registry';
import { DomainEvent, DomainEventHandler } from '../domain-event.interface';

@Injectable()
export class ReportsSubscriber implements DomainEventHandler {
  private readonly logger = new Logger(ReportsSubscriber.name);

  constructor() {}

  supports(eventType: string): boolean {
    return [
      DomainEventTypes.ORDER_CREATED,
      DomainEventTypes.ORDER_PAID,
      DomainEventTypes.ORDER_CANCELLED,
      DomainEventTypes.ORDER_DELIVERED,
      DomainEventTypes.ORDER_REFUNDED,
      DomainEventTypes.INVENTORY_CONSUMED,
      DomainEventTypes.INVENTORY_REFILLED,
      DomainEventTypes.INVENTORY_LOW_STOCK,
      DomainEventTypes.DEBT_CREATED,
      DomainEventTypes.DEBT_PAID,
      DomainEventTypes.INCARE_ORDER_CREATED,
      DomainEventTypes.STAFF_PURCHASE_CREATED,
    ].includes(eventType as any);
  }

  async handle(event: DomainEvent): Promise<void> {
    this.logger.debug(`ReportsSubscriber handling ${event.eventType}`);
  }

  @OnEvent(DomainEventTypes.ORDER_PAID)
  async onOrderPaid(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`Reports: recording payment for order ${event.payload.orderCode}`);
  }

  @OnEvent(DomainEventTypes.ORDER_CANCELLED)
  async onOrderCancelled(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`Reports: recording cancellation for order ${event.payload.orderCode}`);
  }

  @OnEvent(DomainEventTypes.INVENTORY_CONSUMED)
  async onInventoryConsumed(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`Reports: recording inventory cost ${event.payload.totalCost} for order ${event.payload.orderId}`);
  }

  @OnEvent(DomainEventTypes.STAFF_PURCHASE_CREATED)
  async onStaffPurchase(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`Reports: staff purchase ${event.payload.purchaseId} — ${event.payload.amount} EGP`);
  }
}

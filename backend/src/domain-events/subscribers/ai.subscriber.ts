import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEventTypes } from '../domain-event.registry';
import { DomainEvent, DomainEventHandler } from '../domain-event.interface';

@Injectable()
export class AISubscriber implements DomainEventHandler {
  private readonly logger = new Logger(AISubscriber.name);

  constructor() {}

  supports(eventType: string): boolean {
    return [
      DomainEventTypes.ORDER_CREATED,
      DomainEventTypes.ORDER_CANCELLED,
      DomainEventTypes.DEBT_CREATED,
      DomainEventTypes.INVENTORY_LOW_STOCK,
      DomainEventTypes.CUSTOMER_CREATED,
    ].includes(eventType as any);
  }

  async handle(event: DomainEvent): Promise<void> {
    this.logger.debug(`AISubscriber handling ${event.eventType}`);
  }

  @OnEvent(DomainEventTypes.ORDER_CREATED)
  async onOrderCreated(event: DomainEvent<any>): Promise<void> {
    const { cafeId, total, customerId, items } = event.payload;
    this.logger.log(`AI: evaluating order ${event.payload.orderId} — ${total} EGP`);
  }

  @OnEvent(DomainEventTypes.ORDER_CANCELLED)
  async onOrderCancelled(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`AI: analyzing cancellation for order ${event.payload.orderId}`);
  }

  @OnEvent(DomainEventTypes.INVENTORY_LOW_STOCK)
  async onLowStock(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`AI: low stock alert for ${event.payload.itemName} — suggesting reorder`);
  }

  @OnEvent(DomainEventTypes.CUSTOMER_CREATED)
  async onCustomerCreated(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`AI: new customer ${event.payload.name} — starting learning profile`);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEventTypes } from '../domain-event.registry';
import { DomainEvent, DomainEventHandler } from '../domain-event.interface';

@Injectable()
export class OwnerCopilotSubscriber implements DomainEventHandler {
  private readonly logger = new Logger(OwnerCopilotSubscriber.name);

  constructor() {}

  supports(eventType: string): boolean {
    return [
      DomainEventTypes.ORDER_CANCELLED,
      DomainEventTypes.ORDER_REFUNDED,
      DomainEventTypes.INVENTORY_LOW_STOCK,
      DomainEventTypes.DEBT_CREATED,
      DomainEventTypes.DEBT_PAID,
      DomainEventTypes.FINANCE_DAILY_SNAPSHOT,
      DomainEventTypes.STAFF_PURCHASE_CREATED,
    ].includes(eventType as any);
  }

  async handle(event: DomainEvent): Promise<void> {
    this.logger.debug(`OwnerCopilotSubscriber handling ${event.eventType}`);
  }

  @OnEvent(DomainEventTypes.ORDER_CANCELLED)
  async onOrderCancelled(event: DomainEvent<any>): Promise<void> {
    const { cafeId, orderId, total } = event.payload;
    this.logger.log(`Copilot: order ${orderId} cancelled — ${total} EGP lost`);
  }

  @OnEvent(DomainEventTypes.INVENTORY_LOW_STOCK)
  async onLowStock(event: DomainEvent<any>): Promise<void> {
    const { cafeId, itemName, currentQty } = event.payload;
    this.logger.log(`Copilot: low stock alert for ${itemName} (${currentQty} remaining)`);
  }

  @OnEvent(DomainEventTypes.DEBT_CREATED)
  async onDebtCreated(event: DomainEvent<any>): Promise<void> {
    const { cafeId, customerName, amount } = event.payload;
    this.logger.log(`Copilot: new debt ${amount} EGP for ${customerName}`);
  }

  @OnEvent(DomainEventTypes.DEBT_PAID)
  async onDebtPaid(event: DomainEvent<any>): Promise<void> {
    const { cafeId, customerName, amount } = event.payload;
    this.logger.log(`Copilot: debt paid ${amount} EGP by ${customerName}`);
  }

  @OnEvent(DomainEventTypes.FINANCE_DAILY_SNAPSHOT)
  async onDailySnapshot(event: DomainEvent<any>): Promise<void> {
    const { cafeId, totalRevenue, profit, ordersCount } = event.payload;
    this.logger.log(`Copilot: daily summary — ${totalRevenue} EGP revenue, ${profit} EGP profit, ${ordersCount} orders`);
  }
}

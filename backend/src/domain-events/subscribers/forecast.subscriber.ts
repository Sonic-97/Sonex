import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEventTypes } from '../domain-event.registry';
import { DomainEvent, DomainEventHandler } from '../domain-event.interface';

@Injectable()
export class ForecastSubscriber implements DomainEventHandler {
  private readonly logger = new Logger(ForecastSubscriber.name);

  constructor() {}

  supports(eventType: string): boolean {
    return [
      DomainEventTypes.ORDER_CREATED,
      DomainEventTypes.ORDER_DELIVERED,
      DomainEventTypes.ORDER_PAID,
      DomainEventTypes.INVENTORY_CONSUMED,
      DomainEventTypes.INVENTORY_REFILLED,
      DomainEventTypes.INVENTORY_LOW_STOCK,
      DomainEventTypes.FINANCE_DAILY_SNAPSHOT,
    ].includes(eventType as any);
  }

  async handle(event: DomainEvent): Promise<void> {
    this.logger.debug(`ForecastSubscriber handling ${event.eventType}`);
  }

  @OnEvent(DomainEventTypes.ORDER_PAID)
  async onOrderPaid(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`Forecast: recording sale ${event.payload.amount} EGP for trend analysis`);
  }

  @OnEvent(DomainEventTypes.INVENTORY_CONSUMED)
  async onInventoryConsumed(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`Forecast: recording inventory consumption ${event.payload.totalCost} EGP`);
  }

  @OnEvent(DomainEventTypes.FINANCE_DAILY_SNAPSHOT)
  async onDailySnapshot(event: DomainEvent<any>): Promise<void> {
    const { cafeId, totalRevenue, ordersCount, date } = event.payload;
    this.logger.log(`Forecast: daily snapshot for ${date} — revenue: ${totalRevenue}, orders: ${ordersCount}`);
  }
}

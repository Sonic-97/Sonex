import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEventTypes } from '../domain-event.registry';
import { DomainEvent, DomainEventHandler } from '../domain-event.interface';
import { AnalyticsEngineService } from '../../analytics-engine/analytics-engine.service';

@Injectable()
export class AnalyticsSubscriber implements DomainEventHandler {
  private readonly logger = new Logger(AnalyticsSubscriber.name);

  constructor(
    private readonly analyticsEngine: AnalyticsEngineService,
  ) {}

  supports(eventType: string): boolean {
    return [
      DomainEventTypes.ORDER_CREATED,
      DomainEventTypes.ORDER_CONFIRMED,
      DomainEventTypes.ORDER_CANCELLED,
      DomainEventTypes.ORDER_DELIVERED,
      DomainEventTypes.ORDER_PAID,
      DomainEventTypes.ORDER_REFUNDED,
      DomainEventTypes.INVENTORY_CONSUMED,
      DomainEventTypes.INVENTORY_LOW_STOCK,
      DomainEventTypes.PAYMENT_COMPLETED,
      DomainEventTypes.DEBT_CREATED,
      DomainEventTypes.DEBT_PAID,
      DomainEventTypes.FINANCE_REVENUE_UPDATED,
      DomainEventTypes.FINANCE_DAILY_SNAPSHOT,
      DomainEventTypes.CUSTOMER_CREATED,
      DomainEventTypes.EMPLOYEE_CREATED,
    ].includes(eventType as any);
  }

  async handle(event: DomainEvent): Promise<void> {
    this.logger.debug(`AnalyticsSubscriber handling ${event.eventType}`);
  }

  @OnEvent(DomainEventTypes.ORDER_CREATED)
  async onOrderCreated(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`Analytics: order ${event.payload.orderId} created`);
  }

  @OnEvent(DomainEventTypes.ORDER_PAID)
  async onOrderPaid(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`Analytics: order ${event.payload.orderId} paid — ${event.payload.amount} EGP`);
  }

  @OnEvent(DomainEventTypes.ORDER_CANCELLED)
  async onOrderCancelled(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`Analytics: order ${event.payload.orderId} cancelled`);
  }

  @OnEvent(DomainEventTypes.ORDER_DELIVERED)
  async onOrderDelivered(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`Analytics: order ${event.payload.orderId} delivered — updating sales KPIs`);
  }

  @OnEvent(DomainEventTypes.INVENTORY_CONSUMED)
  async onInventoryConsumed(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`Analytics: inventory consumed for order ${event.payload.orderId} — cost: ${event.payload.totalCost}`);
  }

  @OnEvent(DomainEventTypes.DEBT_CREATED)
  async onDebtCreated(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`Analytics: debt created for ${event.payload.customerName} — ${event.payload.amount} EGP`);
  }

  @OnEvent(DomainEventTypes.DEBT_PAID)
  async onDebtPaid(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`Analytics: debt paid by ${event.payload.customerName} — ${event.payload.amount} EGP`);
  }

  @OnEvent(DomainEventTypes.FINANCE_DAILY_SNAPSHOT)
  async onDailySnapshot(event: DomainEvent<any>): Promise<void> {
    this.logger.log(`Analytics: daily snapshot — revenue: ${event.payload.totalRevenue}, orders: ${event.payload.ordersCount}`);
  }
}

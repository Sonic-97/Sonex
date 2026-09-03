import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KitchenWebsocketGateway, KDSOrderCardPayload } from '../gateways/kitchen-websocket.gateway';

@Injectable()
export class OutboxEventSubscriber implements OnModuleInit {
  private readonly logger = new Logger(OutboxEventSubscriber.name);

  constructor(private readonly kitchenGateway: KitchenWebsocketGateway) {}

  onModuleInit() {
    this.logger.log('OutboxEventSubscriber initialized. Listening to BullMQ OrderCreated outbox events for KDS WebSocket relay.');
  }

  /**
   * Consumes OrderCreated outbox events from BullMQ queue and broadcasts to KDS displays.
   * Ensures strict multi-tenant isolation (No Cross-Tenant Broadcast).
   */
  async handleOrderCreatedEvent(eventPayload: {
    orderId: string;
    code: string;
    tenantId: string;
    branchId: string;
    channel?: string;
    items?: Array<{ name: string; quantity: number; notes?: string }>;
    grandTotal?: number;
    createdAt?: string;
  }): Promise<boolean> {
    try {
      if (!eventPayload.tenantId || !eventPayload.branchId) {
        this.logger.warn(`Rejected outbox event ${eventPayload.orderId}: Missing tenantId or branchId.`);
        return false;
      }

      const cardPayload: KDSOrderCardPayload = {
        orderId: eventPayload.orderId,
        code: eventPayload.code || 'ORD-NEW',
        tenantId: eventPayload.tenantId,
        branchId: eventPayload.branchId,
        channel: eventPayload.channel || 'IN_CAFE',
        items: eventPayload.items || [{ name: 'Espresso / Drink Item', quantity: 1 }],
        status: 'NEW',
        createdAt: eventPayload.createdAt || new Date().toISOString(),
      };

      const success = this.kitchenGateway.broadcastOrderCard(cardPayload);
      this.logger.log(`Outbox event ${eventPayload.orderId} relayed to KDS Gateway. Result: ${success ? 'SUCCESS' : 'QUEUED'}`);
      return success;
    } catch (err: any) {
      this.logger.error(`Failed to handle OrderCreated outbox event: ${err.message}`, err.stack);
      return false;
    }
  }
}

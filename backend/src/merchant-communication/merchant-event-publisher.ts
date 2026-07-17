import { Injectable, Logger } from '@nestjs/common';
import { MerchantCommunicationEvent } from './merchant-communication.types';

@Injectable()
export class MerchantEventPublisher {
  private readonly logger = new Logger(MerchantEventPublisher.name);
  private readonly listeners: Array<(event: MerchantCommunicationEvent) => void> = [];

  onEvent(listener: (event: MerchantCommunicationEvent) => void): void {
    this.listeners.push(listener);
  }

  publish(
    type: string,
    merchantId: string,
    merchantOrderId: string,
    customerOrderId: string,
    payload?: Record<string, unknown>,
  ): void {
    const event: MerchantCommunicationEvent = {
      type,
      merchantId,
      merchantOrderId,
      customerOrderId,
      payload,
      timestamp: new Date().toISOString(),
    };
    for (const listener of this.listeners) {
      try { listener(event); } catch (e) { this.logger.error('Event listener error', e); }
    }
  }
}

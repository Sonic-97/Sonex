import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventsService, AppEvent } from './events.service';

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);

  constructor(private readonly eventsService: EventsService) {}

  @OnEvent('order.created')
  handleNewOrder(event: AppEvent) {
    this.eventsService.emit('audio.alert', {
      target: 'barista',
      sound: 'new_order.mp3',
      orderId: event.payload.orderId as string,
      orderCode: event.payload.code as string,
    });
    this.logger.debug(`Audio alert: new_order.mp3 -> barista`);
  }

  @OnEvent('order.updated')
  handleOrderUpdated(event: AppEvent) {
    const status = event.payload.status as string;
    if (status === 'READY') {
      this.eventsService.emit('audio.alert', {
        target: 'driver',
        sound: 'order_ready.mp3',
        orderId: event.payload.orderId as string,
      });
      this.logger.debug(`Audio alert: order_ready.mp3 -> driver`);
    }
  }
}





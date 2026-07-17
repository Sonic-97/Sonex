import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { LidMappingService } from '../../lid-mapping/lid-mapping.service';
import { AppEvent } from '../../events/events.service';
import { EventBusService } from '../../events/event-bus.service';

@Injectable()
export class LidMappingPersisterConsumer {
  private readonly logger = new Logger(LidMappingPersisterConsumer.name);

  constructor(
    private readonly lidMappingService: LidMappingService,
    private readonly eventBus: EventBusService,
  ) {}

  @OnEvent('lid-mapping.upserted')
  async handle(payload: AppEvent): Promise<void> {
    const p = payload.payload as any;
    const lid = p.lid as string;
    const phone = p.phone as string;
    const cafeId = p.cafeId as string;

    this.logger.log(`Persisting LidMapping: ${lid} -> ${phone}`);

    try {
      await this.lidMappingService.upsert({
        lid,
        phone,
        source: p.source || 'message_incoming',
        cafeId,
      });
    } catch (err) {
      this.logger.error(`Failed to upsert LidMapping ${lid}: ${(err as Error).message}`);
    }
  }
}

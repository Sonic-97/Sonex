import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CommunicationService } from '../../communication/communication.service';
import { AppEvent } from '../../events/events.service';
import { EventBusService } from '../../events/event-bus.service';

@Injectable()
export class SenderResolverConsumer {
  private readonly logger = new Logger(SenderResolverConsumer.name);

  constructor(
    private readonly communicationService: CommunicationService,
    private readonly eventBus: EventBusService,
  ) {}

  @OnEvent('message.received')
  async handle(payload: AppEvent): Promise<void> {
    const body = payload.payload as any;
    const cafeId = (payload.cafeId || body.cafeId) as string;
    const traceId = `RESOLVE-${Date.now()}`;

    this.logger.log(`[${traceId}] Resolving sender from message.received`);

    try {
      const resolved = await this.communicationService.resolveSender(body, cafeId);
      this.logger.log(`[${traceId}] Resolved phone="${resolved.phone}" path="${resolved.resolvedPath}"`);

      const messageBody = body?.message || body?.data?.body || body?.payload?.body || body?.text || '';

      await this.eventBus.publish('sender.resolved', {
        remoteJid: resolved.senderJid,
        phone: resolved.phone,
        phoneJid: resolved.senderJid,
        resolutionPath: resolved.resolvedPath as any,
        cafeId: cafeId || '',
        messageBody,
        messageId: body?.messageId || body?.data?.id || body?.payload?.id || '',
      }, cafeId);
    } catch (err) {
      this.logger.error(`[${traceId}] Sender resolution failed: ${(err as Error).message}`);
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { AppEvent } from '../../events/events.service';
import { EventBusService } from '../../events/event-bus.service';

@Injectable()
export class DeduplicationConsumer {
  private readonly logger = new Logger(DeduplicationConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  @OnEvent('message.received')
  async handle(payload: AppEvent): Promise<void> {
    const body = payload.payload as any;
    const traceId = `DEDUP-${Date.now()}`;
    const messageId = body.messageId || body?.data?.id || '';

    if (!messageId) {
      this.logger.log(`[${traceId}] No messageId, skipping dedup`);
      return;
    }

    this.logger.log(`[${traceId}] Checking duplicate for messageId=${messageId}`);

    try {
      const existing = await this.prisma.whatsAppLog.findUnique({
        where: { messageId },
      });
      if (existing) {
        this.logger.log(`[${traceId}] Duplicate messageId ${messageId} detected, skipping`);
        return;
      }
    } catch (err) {
      this.logger.error(`[${traceId}] Dedup check failed: ${(err as Error).message}`);
    }
  }
}

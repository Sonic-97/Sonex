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
    const remoteJid = body.remoteJid || body?.data?.from || body?.payload?.from || '';

    if (!messageId) {
      this.logger.log(`[${traceId}] No messageId, skipping dedup`);
      return;
    }

    const isTelegram = /^\d+$/.test(remoteJid) && !remoteJid.includes('@');

    this.logger.log(`[${traceId}] Checking duplicate for messageId=${messageId} isTelegram=${isTelegram}`);

    try {
      if (isTelegram) {
        const existing = await this.prisma.telegramMessageLog.findUnique({
          where: { cafeId_messageId: { cafeId: payload.cafeId || '', messageId: parseInt(messageId) } },
        });
        if (existing) {
          this.logger.log(`[${traceId}] Duplicate Telegram messageId ${messageId} detected, skipping`);
          return;
        }
      } else {
        const existing = await this.prisma.whatsAppLog.findUnique({
          where: { messageId },
        });
        if (existing) {
          this.logger.log(`[${traceId}] Duplicate messageId ${messageId} detected, skipping`);
          return;
        }
      }
    } catch (err) {
      this.logger.error(`[${traceId}] Dedup check failed: ${(err as Error).message}`);
    }
  }
}

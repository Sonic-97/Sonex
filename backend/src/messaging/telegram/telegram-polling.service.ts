import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramClientManager } from './telegram-client-manager';
import { TelegramProvider } from './telegram.provider';
import { TelegramUpdateMapper } from './telegram-update.mapper';
import { TelegramCallbackService } from './telegram-callback.service';
import { MessagingService } from '../messaging.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TelegramPollingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramPollingService.name);
  private polling = false;
  private offsets = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly telegramService: TelegramService,
    private readonly clientManager: TelegramClientManager,
    private readonly telegramProvider: TelegramProvider,
    private readonly updateMapper: TelegramUpdateMapper,
    private readonly callbackService: TelegramCallbackService,
    private readonly messagingService: MessagingService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.messagingService.registerProvider(this.telegramProvider);
    this.logger.log('Starting Telegram polling for all enabled cafes...');
    this.poll().catch(err => this.logger.error(`Polling fatal: ${err.message}`));
  }

  onModuleDestroy() {
    this.polling = false;
    if (this.timer) clearTimeout(this.timer);
    this.logger.log('Telegram polling stopped');
  }

  private async poll() {
    if (this.polling) return;
    this.polling = true;

    while (this.polling) {
      try {
        const cafeIds = this.clientManager.getAllCafeIds();
        for (const cafeId of cafeIds) {
          await this.pollCafe(cafeId);
        }
      } catch (err) {
        this.logger.error(`Polling error: ${(err as Error).message}`);
        await this.sleep(5000);
      }

      await this.sleep(1000);
    }
  }

  private async pollCafe(cafeId: string) {
    try {
      const offset = this.offsets.get(cafeId) || 0;
      const updates = await this.telegramService.getUpdates(cafeId, offset);

      for (const update of updates) {
        this.offsets.set(cafeId, update.update_id + 1);
        await this.processUpdate(cafeId, update);
      }
    } catch (err) {
      this.logger.error(`Polling error for cafe ${cafeId}: ${(err as Error).message}`);
    }
  }

  private async processUpdate(cafeId: string, update: any) {
    try {
      this.telegramProvider.setCafeId(cafeId);

      if (update.callback_query) {
        const chatId = update.callback_query.message?.chat?.id || 0;

        await this.callbackService.handleCallback({
          chatId,
          userId: update.callback_query.from.id,
          data: update.callback_query.data || '',
          callbackQueryId: update.callback_query.id,
          cafeId,
          messageId: update.callback_query.message?.message_id || 0,
        });
        return;
      }

      if (update.message) {
        const chatId = update.message.chat?.id || 0;
        const incoming = this.updateMapper.toIncomingMessage(update, cafeId);
        await this.messagingService.handleIncoming(incoming);
        this.logger.log(`Processed message from chatId=${chatId} cafeId=${cafeId}`);
      }
    } catch (err) {
      this.logger.error(`Failed to process update ${update.update_id} for cafe ${cafeId}: ${(err as Error).message}`);
    }
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

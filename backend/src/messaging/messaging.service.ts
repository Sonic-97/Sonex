import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { MessagingProvider, SendResult, SendMessageOptions } from './interfaces/messaging-provider.interface';
import { IncomingMessage } from './interfaces/incoming-message.interface';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private providers = new Map<string, MessagingProvider>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  registerProvider(provider: MessagingProvider): void {
    this.providers.set(provider.channel, provider);
    this.logger.log(`Registered messaging provider: ${provider.channel}`);
  }

  getProvider(channel: string): MessagingProvider | undefined {
    return this.providers.get(channel);
  }

  async handleIncoming(message: IncomingMessage): Promise<void> {
    const traceId = `TRACE-HI-${Date.now()}`;
    console.log(`[${traceId}] handleIncoming START: msgId=${message.messageId} chatId=${message.chatId} cafeId=${message.cafeId} text="${(message.text || '').substring(0, 50)}"`);
    this.logger.log(`[${traceId}] handleIncoming START: msgId=${message.messageId} chatId=${message.chatId} cafeId=${message.cafeId} text="${(message.text || '').substring(0, 50)}"`);

    // 1. Always save TelegramChat first (parent must exist before TelegramMessageLog)
    await this.prisma.telegramChat.upsert({
      where: { cafeId_chatId: { cafeId: message.cafeId, chatId: BigInt(message.chatId) } },
      create: {
        cafeId: message.cafeId,
        chatId: BigInt(message.chatId),
        chatType: 'private',
        customerId: null,
        languageCode: message.languageCode || 'ar',
      },
      update: { lastMessageAt: new Date(), active: true },
    }).catch(err => {
      this.logger.warn(`[${traceId}] Failed to upsert TelegramChat: ${err.message}`);
    });
    this.logger.log(`[${traceId}] TelegramChat UPSERT SUCCESS: cafeId=${message.cafeId} chatId=${message.chatId}`);

    let msgId: number | null = null;
    const parsed = parseInt(message.messageId);
    if (!isNaN(parsed)) msgId = parsed;

    // 2. Dedup check + create TelegramMessageLog (parent TelegramChat now exists)
    if (msgId !== null) {
      const existing = await this.prisma.telegramMessageLog.findUnique({
        where: { cafeId_messageId: { cafeId: message.cafeId, messageId: msgId } },
      }).catch(() => null);

      if (existing) {
        this.logger.log(`[${traceId}] DUPLICATE DETECTED (pre-existing log), skipping`);
        return;
      }

      await this.prisma.telegramMessageLog.create({
        data: {
          cafeId: message.cafeId,
          chatId: BigInt(message.chatId),
          messageId: msgId,
          direction: 'INCOMING',
          text: message.text || null,
          callbackData: message.callbackData || null,
          updateType: message.callbackData ? 'callback_query' : 'message',
        },
      }).catch(err => {
        this.logger.warn(`[${traceId}] Failed to log Telegram message: ${err.message}`);
      });
      this.logger.log(`[${traceId}] TelegramMessageLog CREATE SUCCESS: cafeId=${message.cafeId} messageId=${msgId}`);
    }

    // 3. Resolve customer (may be null for new users)
    const customerId = await this.resolveCustomerId(message).catch(err => {
      this.logger.warn(`[${traceId}] resolveCustomerId error: ${(err as Error).message}`);
      return null;
    });

    // 4. Update TelegramChat with customerId if resolved
    if (customerId) {
      await this.prisma.telegramChat.update({
        where: { cafeId_chatId: { cafeId: message.cafeId, chatId: BigInt(message.chatId) } },
        data: { customerId },
      }).catch(err => {
        this.logger.warn(`[${traceId}] Failed to update TelegramChat customerId: ${err.message}`);
      });
    }

    this.logger.log(`[${traceId}] Publishing message.received event...`);

    await this.eventBus.publish('message.received', {
      messageId: message.messageId,
      remoteJid: message.chatId,
      message: message.text || '',
      participant: '',
      fromMe: false,
      timestamp: message.timestamp,
    }, message.cafeId);

    this.logger.log(`[${traceId}] message.received published`);
  }

  async sendReply(
    chatId: string,
    text: string,
    cafeId: string,
    options?: {
      channel?: string;
      replyToMessageId?: string;
      replyMarkup?: any;
      parseMode?: 'HTML' | 'MarkdownV2';
    },
  ): Promise<SendResult> {
    const channel = options?.channel || 'telegram';
    const provider = this.providers.get(channel);
    if (!provider) {
      this.logger.error(`No provider for channel: ${channel}`);
      return { messageId: '', success: false };
    }

    const result = await provider.sendMessage(chatId, text, {
      replyToMessageId: options?.replyToMessageId,
      replyMarkup: options?.replyMarkup,
      parseMode: options?.parseMode || 'HTML',
    });

    if (result.success) {
      const msgId = parseInt(result.messageId);
      if (!isNaN(msgId)) {
        await this.prisma.telegramMessageLog.create({
          data: {
            cafeId,
            chatId: BigInt(chatId),
            messageId: msgId,
            direction: 'OUTGOING',
            text,
          },
        }).catch(err => {
          this.logger.warn(`Failed to log outgoing message: ${err.message}`);
        });
      }
    }

    return result;
  }

  async editReply(
    chatId: string,
    messageId: string,
    text: string,
    cafeId: string,
    options?: {
      channel?: string;
      replyMarkup?: any;
      parseMode?: 'HTML' | 'MarkdownV2';
    },
  ): Promise<{ success: boolean }> {
    const channel = options?.channel || 'telegram';
    const provider = this.providers.get(channel);
    if (!provider) {
      this.logger.error(`No provider for channel: ${channel}`);
      return { success: false };
    }

    return provider.editMessage(chatId, messageId, text, {
      replyMarkup: options?.replyMarkup,
      parseMode: options?.parseMode || 'HTML',
    });
  }

  private async resolveCustomerId(message: IncomingMessage): Promise<string | null> {
    try {
      if (message.channel !== 'telegram') return null;

      const telegramId = BigInt(message.userId);

      const existing = await this.prisma.customer.findFirst({
        where: {
          cafeId: message.cafeId,
          telegramId: telegramId,
        },
        select: { id: true },
      });

      return existing?.id || null;
    } catch (err) {
      this.logger.warn(`[TRACE_TELEGRAM_CUSTOMER_RESOLUTION] resolveCustomerId error: telegramId=${message.userId} cafeId=${message.cafeId} error=${(err as Error).message}`);
      return null;
    }
  }
}

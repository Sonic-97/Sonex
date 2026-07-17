import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';

interface TelegramClient {
  baseUrl: string;
  secretToken: string;
  botUsername: string;
}

@Injectable()
export class TelegramClientManager implements OnModuleInit {
  private readonly logger = new Logger(TelegramClientManager.name);
  private clients = new Map<string, TelegramClient>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const cafes = await this.prisma.cafe.findMany({
      where: { telegramEnabled: true, telegramBotToken: { not: null } },
      select: { id: true, telegramBotToken: true, telegramWebhookToken: true, telegramBotUsername: true },
    });
    for (const cafe of cafes) {
      this.clients.set(cafe.id, {
        baseUrl: `https://api.telegram.org/bot${cafe.telegramBotToken}`,
        secretToken: cafe.telegramWebhookToken || '',
        botUsername: cafe.telegramBotUsername || '',
      });
      this.logger.log(`Registered Telegram client for cafe ${cafe.id} (@${cafe.telegramBotUsername || 'unknown'})`);
    }
    this.logger.log(`TelegramClientManager initialized with ${this.clients.size} cafe(s)`);
  }

  getClient(cafeId: string): TelegramClient | undefined {
    return this.clients.get(cafeId);
  }

  hasClient(cafeId: string): boolean {
    return this.clients.has(cafeId);
  }

  getAllCafeIds(): string[] {
    return Array.from(this.clients.keys());
  }

  async registerCafe(cafeId: string, botToken: string, botUsername: string, webhookToken: string) {
    this.clients.set(cafeId, {
      baseUrl: `https://api.telegram.org/bot${botToken}`,
      secretToken: webhookToken,
      botUsername,
    });
    this.logger.log(`Registered Telegram client for cafe ${cafeId} (@${botUsername})`);
  }

  removeCafe(cafeId: string) {
    this.clients.delete(cafeId);
    this.logger.log(`Removed Telegram client for cafe ${cafeId}`);
  }

  async sendMessage(cafeId: string, chatId: string, text: string, options?: {
    replyToMessageId?: string;
    replyMarkup?: any;
    parseMode?: string;
    disablePreview?: boolean;
  }): Promise<{ messageId: string; success: boolean }> {
    const client = this.clients.get(cafeId);
    if (!client) {
      this.logger.error(`No Telegram client for cafe ${cafeId}`);
      return { messageId: '', success: false };
    }
    try {
      const payload: any = {
        chat_id: chatId,
        text,
        parse_mode: options?.parseMode || 'HTML',
        disable_web_page_preview: options?.disablePreview,
      };
      if (options?.replyToMessageId) payload.reply_to_message_id = parseInt(options.replyToMessageId);
      if (options?.replyMarkup) payload.reply_markup = options.replyMarkup;
      const response = await axios.post(`${client.baseUrl}/sendMessage`, payload, { timeout: 10000 });
      return { messageId: response.data.result.message_id.toString(), success: true };
    } catch (error: any) {
      const errMsg = error.response?.data?.description || error.message;
      this.logger.error(`Failed to send message to ${chatId} (cafe ${cafeId}): ${errMsg}`);
      if (error.response?.data?.error_code === 429) {
        const retryAfter = error.response?.data?.parameters?.retry_after || 5;
        await this.sleep(retryAfter * 1000);
        return this.sendMessage(cafeId, chatId, text, options);
      }
      return { messageId: '', success: false };
    }
  }

  async editMessage(cafeId: string, chatId: string, messageId: string, text: string, options?: {
    replyMarkup?: any;
    parseMode?: string;
  }): Promise<{ success: boolean }> {
    const client = this.clients.get(cafeId);
    if (!client) return { success: false };
    try {
      const payload: any = { chat_id: chatId, message_id: parseInt(messageId), text, parse_mode: options?.parseMode || 'HTML' };
      if (options?.replyMarkup) payload.reply_markup = options.replyMarkup;
      await axios.post(`${client.baseUrl}/editMessageText`, payload, { timeout: 10000 });
      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to edit message ${messageId}: ${error.response?.data?.description || error.message}`);
      return { success: false };
    }
  }

  async sendPhoto(cafeId: string, chatId: string, photo: string | Buffer, caption?: string, options?: {
    replyMarkup?: any;
    parseMode?: string;
  }): Promise<{ messageId: string; success: boolean }> {
    const client = this.clients.get(cafeId);
    if (!client) return { messageId: '', success: false };
    try {
      const response = await axios.post(`${client.baseUrl}/sendPhoto`, {
        chat_id: chatId, photo, caption, parse_mode: options?.parseMode || 'HTML',
        reply_markup: options?.replyMarkup,
      }, { timeout: 30000 });
      return { messageId: response.data.result.message_id.toString(), success: true };
    } catch (error: any) {
      this.logger.error(`Failed to send photo to ${chatId}: ${error.message}`);
      return { messageId: '', success: false };
    }
  }

  async answerCallbackQuery(cafeId: string, callbackQueryId: string, text?: string, showAlert?: boolean): Promise<void> {
    const client = this.clients.get(cafeId);
    if (!client) return;
    try {
      await axios.post(`${client.baseUrl}/answerCallbackQuery`, { callback_query_id: callbackQueryId, text, show_alert: showAlert }, { timeout: 5000 });
    } catch (error: any) {
      this.logger.warn(`Failed to answer callback query: ${error.message}`);
    }
  }

  async getMe(cafeId: string): Promise<any> {
    const client = this.clients.get(cafeId);
    if (!client) throw new Error(`No client for cafe ${cafeId}`);
    const response = await axios.get(`${client.baseUrl}/getMe`, { timeout: 5000 });
    return response.data.result;
  }

  async setWebhook(cafeId: string, url: string): Promise<void> {
    const client = this.clients.get(cafeId);
    if (!client) throw new Error(`No client for cafe ${cafeId}`);
    await axios.post(`${client.baseUrl}/setWebhook`, {
      url, secret_token: client.secretToken,
      allowed_updates: ['message', 'callback_query'],
    }, { timeout: 10000 });
    this.logger.log(`Webhook set for cafe ${cafeId}: ${url}`);
  }

  async getUpdates(cafeId: string, offset?: number): Promise<any[]> {
    const client = this.clients.get(cafeId);
    if (!client) return [];
    const response = await axios.get(`${client.baseUrl}/getUpdates`, { params: { offset, timeout: 0 }, timeout: 5000 });
    return response.data.result || [];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

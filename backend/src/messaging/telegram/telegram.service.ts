import { Injectable, Logger } from '@nestjs/common';
import { TelegramClientManager } from './telegram-client-manager';
import {
  SendMessageOptions,
  EditMessageOptions,
  SendPhotoOptions,
  SendInvoice,
  SendResult,
  ReplyKeyboardMarkup,
} from '../interfaces/messaging-provider.interface';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly clientManager: TelegramClientManager) {}

  async sendMessage(chatId: string, text: string, cafeId: string, options?: SendMessageOptions): Promise<SendResult> {
    return this.clientManager.sendMessage(cafeId, chatId, text, {
      replyToMessageId: options?.replyToMessageId,
      replyMarkup: options?.replyMarkup,
      parseMode: options?.parseMode,
      disablePreview: options?.disablePreview,
    });
  }

  async editMessage(chatId: string, messageId: string, text: string, cafeId: string, options?: EditMessageOptions): Promise<{ success: boolean }> {
    return this.clientManager.editMessage(cafeId, chatId, messageId, text, {
      replyMarkup: options?.replyMarkup,
      parseMode: options?.parseMode,
    });
  }

  async sendPhoto(chatId: string, photo: string | Buffer, caption: string | undefined, cafeId: string, options?: SendPhotoOptions): Promise<SendResult> {
    return this.clientManager.sendPhoto(cafeId, chatId, photo, caption, {
      replyMarkup: options?.replyMarkup,
      parseMode: options?.parseMode,
    });
  }

  async sendInvoice(chatId: string, invoice: SendInvoice, cafeId: string): Promise<SendResult> {
    return { messageId: '', success: false };
  }

  async answerCallbackQuery(cafeId: string, callbackQueryId: string, text?: string, showAlert?: boolean): Promise<void> {
    return this.clientManager.answerCallbackQuery(cafeId, callbackQueryId, text, showAlert);
  }

  async requestContact(chatId: string, text: string, cafeId: string): Promise<SendResult> {
    return this.sendMessage(chatId, text, cafeId, {
      replyMarkup: {
        keyboard: [[{ text: '📱 إرسال رقمي', request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard: true,
      } as ReplyKeyboardMarkup,
    });
  }

  async getMe(cafeId: string): Promise<any> {
    return this.clientManager.getMe(cafeId);
  }

  async setWebhook(cafeId: string, url: string): Promise<void> {
    return this.clientManager.setWebhook(cafeId, url);
  }

  async getUpdates(cafeId: string, offset?: number): Promise<any[]> {
    return this.clientManager.getUpdates(cafeId, offset);
  }

  getClientManager(): TelegramClientManager {
    return this.clientManager;
  }
}

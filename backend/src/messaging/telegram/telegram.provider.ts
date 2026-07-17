import { Injectable, Logger } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import {
  MessagingProvider,
  SendMessageOptions,
  EditMessageOptions,
  SendPhotoOptions,
  SendInvoice,
  SendResult,
} from '../interfaces/messaging-provider.interface';

@Injectable()
export class TelegramProvider implements MessagingProvider {
  readonly channel = 'telegram' as const;
  private readonly logger = new Logger(TelegramProvider.name);
  private currentCafeId: string = '';

  constructor(private readonly telegramService: TelegramService) {}

  setCafeId(cafeId: string) {
    this.currentCafeId = cafeId;
  }

  async sendMessage(chatId: string, text: string, options?: SendMessageOptions): Promise<SendResult> {
    return this.telegramService.sendMessage(chatId, text, this.currentCafeId, options);
  }

  async editMessage(chatId: string, messageId: string, text: string, options?: EditMessageOptions): Promise<{ success: boolean }> {
    return this.telegramService.editMessage(chatId, messageId, text, this.currentCafeId, options);
  }

  async sendPhoto(chatId: string, photo: string | Buffer, caption?: string, options?: SendPhotoOptions): Promise<SendResult> {
    return this.telegramService.sendPhoto(chatId, photo, caption, this.currentCafeId, options);
  }

  async sendInvoice(chatId: string, invoice: SendInvoice): Promise<SendResult> {
    return this.telegramService.sendInvoice(chatId, invoice, this.currentCafeId);
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert?: boolean): Promise<void> {
    return this.telegramService.answerCallbackQuery(this.currentCafeId, callbackQueryId, text, showAlert);
  }

  async requestContact(chatId: string, text: string): Promise<SendResult> {
    return this.telegramService.requestContact(chatId, text, this.currentCafeId);
  }

  async healthCheck(): Promise<boolean> {
    if (!this.currentCafeId) return false;
    try {
      await this.telegramService.getMe(this.currentCafeId);
      return true;
    } catch {
      return false;
    }
  }
}

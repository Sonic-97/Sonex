import { Injectable } from '@nestjs/common';
import { IncomingMessage } from '../interfaces/incoming-message.interface';
import { TelegramUpdate } from './dto/telegram-webhook.dto';

@Injectable()
export class TelegramUpdateMapper {
  toIncomingMessage(update: TelegramUpdate, cafeId: string): IncomingMessage {
    if (update.callback_query) {
      return this.mapCallbackQuery(update, cafeId);
    }

    if (update.message) {
      return this.mapMessage(update, cafeId);
    }

    throw new Error('Unknown update type');
  }

  private mapMessage(update: TelegramUpdate, cafeId: string): IncomingMessage {
    const msg = update.message!;
    const from = msg.from;

    return {
      channel: 'telegram',
      chatId: msg.chat.id.toString(),
      userId: from?.id?.toString() || '',
      displayName: this.buildDisplayName(from?.first_name, from?.last_name, from?.username),
      text: msg.text,
      photo: msg.photo ? {
        fileId: msg.photo[msg.photo.length - 1].file_id,
        caption: undefined,
      } : undefined,
      voice: msg.voice ? {
        fileId: msg.voice.file_id,
        duration: msg.voice.duration,
      } : undefined,
      contact: msg.contact ? {
        phone: msg.contact.phone_number,
        firstName: msg.contact.first_name,
      } : undefined,
      messageId: msg.message_id.toString(),
      replyToMessageId: msg.reply_to_message?.message_id?.toString(),
      cafeId,
      timestamp: msg.date,
      languageCode: from?.language_code,
    };
  }

  private mapCallbackQuery(update: TelegramUpdate, cafeId: string): IncomingMessage {
    const cb = update.callback_query!;
    const from = cb.from;
    const msg = cb.message;

    return {
      channel: 'telegram',
      chatId: msg?.chat?.id?.toString() || '',
      userId: from.id.toString(),
      displayName: this.buildDisplayName(from.first_name, from.last_name, from.username),
      callbackData: cb.data,
      callbackQueryId: cb.id,
      messageId: msg?.message_id?.toString() || cb.id,
      cafeId,
      timestamp: Math.floor(Date.now() / 1000),
      languageCode: from.language_code,
    };
  }

  private buildDisplayName(firstName?: string, lastName?: string, username?: string): string {
    const parts = [firstName, lastName].filter(Boolean).join(' ');
    if (parts) return parts;
    if (username) return `@${username}`;
    return 'Unknown';
  }
}

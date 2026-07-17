import { Injectable } from '@nestjs/common';
import { NormalizedTelegramMessage, TelegramMessageType } from './telegram-adapter.types';

export interface RawTelegramUpdate {
  update_id?: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string };
    chat: { id: number; type?: string };
    text?: string;
    entities?: Array<{ type: string; offset: number; length: number }>;
    contact?: { phone_number: string; first_name?: string };
    location?: { latitude: number; longitude: number };
    photo?: Array<{ file_id: string; file_size?: number }>;
    voice?: { file_id: string; duration: number };
    date: number;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string };
    message?: { message_id: number; chat: { id: number } };
    data: string;
  };
}

@Injectable()
export class TelegramMessageNormalizer {
  normalize(update: RawTelegramUpdate, cafeId: string): NormalizedTelegramMessage {
    if (update.callback_query) {
      return this.normalizeCallback(update.callback_query, cafeId);
    }
    if (update.message) {
      return this.normalizeMessage(update.message, cafeId);
    }
    throw new Error('Unsupported update type');
  }

  private normalizeMessage(msg: RawTelegramUpdate['message'], cafeId: string): NormalizedTelegramMessage {
    const result: NormalizedTelegramMessage = {
      type: this.detectMessageType(msg!),
      chatId: msg!.chat.id.toString(),
      userId: (msg!.from?.id ?? 0).toString(),
      text: msg!.text || '',
      messageId: (msg!.message_id ?? 0).toString(),
      cafeId,
      timestamp: msg!.date ?? Math.floor(Date.now() / 1000),
    };

    if (msg!.contact) {
      result.contact = { phone: msg!.contact.phone_number, firstName: msg!.contact.first_name };
      result.text = result.contact.phone;
    }
    if (msg!.location) {
      result.location = { latitude: msg!.location.latitude, longitude: msg!.location.longitude };
    }
    if (msg!.photo && msg!.photo.length > 0) {
      result.photo = { fileId: msg!.photo[msg!.photo.length - 1].file_id };
    }
    return result;
  }

  private normalizeCallback(cb: NonNullable<RawTelegramUpdate['callback_query']>, cafeId: string): NormalizedTelegramMessage {
    return {
      type: 'callback_query',
      chatId: (cb.message?.chat.id ?? 0).toString(),
      userId: (cb.from?.id ?? 0).toString(),
      text: cb.data,
      callbackData: cb.data,
      callbackQueryId: cb.id,
      messageId: (cb.message?.message_id ?? 0).toString(),
      cafeId,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }

  private detectMessageType(msg: NonNullable<RawTelegramUpdate['message']>): TelegramMessageType {
    if (msg.entities?.some(e => e.type === 'bot_command')) return 'command';
    if (msg.contact) return 'contact';
    if (msg.location) return 'location';
    if (msg.photo) return 'photo';
    if (msg.voice) return 'voice';
    return 'text';
  }
}

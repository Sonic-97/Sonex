export type TelegramMessageType = 'text' | 'callback_query' | 'contact' | 'location' | 'photo' | 'voice' | 'command';

export interface NormalizedTelegramMessage {
  type: TelegramMessageType;
  chatId: string;
  userId: string;
  text?: string;
  callbackData?: string;
  callbackQueryId?: string;
  messageId: string;
  cafeId: string;
  contact?: { phone: string; firstName?: string };
  location?: { latitude: number; longitude: number };
  photo?: { fileId: string };
  timestamp: number;
}

export interface TelegramResponse {
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown';
  replyMarkup?: TelegramKeyboard;
  messageId?: string;
  editMessage?: boolean;
}

export interface InlineKeyboardButton {
  text: string;
  callbackData: string;
}

export interface InlineKeyboardRow {
  buttons: InlineKeyboardButton[];
}

export interface TelegramKeyboard {
  inlineKeyboard?: InlineKeyboardRow[];
  replyKeyboard?: Array<{ text: string; requestContact?: boolean }[]>;
  removeKeyboard?: boolean;
  oneTimeKeyboard?: boolean;
  resizeKeyboard?: boolean;
}

export interface CustomerSession {
  customerId: string;
  cafeId: string;
  telegramUserId: string;
  branchId: string;
}

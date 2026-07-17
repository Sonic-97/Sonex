export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface ReplyKeyboardButton {
  text: string;
  request_contact?: boolean;
  request_location?: boolean;
}

export interface ReplyKeyboardMarkup {
  keyboard: ReplyKeyboardButton[][];
  one_time_keyboard?: boolean;
  resize_keyboard?: boolean;
  remove_keyboard?: boolean;
}

export interface SendMessageOptions {
  replyToMessageId?: string;
  replyMarkup?: InlineKeyboardMarkup | ReplyKeyboardMarkup;
  parseMode?: 'HTML' | 'MarkdownV2';
  disablePreview?: boolean;
}

export interface EditMessageOptions {
  replyMarkup?: InlineKeyboardMarkup;
  parseMode?: 'HTML' | 'MarkdownV2';
}

export interface SendPhotoOptions {
  replyMarkup?: InlineKeyboardMarkup;
  parseMode?: 'HTML' | 'MarkdownV2';
}

export interface SendInvoice {
  title: string;
  description: string;
  payload: string;
  prices: Array<{ label: string; amount: number }>;
}

export interface SendResult {
  messageId: string;
  success: boolean;
}

export interface MessagingProvider {
  readonly channel: 'telegram' | 'whatsapp' | 'signal' | 'web';

  sendMessage(chatId: string, text: string, options?: SendMessageOptions): Promise<SendResult>;

  editMessage(chatId: string, messageId: string, text: string, options?: EditMessageOptions): Promise<{ success: boolean }>;

  sendPhoto(chatId: string, photo: string | Buffer, caption?: string, options?: SendPhotoOptions): Promise<SendResult>;

  sendInvoice(chatId: string, invoice: SendInvoice): Promise<SendResult>;

  answerCallbackQuery(callbackQueryId: string, text?: string, showAlert?: boolean): Promise<void>;

  requestContact(chatId: string, text: string): Promise<SendResult>;

  healthCheck(): Promise<boolean>;
}

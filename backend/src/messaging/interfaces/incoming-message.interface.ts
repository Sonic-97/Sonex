export interface IncomingMessage {
  channel: 'telegram' | 'whatsapp' | 'signal' | 'web';

  chatId: string;
  userId: string;
  displayName: string;

  text?: string;
  photo?: { fileId: string; caption?: string };
  voice?: { fileId: string; duration: number };
  contact?: { phone: string; firstName: string };

  callbackData?: string;
  callbackQueryId?: string;

  messageId: string;
  replyToMessageId?: string;
  cafeId: string;
  timestamp: number;

  languageCode?: string;
}

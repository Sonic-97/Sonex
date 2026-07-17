import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';

export class IncomingMessageDto {
  @IsIn(['telegram', 'whatsapp', 'signal', 'web'])
  channel: string;

  @IsString()
  chatId: string;

  @IsString()
  userId: string;

  @IsString()
  displayName: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  photo?: { fileId: string; caption?: string };

  @IsOptional()
  voice?: { fileId: string; duration: number };

  @IsOptional()
  contact?: { phone: string; firstName: string };

  @IsOptional()
  @IsString()
  callbackData?: string;

  @IsOptional()
  @IsString()
  callbackQueryId?: string;

  @IsString()
  messageId: string;

  @IsOptional()
  @IsString()
  replyToMessageId?: string;

  @IsString()
  cafeId: string;

  @IsNumber()
  timestamp: number;

  @IsOptional()
  @IsString()
  languageCode?: string;
}

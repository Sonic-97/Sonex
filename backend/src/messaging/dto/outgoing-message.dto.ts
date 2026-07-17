import { IsString, IsOptional, IsIn } from 'class-validator';

export class OutgoingMessageDto {
  @IsString()
  chatId: string;

  @IsString()
  text: string;

  @IsString()
  cafeId: string;

  @IsOptional()
  @IsIn(['telegram', 'whatsapp', 'signal', 'web'])
  channel?: string;

  @IsOptional()
  @IsString()
  replyToMessageId?: string;

  @IsOptional()
  replyMarkup?: any;

  @IsOptional()
  @IsIn(['HTML', 'MarkdownV2'])
  parseMode?: string;
}

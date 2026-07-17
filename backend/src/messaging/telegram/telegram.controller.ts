import { Controller, Post, Body, Param, Headers, Logger, UnauthorizedException, NotFoundException, Get, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../messaging.service';
import { TelegramUpdateMapper } from './telegram-update.mapper';
import { TelegramCallbackService } from './telegram-callback.service';
import { TelegramService } from './telegram.service';
import { TelegramClientManager } from './telegram-client-manager';
import { TelegramUpdate } from './dto/telegram-webhook.dto';
import { Public } from '../../auth/decorators/public.decorator';

@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly updateMapper: TelegramUpdateMapper,
    private readonly callbackService: TelegramCallbackService,
    private readonly telegramService: TelegramService,
    private readonly clientManager: TelegramClientManager,
    private readonly prisma: PrismaService,
  ) {}

  @Post('webhook/setup/:cafeId')
  @Public()
  async setWebhook(
    @Param('cafeId') cafeId: string,
    @Body() body: { url: string },
  ) {
    const cafe = await this.prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { id: true, telegramEnabled: true, telegramBotToken: true, telegramWebhookToken: true },
    });
    if (!cafe) throw new NotFoundException('Cafe not found');
    if (!cafe.telegramEnabled || !cafe.telegramBotToken) {
      throw new BadRequestException('Telegram not enabled for this cafe');
    }

    const webhookUrl = `${body.url}/telegram/webhook/${cafeId}`;
    await this.telegramService.setWebhook(cafeId, webhookUrl);
    return { success: true, url: webhookUrl };
  }

  @Post('webhook/:cafeId')
  @Public()
  async handleWebhook(
    @Param('cafeId') cafeId: string,
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string,
  ) {
    const cafe = await this.prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { id: true, telegramWebhookToken: true, telegramEnabled: true },
    });
    if (!cafe || !cafe.telegramEnabled) throw new NotFoundException('Cafe not found or Telegram disabled');

    if (cafe.telegramWebhookToken && secretToken !== cafe.telegramWebhookToken) {
      throw new UnauthorizedException('Invalid secret token');
    }

    if (update.callback_query) {
      await this.callbackService.handleCallback({
        chatId: update.callback_query.message?.chat?.id || 0,
        userId: update.callback_query.from.id,
        data: update.callback_query.data || '',
        callbackQueryId: update.callback_query.id,
        cafeId: cafe.id,
        messageId: update.callback_query.message?.message_id || 0,
      });
      return { ok: true };
    }

    if (update.message) {
      const incoming = this.updateMapper.toIncomingMessage(update, cafe.id);
      await this.messagingService.handleIncoming(incoming);
      return { ok: true };
    }

    return { ok: true };
  }

  @Get('health')
  @Public()
  async health() {
    const results: Record<string, any> = {};
    for (const cafeId of this.clientManager.getAllCafeIds()) {
      const botInfo = await this.telegramService.getMe(cafeId).catch(() => null);
      results[cafeId] = {
        healthy: !!botInfo,
        bot: botInfo?.username || null,
      };
    }
    return {
      cafes: results,
      total: this.clientManager.getAllCafeIds().length,
      timestamp: new Date().toISOString(),
    };
  }
}

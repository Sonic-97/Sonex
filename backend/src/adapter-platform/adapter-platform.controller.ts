import { Controller, Post, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { AdapterPlatformService } from './adapter-platform.service';
import { OutgoingMessage } from './interfaces/types';

@Controller('adapter-platform')
export class AdapterPlatformController {
  constructor(private readonly platform: AdapterPlatformService) {}

  @Post('whatsapp/webhook')
  @HttpCode(HttpStatus.OK)
  async handleWhatsAppWebhook(@Body() body: Record<string, unknown>): Promise<{ status: string }> {
    const challenge = body['hub.challenge'];
    if (challenge) return { status: 'verified' };

    const message = await this.platform.receiveMessage(body, 'whatsapp', 'default');
    return { status: 'received' };
  }

  @Post('web-chat/message')
  @HttpCode(HttpStatus.OK)
  async handleWebChatMessage(
    @Body('raw') raw: Record<string, unknown>,
    @Body('cafeId') cafeId: string,
  ): Promise<OutgoingMessage> {
    return this.platform.receiveMessage(raw || {}, 'web_chat', cafeId || 'default');
  }

  @Post('mobile/message')
  @HttpCode(HttpStatus.OK)
  async handleMobileMessage(
    @Body('raw') raw: Record<string, unknown>,
    @Body('cafeId') cafeId: string,
  ): Promise<OutgoingMessage> {
    return this.platform.receiveMessage(raw || {}, 'mobile', cafeId || 'default');
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @Body('sessionId') sessionId: string,
    @Body('channelType') channelType: 'whatsapp' | 'web_chat' | 'mobile',
    @Body('message') message: OutgoingMessage,
  ): Promise<{ status: string }> {
    const status = await this.platform.sendMessage(sessionId, channelType, message);
    return { status };
  }
}

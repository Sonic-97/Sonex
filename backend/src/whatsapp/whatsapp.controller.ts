import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('whatsapp')
export class WhatsappController {
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() body: any) {
    return { status: 'ok', received: true };
  }

  @Get('templates')
  async getTemplates() {
    return [];
  }

  @Get('messages')
  async getMessages() {
    return [];
  }
}





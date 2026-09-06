import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';
import { cafeId, Roles } from '../auth/decorators';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('whatsapp/account')
@UseGuards(RolesGuard)
@Roles('OWNER')
export class TenantWhatsAppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
  ) {}

  @Get()
  async getAccount(@cafeId() cafeId: string) {
    if (!cafeId) throw new BadRequestException('Cafe context required');
    const account = await this.prisma.cafeWhatsAppAccount.findUnique({
      where: { cafeId },
      select: {
        id: true,
        provider: true,
        phoneNumberId: true,
        wabaId: true,
        displayPhoneNumber: true,
        status: true,
        updatedAt: true,
      },
    });

    const cafe = await this.prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { name: true },
    });

    const baseUrl = process.env.API_BASE_URL || 'https://api.sonicpos.com';

    return {
      connected: account?.status === 'CONNECTED',
      account: account || null,
      webhookUrl: `${baseUrl}/communication/webhook/whatsapp`,
      verifyToken: 'sonic_wa_verify_token_2026',
      cafeName: cafe?.name,
    };
  }

  @Post('meta')
  @HttpCode(HttpStatus.OK)
  async saveMetaCredentials(
    @cafeId() cafeId: string,
    @Body()
    dto: {
      phoneNumberId: string;
      wabaId?: string;
      displayPhoneNumber: string;
      accessToken: string;
    },
  ) {
    if (!cafeId) throw new BadRequestException('Cafe context required');
    if (!dto.phoneNumberId || !dto.accessToken) {
      throw new BadRequestException('phoneNumberId and accessToken are required');
    }

    const cleanDisplayPhone = dto.displayPhoneNumber
      ? dto.displayPhoneNumber.replace(/\D/g, '')
      : '';

    const account = await this.prisma.cafeWhatsAppAccount.upsert({
      where: { cafeId },
      create: {
        cafeId,
        provider: 'META_CLOUD',
        phoneNumberId: dto.phoneNumberId,
        wabaId: dto.wabaId || null,
        displayPhoneNumber: cleanDisplayPhone || dto.displayPhoneNumber,
        accessToken: dto.accessToken,
        status: 'CONNECTED',
      },
      update: {
        provider: 'META_CLOUD',
        phoneNumberId: dto.phoneNumberId,
        wabaId: dto.wabaId || null,
        displayPhoneNumber: cleanDisplayPhone || dto.displayPhoneNumber,
        accessToken: dto.accessToken,
        status: 'CONNECTED',
      },
    });

    return {
      success: true,
      message: 'WhatsApp Meta Cloud API credentials saved and activated successfully',
      account: {
        id: account.id,
        phoneNumberId: account.phoneNumberId,
        displayPhoneNumber: account.displayPhoneNumber,
        status: account.status,
      },
    };
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  async disconnectAccount(@cafeId() cafeId: string) {
    if (!cafeId) throw new BadRequestException('Cafe context required');
    await this.prisma.cafeWhatsAppAccount.updateMany({
      where: { cafeId },
      data: { status: 'DISCONNECTED' },
    });
    return { success: true, message: 'WhatsApp account disconnected' };
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  async sendTestMessage(
    @cafeId() cafeId: string,
    @Body('phone') testPhone: string,
  ) {
    if (!cafeId) throw new BadRequestException('Cafe context required');
    if (!testPhone) throw new BadRequestException('Test phone number is required');

    const result = await this.whatsappService.sendMessage(
      testPhone,
      'مرحباً بك! تم ربط واتساب كافيه الخاص بك بنجاح على منصة Sonic Coffee System. 🚀☕',
      cafeId,
    );

    return {
      success: result.success,
      provider: result.provider,
      message: result.success
        ? 'Test message sent successfully'
        : 'Failed to send test message, please check credentials',
    };
  }
}

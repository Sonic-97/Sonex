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
import { GroundedAiEngineService } from './grounded-ai-engine.service';
import { cafeId, Roles } from '../auth/decorators';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('owner/ai-settings')
@UseGuards(RolesGuard)
@Roles('OWNER')
export class OwnerAiSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groundedAi: GroundedAiEngineService,
  ) {}

  @Get()
  async getSettings(@cafeId() cafeId: string) {
    if (!cafeId) throw new BadRequestException('Cafe context required');

    let config = await this.prisma.cafeAiConfig.findUnique({
      where: { cafeId },
    });

    if (!config) {
      config = await this.prisma.cafeAiConfig.create({
        data: {
          cafeId,
          botName: 'مساعد الكافيه الذكي',
          tone: 'EGYPTIAN_CASUAL',
          enableRecommendations: true,
          maxUpsellsPerSession: 1,
        },
      });
    }

    const promotions = await this.prisma.cafePromotion.findMany({
      where: { cafeId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      config,
      promotions,
    };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async saveSettings(
    @cafeId() cafeId: string,
    @Body()
    dto: {
      botName?: string;
      tone?: string;
      welcomeMessage?: string;
      customInstructions?: string;
      deliveryNotes?: string;
      openingHoursNotes?: string;
      enableRecommendations?: boolean;
    },
  ) {
    if (!cafeId) throw new BadRequestException('Cafe context required');

    const updated = await this.prisma.cafeAiConfig.upsert({
      where: { cafeId },
      create: {
        cafeId,
        botName: dto.botName || 'مساعد الكافيه الذكي',
        tone: dto.tone || 'EGYPTIAN_CASUAL',
        welcomeMessage: dto.welcomeMessage,
        customInstructions: dto.customInstructions,
        deliveryNotes: dto.deliveryNotes,
        openingHoursNotes: dto.openingHoursNotes,
        enableRecommendations: dto.enableRecommendations ?? true,
        configVersion: 1,
      },
      update: {
        botName: dto.botName,
        tone: dto.tone,
        welcomeMessage: dto.welcomeMessage,
        customInstructions: dto.customInstructions,
        deliveryNotes: dto.deliveryNotes,
        openingHoursNotes: dto.openingHoursNotes,
        enableRecommendations: dto.enableRecommendations,
        configVersion: { increment: 1 },
      },
    });

    return {
      success: true,
      message: 'تم حفظ إعدادات الذكاء الاصطناعي بنجاح',
      config: updated,
    };
  }

  /**
   * Live Simulator with Debug Mode (Rule #31, #32, #33)
   * Runs against the owner's real menu in Simulation Mode without sending WhatsApp or mutating DB.
   */
  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  async simulateMessage(
    @cafeId() cafeId: string,
    @Body() dto: { message: string; phone?: string; customerName?: string },
  ) {
    if (!cafeId) throw new BadRequestException('Cafe context required');
    if (!dto.message) throw new BadRequestException('Message is required');

    const result = await this.groundedAi.processCustomerMessage({
      cafeId,
      phone: dto.phone || '201000000000',
      message: dto.message,
      customerName: dto.customerName || 'زبون تجريبي',
      isSimulation: true,
    });

    return {
      success: true,
      reply: result.reply,
      toolsCalled: result.toolsCalled,
      confidence: result.confidence,
      handoffTriggered: result.handoffTriggered,
      debugTrace: result.debugTrace,
    };
  }
}

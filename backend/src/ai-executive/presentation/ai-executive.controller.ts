import { Controller, Get, Post, Query, Body, BadRequestException } from '@nestjs/common';
import { MorningBriefService } from '../application/morning-brief.service';

@Controller('api/v1/ai-executive')
export class AIExecutiveController {
  constructor(private readonly briefService: MorningBriefService) {}

  @Get('morning-brief')
  async getMorningBrief(
    @Query('cafeId') cafeId: string,
    @Query('branchId') branchId: string,
  ) {
    if (!cafeId || !branchId) {
      throw new BadRequestException('cafeId and branchId query parameters are required.');
    }

    const res = await this.briefService.generateMorningBrief(cafeId, branchId);
    if (!res.isSuccess) {
      throw new BadRequestException(res.error);
    }
    return res.value.toJSON();
  }

  @Post('approve-recommendation')
  async approveRecommendation(
    @Body() body: { recommendationId: string; ownerId: string },
  ) {
    if (!body.recommendationId || !body.ownerId) {
      throw new BadRequestException('recommendationId and ownerId are required.');
    }

    const res = await this.briefService.approveRecommendation(body.recommendationId, body.ownerId);
    if (!res.isSuccess) {
      throw new BadRequestException(res.error);
    }
    return res.value;
  }
}

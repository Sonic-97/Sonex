import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { StaffPerformanceService } from './staff-performance.service';
import { StaffRankingService } from './staff-ranking.service';
import { StaffInsightService } from './staff-insight.service';
import { cafeId } from '../auth/decorators';

@Controller('staff/performance')
export class StaffPerformanceController {
  constructor(
    private readonly performanceService: StaffPerformanceService,
    private readonly rankingService: StaffRankingService,
    private readonly insightService: StaffInsightService,
  ) {}

  @Get('overview')
  async getOverview(@cafeId() cafeId?: string) {
    return this.performanceService.getOverview(cafeId);
  }

  @Get('top')
  async getTopPerformers(@Query('limit') limit?: string, @cafeId() cafeId?: string) {
    return this.performanceService.getTopPerformers(limit ? parseInt(limit, 10) : 5, undefined, undefined, cafeId);
  }

  @Get('underperforming')
  async getUnderperformers(
    @Query('threshold') threshold?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.performanceService.getUnderperformers(
      threshold ? parseInt(threshold, 10) : 40,
      undefined, undefined, cafeId,
    );
  }

  @Get(':id')
  async getStaffScore(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.performanceService.getStaffScore(id, cafeId);
  }

  @Get(':id/history')
  async getStaffHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('days') days?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.performanceService.getPerformanceHistory(
      id,
      days ? parseInt(days, 10) : 7,
      cafeId,
    );
  }

  @Get(':id/insights')
  async getStaffInsights(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.insightService.getStaffInsights(id, cafeId);
  }

  @Get('ranking/daily')
  async getDailyRanking(@cafeId() cafeId?: string) {
    return this.rankingService.dailyRanking(cafeId);
  }

  @Get('ranking/weekly')
  async getWeeklyRanking(@cafeId() cafeId?: string) {
    return this.rankingService.weeklyRanking(cafeId);
  }

  @Get('ranking/monthly')
  async getMonthlyRanking(@cafeId() cafeId?: string) {
    return this.rankingService.monthlyRanking(cafeId);
  }

  @Get('compare')
  async compareStaff(
    @Query('staffA') staffA: string,
    @Query('staffB') staffB: string,
    @cafeId() cafeId?: string,
  ) {
    if (!staffA || !staffB) {
      return { error: 'Both staffA and staffB query params are required' };
    }
    return this.rankingService.compareStaffPerformance(staffA, staffB, cafeId);
  }
}





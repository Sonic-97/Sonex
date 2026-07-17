import { Controller, Get, Query } from '@nestjs/common';
import { DecisionEngineService, Decision } from './decision-engine.service';
import { cafeId } from '../auth/decorators';

@Controller('ai-decisions')
export class AiDecisionsController {
  constructor(private readonly engine: DecisionEngineService) {}

  @Get('daily')
  async getDailyDecisions(
    @Query('limit') limit?: string,
    @cafeId() cafeId?: string,
  ): Promise<Decision[]> {
    const decisions = await this.engine.generateDailyDecisions(cafeId);
    return limit ? decisions.slice(0, parseInt(limit)) : decisions;
  }

  @Get('weekly')
  async getWeeklyStrategy(@cafeId() cafeId?: string): Promise<Decision[]> {
    return this.engine.generateWeeklyStrategy(cafeId);
  }

  @Get('revenue')
  async getRevenueDecisions(@cafeId() cafeId?: string): Promise<Decision[]> {
    return this.engine.analyzeRevenueOpportunities(cafeId);
  }

  @Get('staff')
  async getStaffDecisions(@cafeId() cafeId?: string): Promise<Decision[]> {
    return this.engine.analyzeStaffOptimization(cafeId);
  }

  @Get('products')
  async getProductDecisions(@cafeId() cafeId?: string): Promise<Decision[]> {
    return this.engine.analyzeProductStrategy(cafeId);
  }

  @Get('risks')
  async getRiskDecisions(@cafeId() cafeId?: string): Promise<Decision[]> {
    return this.engine.detectBusinessRisks(cafeId);
  }
}





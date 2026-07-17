import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsEngineService } from '../analytics-engine/analytics-engine.service';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvent } from '../events/events.service';

@Injectable()
export class BusinessInsightsService {
  private readonly logger = new Logger(BusinessInsightsService.name);

  constructor(private readonly engine: AnalyticsEngineService) {}

  @OnEvent('order.delivered')
  onOrderDelivered(event: AppEvent) {
    this.logger.debug(`Analytics cache invalidated by order.delivered: ${(event.payload as any).orderId}`);
  }

  @OnEvent('finance.revenue.updated')
  onRevenueUpdated(event: AppEvent) {
    this.logger.debug(`Analytics cache invalidated by finance.revenue.updated`);
  }

  async generateDailySummary(cafeId: string) {
    return this.engine.generateDailySummary(cafeId);
  }

  async generateWeeklySummary(cafeId: string) {
    return this.engine.generateWeeklySummary(cafeId);
  }

  async generateMonthlyTrendReport(cafeId: string) {
    return this.engine.generateMonthlyTrendReport(cafeId);
  }

  async businessHealthScore(cafeId: string) {
    return this.engine.businessHealthScore(cafeId);
  }

  async detectAlerts(cafeId: string) {
    return this.engine.detectAlerts(cafeId);
  }

  async getOverview(cafeId: string) {
    return this.engine.getOverview(cafeId);
  }
}

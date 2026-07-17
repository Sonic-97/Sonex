import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { cafeId } from '../auth/decorators';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('Cafe')
  getOwnerDashboard(@cafeId() cafeId: string) {
    return this.dashboardService.getOwnerDashboard(cafeId);
  }

  @Get('sales-summary')
  getSalesSummary(@cafeId() cafeId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.dashboardService.getSalesSummary(cafeId, from, to);
  }

  @Get('pending-orders')
  getPendingOrders(@cafeId() cafeId: string) {
    return this.dashboardService.getPendingOrders(cafeId);
  }

  @Get('low-stock')
  getLowStock(@cafeId() cafeId: string) {
    return this.dashboardService.getLowStock(cafeId);
  }

  @Get('product-profitability')
  getProductProfitability(
    @cafeId() cafeId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getProductProfitabilitySnapshot(cafeId, from, to);
  }

  @Get('attendance-summary')
  getAttendanceSummary(@cafeId() cafeId: string) {
    return this.dashboardService.getAttendanceSummarySnapshot(cafeId);
  }
}





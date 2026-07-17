import { Controller, Get, UseGuards } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CafeGuard } from '../auth/guards/cafe.guard';
import { cafeId } from '../auth/decorators';

@Controller('finance')
@UseGuards(JwtAuthGuard, CafeGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('dashboard/today')
  async getTodayDashboard(@cafeId() cafeId: string) {
    return this.financeService.getTodayDashboard(cafeId);
  }
}

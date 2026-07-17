import { Controller, Get } from '@nestjs/common';
import { FinancialService } from './financial.service';
import { cafeId } from '../auth/decorators';

@Controller('financial')
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  @Get('today')
  async getTodayFinancials(@cafeId() cafeId: string) {
    return this.financialService.getTodayFinancials(cafeId);
  }

  @Get('staff-earnings')
  async getStaffEarnings(@cafeId() cafeId: string) {
    return this.financialService.getAllStaffEarnings(cafeId);
  }

  @Get('driver-earnings')
  async getDriverEarnings(@cafeId() cafeId: string) {
    return this.financialService.getAllDriverEarnings(cafeId);
  }
}





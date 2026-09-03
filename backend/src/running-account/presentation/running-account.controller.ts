import { Controller, Get, Post, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { RunningAccountService } from '../application/running-account.service';

@Controller('api/v1/running-account')
export class RunningAccountController {
  constructor(private readonly service: RunningAccountService) {}

  @Get(':customerId')
  async getAccount(
    @Param('customerId') customerId: string,
    @Query('branchId') branchId: string,
  ) {
    const res = await this.service.getOrCreateAccount(customerId, branchId || 'default');
    if (!res.isSuccess) {
      throw new BadRequestException(res.error);
    }
    return res.value.toJSON();
  }

  @Post('validate-credit')
  async validateCredit(
    @Body() body: { customerId: string; branchId: string; orderTotal: number },
  ) {
    const res = await this.service.validateOrderCredit(body.customerId, body.branchId, body.orderTotal);
    if (!res.isSuccess) {
      return { allowed: false, reason: res.error };
    }
    return { allowed: true };
  }

  @Post('record-charge')
  async recordCharge(
    @Body() body: { customerId: string; branchId: string; amount: number },
  ) {
    const res = await this.service.recordCreditCharge(body.customerId, body.branchId, body.amount);
    if (!res.isSuccess) {
      throw new BadRequestException(res.error);
    }
    return res.value.toJSON();
  }

  @Post('record-payment')
  async recordPayment(
    @Body() body: { customerId: string; branchId: string; amount: number },
  ) {
    const res = await this.service.recordPayment(body.customerId, body.branchId, body.amount);
    if (!res.isSuccess) {
      throw new BadRequestException(res.error);
    }
    return res.value.toJSON();
  }
}

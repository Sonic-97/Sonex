import { Controller, Get, Post, Patch, Param, Body, Query, HttpCode, HttpStatus, ParseUUIDPipe, ForbiddenException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { MarkOrderPaymentDto, DriverConfirmDeliveryDto } from './dto/collect-payment.dto';
import { cafeId } from '../auth/decorators';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('collect')
  @HttpCode(HttpStatus.OK)
  async collectPayment(@Body() dto: MarkOrderPaymentDto, @cafeId() cafeId?: string) {
    if (!cafeId) throw new ForbiddenException('No cafe context');
    return this.paymentService.markOrderPayment(dto.orderId, dto, cafeId);
  }

  @Post('driver-confirm')
  @HttpCode(HttpStatus.OK)
  async driverConfirm(@Body() dto: DriverConfirmDeliveryDto, @cafeId() cafeId?: string) {
    if (!cafeId) throw new ForbiddenException('No cafe context');
    return this.paymentService.confirmDriverDelivery(dto, cafeId);
  }

  @Get('unpaid-orders')
  async getUnpaidOrders(@cafeId() cafeId?: string) {
    return this.paymentService.getUnpaidOrders(cafeId);
  }

  @Get('logs/:orderId')
  async getPaymentLogs(@Param('orderId', ParseUUIDPipe) orderId: string, @cafeId() cafeId?: string) {
    return this.paymentService.getPaymentLogs(orderId, cafeId);
  }

  @Get('barista-closing/:baristaId')
  async getBaristaClosing(
    @Param('baristaId', ParseUUIDPipe) baristaId: string,
    @Query('date') date?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.paymentService.getBaristaDailyClosing(baristaId, date, cafeId);
  }

  @Get('driver-closing/:driverId')
  async getDriverClosing(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query('date') date?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.paymentService.getDriverDailyClosing(driverId, date, cafeId);
  }

  @Get('reconciliation')
  async getReconciliation(@Query('date') date?: string, @cafeId() cafeId?: string) {
    return this.paymentService.getDailyReconciliation(date, cafeId);
  }

  @Get('debt-overview')
  async getDebtOverview(@cafeId() cafeId?: string) {
    return this.paymentService.getUnifiedDebtOverview(cafeId);
  }

  @Get('debts')
  async getDebts(@Query('settled') settled?: string, @cafeId() cafeId?: string) {
    const settledBool = settled !== undefined ? settled === 'true' : undefined;
    return this.paymentService.getDebtRecords(settledBool, cafeId);
  }

  @Patch('debts/:id/settle')
  @HttpCode(HttpStatus.OK)
  async settleDebt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('settledById') settledById: string,
    @cafeId() cafeId?: string,
  ) {
    if (!cafeId) throw new ForbiddenException('No cafe context');
    return this.paymentService.settleDebt(id, settledById, cafeId);
  }

  @Patch('orders/:orderId/payment')
  @HttpCode(HttpStatus.OK)
  async updateOrderPayment(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: MarkOrderPaymentDto,
    @cafeId() cafeId?: string,
  ) {
    if (!cafeId) throw new ForbiddenException('No cafe context');
    return this.paymentService.markOrderPayment(orderId, dto, cafeId);
  }
}




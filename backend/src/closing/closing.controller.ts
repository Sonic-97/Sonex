import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus, UnauthorizedException, ParseUUIDPipe } from '@nestjs/common';
import { ClosingService } from './closing.service';
import { cafeId } from '../auth/decorators';

@Controller('closing')
export class ClosingController {
  constructor(private readonly closingService: ClosingService) {}

  @Get('end-of-day')
  async getEndOfDayData(@cafeId() cafeId?: string, @Query('date') date?: string) {
    if (!cafeId) throw new UnauthorizedException('Authentication required');
    return this.closingService.getEndOfDayData(cafeId, date);
  }

  @Post('orders/:orderId/mark-paid')
  @HttpCode(HttpStatus.OK)
  async markPaid(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body('collectedById') collectedById: string,
    @Body('collectedRole') collectedRole: string,
    @cafeId() cafeId?: string,
  ) {
    if (!cafeId) throw new UnauthorizedException('Authentication required');
    return this.closingService.markPaid(orderId, cafeId, collectedById, collectedRole);
  }

  @Get('shifts/pending')
  async getPendingShifts(@cafeId() cafeId?: string) {
    if (!cafeId) throw new UnauthorizedException('Authentication required');
    return this.closingService.getPendingShifts(cafeId);
  }

  @Get('shifts/history')
  async getConfirmedShifts(@cafeId() cafeId?: string) {
    if (!cafeId) throw new UnauthorizedException('Authentication required');
    return this.closingService.getConfirmedShifts(cafeId!);
  }

  @Post('shifts/:id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmShift(
    @Param('id', ParseUUIDPipe) shiftId: string,
    @Body('deliveredCash') deliveredCash: number,
    @cafeId() cafeId?: string,
  ) {
    if (!cafeId) throw new UnauthorizedException('Authentication required');
    return this.closingService.confirmShift(shiftId, cafeId, deliveredCash);
  }
}

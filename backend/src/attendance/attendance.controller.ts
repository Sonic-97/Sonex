import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { ClockInDto, ClockOutDto } from './dto';
import { cafeId, Public } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Post('clock-in')
  @HttpCode(HttpStatus.OK)
  async clockIn(@Body() dto: ClockInDto, @cafeId() cafeId?: string) {
    return this.service.clockIn(dto, cafeId);
  }

  @Post('clock-out')
  @HttpCode(HttpStatus.OK)
  async clockOut(@Body() dto: ClockOutDto, @cafeId() cafeId?: string) {
    return this.service.clockOut(dto, cafeId);
  }

  @Get('active/:staffId')
  async getActiveShift(@Param('staffId') staffId: string, @cafeId() cafeId?: string) {
    return this.service.getActiveShift(staffId, cafeId);
  }

  @Get('history/:staffId')
  async getHistory(
    @Param('staffId') staffId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.service.getAttendanceHistory(staffId, cafeId, from, to);
  }

  @Get('summary')
  async getSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.service.getAttendanceSummary(cafeId!, from, to);
  }

  @Get('active-shifts')
  async getAllActiveShifts(@cafeId() cafeId?: string) {
    return this.service.getAllActiveShifts(cafeId!);
  }
}

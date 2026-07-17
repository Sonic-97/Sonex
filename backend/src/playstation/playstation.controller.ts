import { Controller, Get, Post, Patch, Delete, Put, Param, Body, Query, UseGuards, Req, ParseUUIDPipe } from '@nestjs/common';
import { PlayStationService } from './playstation.service';
import { CreateDeviceDto, UpdateDeviceDto, UpdatePricingDto, StartSessionDto } from './dto/playstation.dto';
import { cafeId } from '../auth/decorators';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('playstation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlayStationController {
  constructor(private readonly service: PlayStationService) {}

  // ── DEVICES ──

  @Get('devices')
  async getDevices(@cafeId() cafeId?: string) {
    return this.service.getDevices(cafeId!);
  }

  @Post('devices')
  @Roles('OWNER')
  async createDevice(@Body() dto: CreateDeviceDto, @cafeId() cafeId?: string) {
    return this.service.createDevice(dto, cafeId!);
  }

  @Patch('devices/:id')
  @Roles('OWNER')
  async updateDevice(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDeviceDto, @cafeId() cafeId?: string) {
    return this.service.updateDevice(id, dto, cafeId!);
  }

  @Delete('devices/:id')
  @Roles('OWNER')
  async deleteDevice(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.deleteDevice(id, cafeId!);
  }

  // ── PRICING ──

  @Get('pricing')
  async getPricing(@cafeId() cafeId?: string) {
    return this.service.getPricing(cafeId!);
  }

  @Put('pricing')
  @Roles('OWNER')
  async updatePricing(@Body() dto: UpdatePricingDto, @cafeId() cafeId?: string) {
    return this.service.updatePricing(dto, cafeId!);
  }

  // ── SESSIONS ──

  @Get('sessions/active')
  async getActiveSessions(@cafeId() cafeId?: string) {
    return this.service.getActiveSessions(cafeId!);
  }

  @Post('sessions')
  async startSession(@Body() dto: StartSessionDto, @Req() req: any, @cafeId() cafeId?: string) {
    const employeeId = dto.employeeId || req.user.id;
    return this.service.startSession(dto, employeeId, cafeId!);
  }

  @Get('sessions/:id/timer')
  async getSessionTimer(
    @Param('id', ParseUUIDPipe) id: string,
    @cafeId() cafeId?: string,
  ) {
    return this.service.getSessionTimerState(id, cafeId!);
  }

  @Patch('sessions/:id/close')
  async closeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('paymentStatus') paymentStatus: string,
    @Req() req: any,
    @cafeId() cafeId?: string,
  ) {
    const closedById = req.user.id;
    return this.service.closeSession(id, paymentStatus, closedById, cafeId!);
  }

  @Patch('sessions/:id/collect')
  async collectPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @cafeId() cafeId?: string,
  ) {
    const employeeId = req.user.id;
    return this.service.collectPayment(id, employeeId, cafeId!);
  }

  @Get('sessions/history')
  async getSessionHistory(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('deviceId') deviceId?: string,
    @Query('status') status?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.service.getSessionHistory(cafeId!, dateFrom, dateTo, deviceId, status);
  }

  @Get('reports/owner')
  @Roles('OWNER')
  async getOwnerReport(@cafeId() cafeId?: string) {
    return this.service.getOwnerReport(cafeId!);
  }

  @Get('reports/employee-kpi')
  @Roles('OWNER')
  async getEmployeeKpi(@cafeId() cafeId?: string) {
    return this.service.getEmployeeKpi(cafeId!);
  }

  @Get('reports/kpi-aggregations')
  @Roles('OWNER')
  async getKpiAggregations(
    @Query('employeeId') employeeId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('deviceId') deviceId?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.service.getKpiAggregations(cafeId!, employeeId, dateFrom, dateTo, deviceId);
  }
}

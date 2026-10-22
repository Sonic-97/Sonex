import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PlayStationService } from './playstation.service';
import {
  CreateDeviceDto,
  UpdateDeviceDto,
  UpdatePricingDto,
  StartSessionDto,
  AddSessionOrderDto,
  TransferSessionDto,
  SettleSessionDto,
} from './dto/playstation.dto';
import { cafeId } from '../auth/decorators';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('playstation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlayStationController {
  constructor(private readonly service: PlayStationService) {}

  // ── DEVICES & ROOMS ──

  @Get('devices')
  async getDevices(@cafeId() cafeId?: string) {
    return this.service.getDevices(cafeId!);
  }

  @Post('devices')
  @Roles('OWNER', 'MANAGER')
  async createDevice(@Body() dto: CreateDeviceDto, @cafeId() cafeId?: string) {
    return this.service.createDevice(dto, cafeId!);
  }

  @Patch('devices/:id')
  @Roles('OWNER', 'MANAGER')
  async updateDevice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeviceDto,
    @cafeId() cafeId?: string,
  ) {
    return this.service.updateDevice(id, dto, cafeId!);
  }

  @Delete('devices/:id')
  @Roles('OWNER', 'MANAGER')
  async deleteDevice(
    @Param('id', ParseUUIDPipe) id: string,
    @cafeId() cafeId?: string,
  ) {
    return this.service.deleteDevice(id, cafeId!);
  }

  // ── PRICING ──

  @Get('pricing')
  async getPricing(@cafeId() cafeId?: string) {
    return this.service.getPricing(cafeId!);
  }

  @Put('pricing')
  @Roles('OWNER', 'MANAGER')
  async updatePricing(@Body() dto: UpdatePricingDto, @cafeId() cafeId?: string) {
    return this.service.updatePricing(dto, cafeId!);
  }

  // ── SESSIONS ──

  @Get('sessions/active')
  async getActiveSessions(@cafeId() cafeId?: string) {
    return this.service.getActiveSessions(cafeId!);
  }

  @Post('sessions')
  async startSession(
    @Body() dto: StartSessionDto,
    @Req() req: any,
    @cafeId() cafeId?: string,
  ) {
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

  @Post('sessions/:id/pause')
  @HttpCode(HttpStatus.OK)
  async pauseSession(
    @Param('id', ParseUUIDPipe) id: string,
    @cafeId() cafeId?: string,
  ) {
    return this.service.pauseSession(id, cafeId!);
  }

  @Post('sessions/:id/resume')
  @HttpCode(HttpStatus.OK)
  async resumeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @cafeId() cafeId?: string,
  ) {
    return this.service.resumeSession(id, cafeId!);
  }

  @Post('sessions/:id/transfer')
  @HttpCode(HttpStatus.OK)
  async transferSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferSessionDto,
    @cafeId() cafeId?: string,
  ) {
    return this.service.transferSession(id, dto, cafeId!);
  }

  @Post('sessions/:id/orders')
  @HttpCode(HttpStatus.CREATED)
  async addSessionOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddSessionOrderDto,
    @Req() req: any,
    @cafeId() cafeId?: string,
  ) {
    const employeeId = req.user.id;
    return this.service.addSessionOrder(id, dto, employeeId, cafeId!);
  }

  @Post('sessions/:id/settle')
  @HttpCode(HttpStatus.OK)
  async settleSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettleSessionDto,
    @Req() req: any,
    @cafeId() cafeId?: string,
  ) {
    const closedById = req.user.id;
    return this.service.settleAndCloseSession(id, dto, closedById, cafeId!);
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

  @Get('owner-report')
  @Roles('OWNER')
  async getOwnerReport(@cafeId() cafeId?: string) {
    return this.service.getOwnerReport(cafeId!);
  }

  @Get('kpi')
  @Roles('OWNER')
  async getEmployeeKpi(@cafeId() cafeId?: string) {
    return this.service.getEmployeeKpi(cafeId!);
  }

  @Get('kpi-aggregations')
  @Roles('OWNER')
  async getKpiAggregations(
    @Query('employeeId') employeeId?: string,
    @Query('deviceId') deviceId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.service.getKpiAggregations(cafeId!, employeeId, dateFrom, dateTo, deviceId);
  }
}

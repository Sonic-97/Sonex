import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../auth/decorators';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OwnerCopilotUser } from '../owner-copilot/owner-copilot.types';
import { ForecastFeedbackDto, ForecastRequestDto, SimulationRequestDto } from './forecasting.dto';
import { ForecastingService } from './forecasting.service';

type AuthenticatedRequest = Request & { user?: OwnerCopilotUser; branchId?: string };

@Controller('forecasting')
@UseGuards(RolesGuard)
@Roles('OWNER', 'MANAGER')
export class ForecastingController {
  constructor(private readonly forecasting: ForecastingService) {}

  @Get('entities')
  async entities(@Req() request: AuthenticatedRequest) {
    return this.forecasting.listEntities(await this.forecasting.resolveScope(request.user, request.branchId));
  }

  @Post('forecast')
  async forecast(@Req() request: AuthenticatedRequest, @Body() dto: ForecastRequestDto) {
    const branchId = dto.branchId || request.branchId;
    return this.forecasting.forecast(await this.forecasting.resolveScope(request.user, branchId), { ...dto, branchId });
  }

  @Post('simulate')
  async simulate(@Req() request: AuthenticatedRequest, @Body() dto: SimulationRequestDto) {
    const branchId = dto.branchId || request.branchId;
    return this.forecasting.simulate(await this.forecasting.resolveScope(request.user, branchId), { ...dto, branchId });
  }

  @Post('compare')
  async compare(@Req() request: AuthenticatedRequest, @Body() body: { scenarios: SimulationRequestDto[] }) {
    const scope = await this.forecasting.resolveScope(request.user, request.branchId);
    return this.forecasting.compareScenarios(scope, body.scenarios);
  }

  @Post('feedback')
  async feedback(@Req() request: AuthenticatedRequest, @Body() dto: ForecastFeedbackDto) {
    return this.forecasting.recordFeedback(await this.forecasting.resolveScope(request.user, request.branchId), dto);
  }

  @Get('accuracy')
  async accuracy(@Req() request: AuthenticatedRequest) {
    return this.forecasting.getAccuracy(await this.forecasting.resolveScope(request.user, request.branchId));
  }

  @Get('metrics')
  @Roles('OWNER')
  metrics() { return this.forecasting.getMetrics(); }
}


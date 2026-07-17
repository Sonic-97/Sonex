import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../auth/decorators';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OwnerCopilotAskDto, OwnerCopilotFeedbackDto } from './owner-copilot.dto';
import { OwnerCopilotService } from './owner-copilot.service';
import { OwnerCopilotUser } from './owner-copilot.types';

type AuthenticatedRequest = Request & {
  user?: OwnerCopilotUser;
  branchId?: string;
};

@Controller('owner-copilot')
@UseGuards(RolesGuard)
@Roles('OWNER', 'MANAGER')
export class OwnerCopilotController {
  constructor(private readonly copilot: OwnerCopilotService) {}

  @Post('ask')
  ask(@Req() request: AuthenticatedRequest, @Body() dto: OwnerCopilotAskDto) {
    return this.copilot.ask(request.user, dto, request.branchId);
  }

  @Get('suggestions')
  suggestions(@Req() request: AuthenticatedRequest) {
    return this.copilot.suggestedQuestions(request.user, request.branchId);
  }

  @Post('feedback')
  feedback(@Req() request: AuthenticatedRequest, @Body() dto: OwnerCopilotFeedbackDto) {
    return this.copilot.recordFeedback(request.user, dto);
  }

  @Get('metrics')
  @Roles('OWNER')
  metrics() {
    return this.copilot.getMetricsSnapshot();
  }
}

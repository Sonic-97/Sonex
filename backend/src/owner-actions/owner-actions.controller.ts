import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../auth/decorators';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApproveOwnerActionDto, CreateOwnerActionProposalDto, EditOwnerActionDto, RejectOwnerActionDto } from './owner-action.dto';
import { OwnerActionUser } from './owner-action.types';
import { OwnerActionsService } from './owner-actions.service';

type AuthenticatedRequest = Request & { user?: OwnerActionUser; branchId?: string };

@Controller('owner-actions')
@UseGuards(RolesGuard)
@Roles('OWNER', 'MANAGER')
export class OwnerActionsController {
  constructor(private readonly actions: OwnerActionsService) {}

  @Get('proposals')
  list(@Req() request: AuthenticatedRequest) {
    return this.actions.list(request.user);
  }

  @Get('proposals/:proposalId')
  get(@Req() request: AuthenticatedRequest, @Param('proposalId') proposalId: string) {
    return this.actions.get(request.user, proposalId);
  }

  @Post('proposals')
  prepare(@Req() request: AuthenticatedRequest, @Body() dto: CreateOwnerActionProposalDto) {
    return this.actions.prepare(request.user, { ...dto, branchId: dto.branchId || request.branchId }, 'API');
  }

  @Post('proposals/:proposalId/approve')
  approve(@Req() request: AuthenticatedRequest, @Param('proposalId') proposalId: string, @Body() dto: ApproveOwnerActionDto) {
    return this.actions.approve(request.user, proposalId, dto, 'UI');
  }

  @Post('proposals/:proposalId/reject')
  reject(@Req() request: AuthenticatedRequest, @Param('proposalId') proposalId: string, @Body() dto: RejectOwnerActionDto) {
    return this.actions.reject(request.user, proposalId, dto.reason);
  }

  @Post('proposals/:proposalId/cancel')
  cancel(@Req() request: AuthenticatedRequest, @Param('proposalId') proposalId: string) {
    return this.actions.cancel(request.user, proposalId);
  }

  @Post('proposals/:proposalId/edit')
  edit(@Req() request: AuthenticatedRequest, @Param('proposalId') proposalId: string, @Body() dto: EditOwnerActionDto) {
    return this.actions.edit(request.user, proposalId, dto);
  }

  @Get('metrics')
  @Roles('OWNER')
  metrics() {
    return this.actions.getMetricsSnapshot();
  }
}


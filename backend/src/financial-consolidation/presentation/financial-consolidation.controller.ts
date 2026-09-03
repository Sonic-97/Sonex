import { Controller, Get, Post, Query, Body, BadRequestException, UseGuards } from '@nestjs/common';
import { ConsolidatedLedgerService } from '../application/consolidated-ledger.service';
import { InterBranchTransferService, InterBranchTransferDTO } from '../application/inter-branch-transfer.service';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Controller('api/v1/financial-consolidation')
@UseGuards(TenantGuard)
export class FinancialConsolidationController {
  constructor(
    private readonly consolidatedLedgerService: ConsolidatedLedgerService,
    private readonly interBranchTransferService: InterBranchTransferService,
  ) {}

  @Get('consolidated-pnl')
  async getConsolidatedPnL(@Query('groupId') groupId: string) {
    if (!groupId) {
      throw new BadRequestException('groupId query parameter is required.');
    }

    const res = await this.consolidatedLedgerService.getConsolidatedPnL(groupId);
    if (!res.isSuccess) {
      throw new BadRequestException(res.error);
    }
    return res.value;
  }

  @Post('inter-branch-transfer')
  async recordTransfer(@Body() dto: InterBranchTransferDTO) {
    const res = await this.interBranchTransferService.executeInterBranchTransfer(dto);
    if (!res.isSuccess) {
      throw new BadRequestException(res.error);
    }
    return res.value;
  }
}

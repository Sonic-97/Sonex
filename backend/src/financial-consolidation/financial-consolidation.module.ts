import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConsolidatedLedgerService } from './application/consolidated-ledger.service';
import { InterBranchTransferService } from './application/inter-branch-transfer.service';
import { FinancialConsolidationController } from './presentation/financial-consolidation.controller';

@Module({
  imports: [PrismaModule],
  controllers: [FinancialConsolidationController],
  providers: [ConsolidatedLedgerService, InterBranchTransferService],
  exports: [ConsolidatedLedgerService, InterBranchTransferService],
})
export class MultiBranchConsolidationModule {}

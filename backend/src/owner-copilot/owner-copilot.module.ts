import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ForecastingModule } from '../forecasting/forecasting.module';
import { OwnerActionsModule } from '../owner-actions/owner-actions.module';
import { RecipeBOMModule } from '../recipe-bom/recipe-bom.module';
import { ProductManagementModule } from '../product-management/product-management.module';
import { OwnerCopilotController } from './owner-copilot.controller';
import { OwnerCopilotService } from './owner-copilot.service';
import { OwnerCopilotToolsService } from './owner-copilot-tools.service';
import { OwnerCopilotUnderstandingService } from './owner-copilot-understanding.service';
import { OwnerBrainContextService } from './owner-brain-context.service';
import { SonexBrainService } from './sonex-brain.service';

@Module({
  imports: [PrismaModule, ForecastingModule, OwnerActionsModule, RecipeBOMModule, ProductManagementModule],
  controllers: [OwnerCopilotController],
  providers: [
    OwnerCopilotService,
    OwnerCopilotToolsService,
    OwnerCopilotUnderstandingService,
    OwnerBrainContextService,
    SonexBrainService,
  ],
  exports: [
    OwnerCopilotService,
    OwnerCopilotToolsService,
    OwnerCopilotUnderstandingService,
    OwnerBrainContextService,
    SonexBrainService,
  ],
})
export class OwnerCopilotModule {}

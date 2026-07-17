import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ForecastingModule } from '../forecasting/forecasting.module';
import { OwnerActionsModule } from '../owner-actions/owner-actions.module';
import { OwnerCopilotController } from './owner-copilot.controller';
import { OwnerCopilotService } from './owner-copilot.service';
import { OwnerCopilotToolsService } from './owner-copilot-tools.service';
import { OwnerCopilotUnderstandingService } from './owner-copilot-understanding.service';

@Module({
  imports: [PrismaModule, ForecastingModule, OwnerActionsModule],
  controllers: [OwnerCopilotController],
  providers: [
    OwnerCopilotService,
    OwnerCopilotToolsService,
    OwnerCopilotUnderstandingService,
  ],
  exports: [OwnerCopilotService, OwnerCopilotToolsService, OwnerCopilotUnderstandingService],
})
export class OwnerCopilotModule {}

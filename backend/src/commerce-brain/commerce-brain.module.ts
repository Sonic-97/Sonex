import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContextBuilderService } from './context-builder.service';
import { CommerceBrainService } from './commerce-brain.service';
import { DeepSeekIntegrationService } from './deepseek-integration.service';
import { LocalDecisionEngine } from './local-decision-engine';
import { DecisionValidatorService } from './decision-validator.service';

@Module({
  imports: [PrismaModule],
  providers: [
    ContextBuilderService,
    CommerceBrainService,
    DeepSeekIntegrationService,
    LocalDecisionEngine,
    DecisionValidatorService,
  ],
  exports: [
    ContextBuilderService,
    CommerceBrainService,
  ],
})
export class CommerceBrainModule {}

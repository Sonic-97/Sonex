import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiToolsService } from './tools/ai-tools.service';
import { GroundedAiEngineService } from './grounded-ai-engine.service';
import { OwnerAiSettingsController } from './owner-ai-settings.controller';

@Module({
  imports: [PrismaModule],
  controllers: [OwnerAiSettingsController],
  providers: [AiService, AiToolsService, GroundedAiEngineService],
  exports: [AiService, AiToolsService, GroundedAiEngineService],
})
export class AiModule {}

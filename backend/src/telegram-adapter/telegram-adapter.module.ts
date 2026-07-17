import { Module } from '@nestjs/common';
import { TelegramAdapterService } from './telegram-adapter.service';
import { TelegramMessageNormalizer } from './telegram-message-normalizer';
import { TelegramSessionService } from './telegram-session.service';
import { TelegramFormatter } from './telegram-formatter';
import { CommerceBrainModule } from '../commerce-brain/commerce-brain.module';
import { ActionPlannerModule } from '../action-planner/action-planner.module';
import { ActionExecutorModule } from '../action-executor/action-executor.module';

@Module({
  imports: [CommerceBrainModule, ActionPlannerModule, ActionExecutorModule],
  providers: [TelegramAdapterService, TelegramMessageNormalizer, TelegramSessionService, TelegramFormatter],
  exports: [TelegramAdapterService],
})
export class TelegramAdapterModule {}

import { Module } from '@nestjs/common';
import { SmartFollowupController } from './smart-followup.controller';
import { CustomerHabitService } from './customer-habit.service';
import { SuggestionEngineService } from './suggestion-engine.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SmartFollowupController],
  providers: [CustomerHabitService, SuggestionEngineService],
  exports: [CustomerHabitService, SuggestionEngineService],
})
export class SmartFollowupModule {}





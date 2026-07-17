import { Module } from '@nestjs/common';
import { ActionPlannerService } from './action-planner.service';

@Module({
  providers: [ActionPlannerService],
  exports: [ActionPlannerService],
})
export class ActionPlannerModule {}

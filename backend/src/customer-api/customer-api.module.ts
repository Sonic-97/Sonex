import { Module } from '@nestjs/common';
import { CustomerApiController } from './customer-api.controller';
import { CustomerApiService } from './customer-api.service';
import { CustomerApiAuthGuard } from './customer-api-auth.guard';
import { CustomerApiSessionService } from './customer-api-session.service';
import { CommerceBrainModule } from '../commerce-brain/commerce-brain.module';
import { ActionPlannerModule } from '../action-planner/action-planner.module';
import { ActionExecutorModule } from '../action-executor/action-executor.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [CommerceBrainModule, ActionPlannerModule, ActionExecutorModule, PrismaModule],
  controllers: [CustomerApiController],
  providers: [CustomerApiService, CustomerApiAuthGuard, CustomerApiSessionService],
})
export class CustomerApiModule {}

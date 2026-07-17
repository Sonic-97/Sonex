import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SmartFollowupModule } from '../smart-followup/smart-followup.module';
import { CustomerLearningService } from './customer-learning.service';
import { CustomerLearningController } from './customer-learning.controller';

@Module({
  imports: [PrismaModule, SmartFollowupModule],
  providers: [CustomerLearningService],
  controllers: [CustomerLearningController],
  exports: [CustomerLearningService],
})
export class CustomerLearningModule {}

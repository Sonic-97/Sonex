import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContinuousLearningService } from './continuous-learning.service';
import { ContinuousLearningController } from './continuous-learning.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ContinuousLearningController],
  providers: [ContinuousLearningService],
  exports: [ContinuousLearningService],
})
export class ContinuousLearningModule {}

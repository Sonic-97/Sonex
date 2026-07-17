import { Module } from '@nestjs/common';
import { CustomerMemoryModule } from '../customer-memory/customer-memory.module';
import { RecommendationService } from './recommendation.service';

@Module({
  imports: [CustomerMemoryModule],
  providers: [RecommendationService],
  exports: [RecommendationService],
})
export class RecommendationModule {}

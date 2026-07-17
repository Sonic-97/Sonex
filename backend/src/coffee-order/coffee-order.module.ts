import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CoffeeOrderService } from './coffee-order.service';
import { CoffeeAttributeExtractor } from './coffee-attribute-extractor';
import { AiOrchestrationModule } from '../ai-orchestration/ai-orchestration.module';
import { CustomerMemoryModule } from '../customer-memory/customer-memory.module';
import { RecommendationModule } from '../recommendations/recommendation.module';
import { PersonalizationModule } from '../personalization/personalization.module';
import { CustomerLearningModule } from '../customer-learning/customer-learning.module';
import { ReplyEngineModule } from '../reply-engine/reply-engine.module';

@Module({
  imports: [PrismaModule, AiOrchestrationModule, CustomerMemoryModule, RecommendationModule, PersonalizationModule, CustomerLearningModule, ReplyEngineModule],
  providers: [CoffeeOrderService, CoffeeAttributeExtractor],
  exports: [CoffeeOrderService, CoffeeAttributeExtractor],
})
export class CoffeeOrderModule {}

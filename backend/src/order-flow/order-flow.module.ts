import { Module } from '@nestjs/common';
import { OrderFlowService } from './order-flow.service';
import { InventoryModule } from '../inventory/inventory.module';
import { AiModule } from '../ai/ai.module';
import { CustomerLearningModule } from '../customer-learning/customer-learning.module';
import { AiWaiterModule } from '../ai-waiter/ai-waiter.module';
import { CoffeeOrderModule } from '../coffee-order/coffee-order.module';
import { CustomerMemoryModule } from '../customer-memory/customer-memory.module';
import { RecommendationModule } from '../recommendations/recommendation.module';
import { CustomerUnderstandingModule } from '../customer-understanding/customer-understanding.module';
import { ReplyEngineModule } from '../reply-engine/reply-engine.module';

@Module({
  imports: [InventoryModule, AiModule, CustomerLearningModule, AiWaiterModule, CoffeeOrderModule, CustomerMemoryModule, RecommendationModule, CustomerUnderstandingModule, ReplyEngineModule],
  providers: [OrderFlowService],
  exports: [OrderFlowService, CoffeeOrderModule],
})
export class OrderFlowModule {}





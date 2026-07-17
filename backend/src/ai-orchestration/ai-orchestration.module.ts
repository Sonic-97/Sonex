import { Module } from '@nestjs/common';
import { CoffeeAttributeExtractor } from '../coffee-order/coffee-attribute-extractor';
import { ConversationSessionService } from './conversation-session.service';
import { StructuredUnderstandingService } from './structured-understanding.service';

@Module({ providers: [CoffeeAttributeExtractor, ConversationSessionService, StructuredUnderstandingService], exports: [ConversationSessionService, StructuredUnderstandingService] })
export class AiOrchestrationModule {}

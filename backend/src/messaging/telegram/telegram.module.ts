import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramProvider } from './telegram.provider';
import { TelegramController } from './telegram.controller';
import { TelegramUpdateMapper } from './telegram-update.mapper';
import { TelegramCallbackService } from './telegram-callback.service';
import { TelegramKeyboardBuilder } from './telegram-keyboard.builder';
import { TelegramPollingService } from './telegram-polling.service';
import { TelegramClientManager } from './telegram-client-manager';
import { QuickActionService } from './quick-action.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { EventsModule } from '../../events/events.module';
import { OrderFlowModule } from '../../order-flow/order-flow.module';
import { MessagingModule } from '../messaging.module';
import { PersonalizationModule } from '../../personalization/personalization.module';
import { CustomerMemoryModule } from '../../customer-memory/customer-memory.module';
import { ReplyEngineModule } from '../../reply-engine/reply-engine.module';

@Module({
  imports: [PrismaModule, EventsModule, OrderFlowModule, MessagingModule, PersonalizationModule, CustomerMemoryModule, ReplyEngineModule],
  controllers: [TelegramController],
  providers: [
    TelegramClientManager,
    TelegramService,
    TelegramProvider,
    TelegramUpdateMapper,
    TelegramCallbackService,
    TelegramKeyboardBuilder,
    TelegramPollingService,
    QuickActionService,
  ],
  exports: [TelegramService, TelegramProvider, TelegramClientManager, QuickActionService],
})
export class TelegramModule {}

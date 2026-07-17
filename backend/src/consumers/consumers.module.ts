import { Module } from '@nestjs/common';
import { SenderResolverConsumer } from './message-received/sender-resolver.consumer';
import { DeduplicationConsumer } from './message-received/deduplication.consumer';
import { MessageParserConsumer } from './message-received/message-parser.consumer';
import { LidMappingPersisterConsumer } from './sender-resolved/lid-mapping-persister.consumer';
import { PendingReplyResolverConsumer } from './sender-resolved/pending-reply-resolver.consumer';
import { CustomerPhoneUpdaterConsumer } from './sender-resolved/customer-phone-updater.consumer';
import { SessionMigratorConsumer } from './sender-resolved/session-migrator.consumer';
import { CommunicationModule } from '../communication/communication.module';
import { AiModule } from '../ai/ai.module';
import { OrdersModule } from '../orders/orders.module';
import { OrderFlowModule } from '../order-flow/order-flow.module';
import { MessagesModule } from '../messages/messages.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ReplyRouterModule } from '../reply-router/reply-router.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    CommunicationModule,
    AiModule,
    OrdersModule,
    OrderFlowModule,
    MessagesModule,
    WhatsappModule,
    ReplyRouterModule,
    MessagingModule,
  ],
  providers: [
    SenderResolverConsumer,
    DeduplicationConsumer,
    MessageParserConsumer,
    LidMappingPersisterConsumer,
    PendingReplyResolverConsumer,
    CustomerPhoneUpdaterConsumer,
    SessionMigratorConsumer,
  ],
})
export class ConsumersModule {}

import { Module } from '@nestjs/common';
import { CommunicationController } from './communication.controller';
import { CommunicationService } from './communication.service';
import { MessagesModule } from '../messages/messages.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { OrderFlowModule } from '../order-flow/order-flow.module';
import { AiModule } from '../ai/ai.module';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    MessagesModule,
    WhatsappModule,
    OrderFlowModule,
    AiModule,
    OrdersModule,
    PrismaModule,
  ],
  controllers: [CommunicationController],
  providers: [CommunicationService],
  exports: [CommunicationService],
})
export class CommunicationModule {}





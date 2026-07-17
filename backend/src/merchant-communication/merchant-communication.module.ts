import { Module } from '@nestjs/common';
import { MerchantCommunicationService } from './merchant-communication.service';
import { MerchantMessageValidator } from './merchant-message-validator';
import { MerchantStateCoordinator } from './merchant-state-coordinator';
import { MerchantEventPublisher } from './merchant-event-publisher';

@Module({
  providers: [
    MerchantCommunicationService,
    MerchantMessageValidator,
    MerchantStateCoordinator,
    MerchantEventPublisher,
  ],
  exports: [MerchantCommunicationService],
})
export class MerchantCommunicationModule {}

import { Module } from '@nestjs/common';
import { MerchantPortalController } from './merchant-portal.controller';
import { MerchantPortalService } from './merchant-portal.service';
import { MerchantPortalAuthGuard } from './merchant-portal-auth.guard';
import { MerchantCommunicationModule } from '../merchant-communication/merchant-communication.module';
import { MerchantAvailabilityModule } from '../merchant-availability/merchant-availability.module';
import { TrustReputationModule } from '../trust-reputation/trust-reputation.module';

@Module({
  imports: [MerchantCommunicationModule, MerchantAvailabilityModule, TrustReputationModule],
  controllers: [MerchantPortalController],
  providers: [MerchantPortalService, MerchantPortalAuthGuard],
})
export class MerchantPortalModule {}

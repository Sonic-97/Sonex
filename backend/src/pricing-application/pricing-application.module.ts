import { Module } from '@nestjs/common';
import { PricingService } from '../pricing-domain';
import { PricingApplicationService } from './pricing-application.service';
import { PricingRequestMapper } from './pricing-request.mapper';
import { PricingResponseMapper } from './pricing-response.mapper';

@Module({
  providers: [PricingService, PricingRequestMapper, PricingResponseMapper, PricingApplicationService],
  exports: [PricingApplicationService],
})
export class PricingApplicationModule {}

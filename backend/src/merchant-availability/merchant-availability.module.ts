import { Module } from '@nestjs/common';
import { MerchantAvailabilityService } from './merchant-availability.service';

@Module({
  providers: [MerchantAvailabilityService],
  exports: [MerchantAvailabilityService],
})
export class MerchantAvailabilityModule {}

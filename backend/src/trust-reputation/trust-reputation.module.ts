import { Module } from '@nestjs/common';
import { TrustReputationService } from './trust-reputation.service';

@Module({
  providers: [TrustReputationService],
  exports: [TrustReputationService],
})
export class TrustReputationModule {}

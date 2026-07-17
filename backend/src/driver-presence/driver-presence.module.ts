import { Module } from '@nestjs/common';
import { DriverPresenceService } from './driver-presence.service';

@Module({
  providers: [DriverPresenceService],
  exports: [DriverPresenceService],
})
export class DriverPresenceModule {}

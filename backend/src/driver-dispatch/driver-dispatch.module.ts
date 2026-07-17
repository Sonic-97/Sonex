import { Module } from '@nestjs/common';
import { DriverDispatchService } from './driver-dispatch.service';

@Module({
  providers: [DriverDispatchService],
  exports: [DriverDispatchService],
})
export class DriverDispatchModule {}

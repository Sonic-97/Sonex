import { Module } from '@nestjs/common';
import { AppGateway } from './websocket.gateway';

@Module({
  providers: [AppGateway],
  exports: [AppGateway],
})
export class WebSocketModule {}





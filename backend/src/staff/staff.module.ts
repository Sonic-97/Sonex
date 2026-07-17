import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebSocketModule],
  controllers: [StaffController, WalletController],
  providers: [StaffService, WalletService],
  exports: [StaffService, WalletService],
})
export class StaffModule {}





import { Module } from '@nestjs/common';
import { ActionExecutorService } from './action-executor.service';
import { OrderOrchestratorModule } from '../order-orchestrator/order-orchestrator.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MerchantCommunicationModule } from '../merchant-communication/merchant-communication.module';
import { DriverDispatchModule } from '../driver-dispatch/driver-dispatch.module';
import { PaymentModule } from '../payment-runtime/payment.module';

@Module({
  imports: [
    OrderOrchestratorModule,
    InventoryModule,
    MerchantCommunicationModule,
    DriverDispatchModule,
    PaymentModule,
  ],
  providers: [ActionExecutorService],
  exports: [ActionExecutorService],
})
export class ActionExecutorModule {}

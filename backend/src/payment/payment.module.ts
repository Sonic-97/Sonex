import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { DigitalPaymentService } from './digital-payment.service';
import { OwnerPaymentSettingsController } from './owner-payment-settings.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [PaymentController, OwnerPaymentSettingsController],
  providers: [PaymentService, DigitalPaymentService],
  exports: [PaymentService, DigitalPaymentService],
})
export class PaymentModule {}

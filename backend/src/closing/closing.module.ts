import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { PaymentModule } from '../payment/payment.module';
import { ClosingController } from './closing.controller';
import { ClosingService } from './closing.service';

@Module({
  imports: [PrismaModule, EventsModule, PaymentModule],
  controllers: [ClosingController],
  providers: [ClosingService],
  exports: [ClosingService],
})
export class ClosingModule {}

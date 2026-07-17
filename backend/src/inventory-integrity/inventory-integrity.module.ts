import { Global, Module } from '@nestjs/common';
import { InventoryIntegrityService } from './inventory-integrity.service';
import { ReservationExpiryService } from './reservation-expiry.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [InventoryIntegrityService, ReservationExpiryService],
  exports: [InventoryIntegrityService, ReservationExpiryService],
})
export class InventoryIntegrityModule {}

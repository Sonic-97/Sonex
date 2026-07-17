import { Module } from '@nestjs/common';
import { InCafeController } from './in-cafe.controller';
import { InCafeService } from './in-cafe.service';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [InCafeController],
  providers: [InCafeService],
  exports: [InCafeService],
})
export class InCafeModule {}





import { Module } from '@nestjs/common';
import { StaffPurchaseController } from './staff-purchase.controller';
import { StaffPurchaseService } from './staff-purchase.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StaffPurchaseController],
  providers: [StaffPurchaseService],
  exports: [StaffPurchaseService],
})
export class StaffPurchaseModule {}





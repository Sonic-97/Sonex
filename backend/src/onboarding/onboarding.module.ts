import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { AiMenuParserService } from './ai-menu-parser.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductManagementModule } from '../product-management/product-management.module';
import { InventoryModule } from '../inventory/inventory.module';
import { StaffModule } from '../staff/staff.module';

@Module({
  imports: [PrismaModule, ProductManagementModule, InventoryModule, StaffModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, AiMenuParserService],
  exports: [OnboardingService],
})
export class OnboardingModule {}

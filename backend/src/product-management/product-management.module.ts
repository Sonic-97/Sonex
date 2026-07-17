import { Module } from '@nestjs/common';
import { ProductManagementController } from './product-management.controller';
import { ProductManagementService } from './product-management.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [ProductManagementController],
  providers: [ProductManagementService],
  exports: [ProductManagementService],
})
export class ProductManagementModule {}




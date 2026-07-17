import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, PrismaService],
  exports: [CustomersService],
})
export class CustomersModule {}





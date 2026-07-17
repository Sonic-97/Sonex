import { Module } from '@nestjs/common';
import { CustomerMemoryService } from './customer-memory.service';

@Module({
  providers: [CustomerMemoryService],
  exports: [CustomerMemoryService],
})
export class CustomerMemoryModule {}

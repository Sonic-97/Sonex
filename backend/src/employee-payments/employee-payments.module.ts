import { Module } from '@nestjs/common';
import { EmployeePaymentsService } from './employee-payments.service';
import { EmployeePaymentsController } from './employee-payments.controller';

@Module({
  controllers: [EmployeePaymentsController],
  providers: [EmployeePaymentsService],
  exports: [EmployeePaymentsService],
})
export class EmployeePaymentsModule {}

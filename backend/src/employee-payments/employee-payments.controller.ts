import { Controller, Get, Post, Delete, Body, Param, UnauthorizedException, ParseUUIDPipe } from '@nestjs/common';
import { EmployeePaymentsService } from './employee-payments.service';
import { CreateEmployeePaymentDto } from './dto/create-employee-payment.dto';
import { cafeId, BranchId } from '../auth/decorators';

@Controller('employee-payments')
export class EmployeePaymentsController {
  constructor(private readonly service: EmployeePaymentsService) {}

  @Post()
  create(@Body() dto: CreateEmployeePaymentDto, @cafeId() cafeId?: string, @BranchId() branchId?: string) {
    if (!cafeId || !branchId) throw new UnauthorizedException('Authentication required');
    return this.service.create(dto, cafeId, branchId);
  }

  @Get()
  findAll(@cafeId() cafeId?: string) {
    if (!cafeId) throw new UnauthorizedException('Authentication required');
    return this.service.findAll(cafeId);
  }

  @Get('report')
  getReport(@cafeId() cafeId?: string) {
    if (!cafeId) throw new UnauthorizedException('Authentication required');
    return this.service.getReport(cafeId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    if (!cafeId) throw new UnauthorizedException('Authentication required');
    return this.service.findOne(id, cafeId);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    if (!cafeId) throw new UnauthorizedException('Authentication required');
    return this.service.remove(id, cafeId);
  }
}

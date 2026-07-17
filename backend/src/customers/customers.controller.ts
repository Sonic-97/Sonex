import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { BranchId, cafeId } from '../auth/decorators';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('search')
  async search(
    @Query('q') query: string,
    @cafeId() cafeId?: string,
    @BranchId() branchId?: string,
  ) {
    return this.customersService.search(query, cafeId, branchId);
  }

  @Get()
  async findAll(@cafeId() cafeId?: string, @BranchId() branchId?: string) {
    return this.customersService.findAll(cafeId, branchId);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.customersService.findOne(id, cafeId);
  }
}

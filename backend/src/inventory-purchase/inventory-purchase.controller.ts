import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { InventoryPurchaseService } from './inventory-purchase.service';
import { BranchId, cafeId } from '../auth/decorators';

@Controller('inventory-purchases')
export class InventoryPurchaseController {
  constructor(private readonly service: InventoryPurchaseService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: {
      itemName: string;
      quantity: number;
      unit: string;
      cost?: number;
      supplier?: string;
      purchasedById?: string;
      inventoryId?: string;
      notes?: string;
    },
    @BranchId() branchId?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.service.create({ ...body, branchId, cafeId });
  }

  @Get()
  async findAll(@Query('from') from?: string, @Query('to') to?: string, @cafeId() cafeId?: string) {
    return this.service.findAll(from, to, cafeId);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.findOne(id, cafeId);
  }
}





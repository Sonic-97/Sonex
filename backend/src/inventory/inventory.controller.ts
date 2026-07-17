import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { BranchId, cafeId } from '../auth/decorators';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  async findAll(@BranchId() branchId?: string, @cafeId() cafeId?: string) {
    return this.inventoryService.findAll(branchId, cafeId);
  }

  @Get('low-stock')
  async getLowStock(@cafeId() cafeId: string) {
    return this.inventoryService.getLowStockItems(cafeId);
  }

  @Get('consumption')
  async getConsumption(@cafeId() cafeId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.inventoryService.getConsumption(cafeId, from, to);
  }

  @Get('ingredient-usage')
  async getIngredientUsage(@cafeId() cafeId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.inventoryService.getIngredientUsage(cafeId, from, to);
  }

  @Get('most-consumed')
  async getMostConsumed(@cafeId() cafeId: string, @Query('from') from?: string, @Query('to') to?: string, @Query('limit') limit?: string) {
    return this.inventoryService.getMostConsumed(cafeId, from, to, limit ? parseInt(limit, 10) : 10);
  }

  @Get('movements')
  async getMovements(@cafeId() cafeId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.inventoryService.getStockMovements(cafeId, from, to);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateInventoryDto,
    @BranchId() branchId: string,
    @cafeId() cafeId: string,
  ) {
    return this.inventoryService.create({ ...body, cafeId, branchId });
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { itemName?: string; unit?: string; currentQty?: number; minThreshold?: number; costPerUnit?: number },
    @cafeId() cafeId?: string,
  ) {
    return this.inventoryService.update(id, body, cafeId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.inventoryService.remove(id, cafeId);
  }

  @Patch(':id/threshold')
  async updateThreshold(@Param('id', ParseUUIDPipe) id: string, @Body('minThreshold') minThreshold: number, @cafeId() cafeId?: string) {
    return this.inventoryService.updateThreshold(id, minThreshold, cafeId);
  }

  @Post(':id/refill')
  @HttpCode(HttpStatus.CREATED)
  async refillStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { quantity: number; cost?: number; supplier?: string; notes?: string; staffId?: string },
    @BranchId() branchId: string,
    @cafeId() cafeId: string,
  ) {
    return this.inventoryService.refillStock({
      inventoryId: id,
      quantity: body.quantity,
      cost: body.cost,
      supplier: body.supplier,
      notes: body.notes,
      staffId: body.staffId,
      cafeId,
      branchId,
    });
  }

  @Get('units')
  async getCustomUnits(@cafeId() cafeId?: string) {
    return this.inventoryService.getCustomUnits(cafeId!);
  }

  @Post('units')
  @HttpCode(HttpStatus.CREATED)
  async createCustomUnit(
    @Body('name') name: string,
    @cafeId() cafeId?: string,
  ) {
    return this.inventoryService.createCustomUnit(name, cafeId!);
  }
}

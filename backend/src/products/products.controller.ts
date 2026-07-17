import { Controller, Get, Post, Patch, Delete, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ProductsService } from './products.service';
import { BranchId, cafeId } from '../auth/decorators';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@BranchId() branchId?: string, @cafeId() cafeId?: string) {
    return this.productsService.findAll(branchId, cafeId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.productsService.findOne(id, cafeId);
  }

  @Post()
  create(@Body() body: {
    name: string;
    category: string;
    price: number;
    cost: number;
  }, @BranchId() branchId?: string, @cafeId() cafeId?: string) {
    return this.productsService.create({ ...body, branchId }, cafeId);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: any, @cafeId() cafeId?: string) {
    return this.productsService.update(id, body, cafeId);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.productsService.remove(id, cafeId);
  }
}




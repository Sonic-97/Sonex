import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { RefrigeratorService } from './refrigerator.service';
import { CreateRefrigeratorCategoryDto, UpdateRefrigeratorCategoryDto } from './dto/refrigerator-category.dto';
import { cafeId } from '../auth/decorators';

@Controller('refrigerator')
export class RefrigeratorController {
  constructor(private readonly service: RefrigeratorService) {}

  @Get('categories')
  async getCategories(@cafeId() cafeId?: string) {
    return this.service.findAllCategories(cafeId);
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  async createCategory(@Body() dto: CreateRefrigeratorCategoryDto, @cafeId() cafeId?: string) {
    return this.service.createCategory(dto, cafeId);
  }

  @Patch('categories/:id')
  async updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRefrigeratorCategoryDto, @cafeId() cafeId?: string) {
    return this.service.updateCategory(id, dto, cafeId);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCategory(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.deleteCategory(id, cafeId);
  }

  @Get('products')
  async getRefrigeratorProducts(@cafeId() cafeId?: string) {
    return this.service.findAllRefrigeratorProducts(cafeId);
  }
}

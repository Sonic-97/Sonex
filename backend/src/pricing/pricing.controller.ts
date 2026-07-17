import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { PricingRuleService } from './pricing-rule.service';
import { CreatePricingRuleDto, UpdatePricingRuleDto, PreviewPriceDto } from './dto/pricing-rule.dto';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingRuleService) {}

  @Post('rules')
  async create(@Body() dto: CreatePricingRuleDto, @Query('cafeId') cafeId: string, @Query('branchId') branchId?: string) {
    if (!cafeId) throw new BadRequestException('cafeId is required');
    return this.pricingService.create(dto, cafeId, branchId);
  }

  @Get('rules')
  async findAll(@Query('cafeId') cafeId: string, @Query('includeDisabled') includeDisabled?: string) {
    if (!cafeId) throw new BadRequestException('cafeId is required');
    return this.pricingService.findAll(cafeId, includeDisabled === 'true');
  }

  @Get('rules/:id')
  async findOne(@Param('id') id: string, @Query('cafeId') cafeId?: string) {
    return this.pricingService.findOne(id, cafeId);
  }

  @Patch('rules/:id')
  async update(@Param('id') id: string, @Body() dto: UpdatePricingRuleDto, @Query('cafeId') cafeId: string) {
    if (!cafeId) throw new BadRequestException('cafeId is required');
    return this.pricingService.update(id, dto, cafeId);
  }

  @Post('rules/:id/enable')
  async enable(@Param('id') id: string, @Query('cafeId') cafeId: string) {
    if (!cafeId) throw new BadRequestException('cafeId is required');
    return this.pricingService.enable(id, cafeId);
  }

  @Post('rules/:id/disable')
  async disable(@Param('id') id: string, @Query('cafeId') cafeId: string) {
    if (!cafeId) throw new BadRequestException('cafeId is required');
    return this.pricingService.disable(id, cafeId);
  }

  @Delete('rules/:id')
  async delete(@Param('id') id: string, @Query('cafeId') cafeId: string) {
    if (!cafeId) throw new BadRequestException('cafeId is required');
    return this.pricingService.delete(id, cafeId);
  }

  @Post('preview')
  async preview(@Body() dto: PreviewPriceDto, @Query('cafeId') cafeId: string) {
    if (!cafeId) throw new BadRequestException('cafeId is required');
    return this.pricingService.previewPrice(
      cafeId,
      dto.productId,
      dto.quantity || 1,
      dto.categoryId,
      dto.category,
    );
  }
}

import { Controller, Get, Post, Body, Param, BadRequestException } from '@nestjs/common';
import { RecipeBOMService, BOMDeductionRequest } from '../application/recipe-bom.service';

@Controller('api/v1/recipe-bom')
export class RecipeBOMController {
  constructor(private readonly service: RecipeBOMService) {}

  @Get('product/:productId')
  async getBOMs(@Param('productId') productId: string) {
    const res = await this.service.getRecipeBOMs(productId);
    if (!res.isSuccess) {
      throw new BadRequestException(res.error);
    }
    return res.value.map((b) => b.toJSON());
  }

  @Post('set-ingredient')
  async setIngredient(
    @Body() body: { productId: string; inventoryId: string; quantity: number; unit: string },
  ) {
    const res = await this.service.setProductRecipeBOM(
      body.productId,
      body.inventoryId,
      body.quantity,
      body.unit,
    );
    if (!res.isSuccess) {
      throw new BadRequestException(res.error);
    }
    return res.value.toJSON();
  }

  @Post('process-deductions')
  async processDeductions(
    @Body() body: { cafeId: string; branchId: string; orderId: string; items: BOMDeductionRequest[] },
  ) {
    const res = await this.service.processOrderRecipeDeductions(
      body.cafeId,
      body.branchId,
      body.orderId,
      body.items,
    );
    if (!res.isSuccess) {
      throw new BadRequestException(res.error);
    }
    return res.value;
  }
}

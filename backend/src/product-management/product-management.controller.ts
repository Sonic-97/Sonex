import { Controller, Get, Post, Patch, Delete, Put, Param, Body, Query, ParseUUIDPipe } from '@nestjs/common';
import { ProductManagementService } from './product-management.service';
import {
  CreateProductDto, UpdateProductDto,
  RecipeIngredientDto, ProductOptionDto,
  ProductSizeDto, AddOnIngredientDto, PackagingMaterialDto,
  CreateCategoryDto, UpdateCategoryDto,
  CreateRefrigeratorCategoryDto, UpdateRefrigeratorCategoryDto,
} from './dto/product.dto';
import { cafeId, BranchId } from '../auth/decorators';

@Controller('product-management')
export class ProductManagementController {
  constructor(private readonly service: ProductManagementService) {}

  // ── PRODUCTS ──

  @Get('products')
  async getProducts(@Query('includeInactive') includeInactive?: string, @cafeId() cafeId?: string) {
    return this.service.findAllProducts(includeInactive === 'true', cafeId);
  }

  @Get('products/:id')
  async getProduct(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.findProduct(id, cafeId);
  }

  @Post('products')
  async createProduct(@Body() dto: CreateProductDto, @cafeId() cafeId?: string, @BranchId() branchId?: string) {
    const finalCafeId = cafeId || dto.cafeId;
    return this.service.createProduct(dto, finalCafeId, branchId);
  }

  @Patch('products/:id')
  async updateProduct(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto, @cafeId() cafeId?: string) {
    return this.service.updateProduct(id, dto, cafeId);
  }

  @Delete('products/:id')
  async deactivateProduct(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.deactivateProduct(id, cafeId);
  }

  @Post('products/:id/activate')
  async activateProduct(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.activateProduct(id, cafeId);
  }

  @Post('products/:id/recalculate-cost')
  async recalculateCost(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.recalculateCost(id, cafeId);
  }

  // ── RECIPE ──

  @Get('products/:id/recipe')
  async getRecipe(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.getRecipe(id, cafeId);
  }

  @Put('products/:id/recipe')
  async setRecipe(@Param('id', ParseUUIDPipe) id: string, @Body() ingredients: RecipeIngredientDto[], @cafeId() cafeId?: string, @BranchId() branchId?: string) {
    return this.service.setRecipe(id, ingredients, cafeId, branchId);
  }

  // ── OPTIONS ──

  @Get('products/:id/options')
  async getOptions(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.getOptions(id, cafeId);
  }

  @Put('products/:id/options')
  async setOptions(@Param('id', ParseUUIDPipe) id: string, @Body() options: ProductOptionDto[], @cafeId() cafeId?: string) {
    return this.service.setOptions(id, options, cafeId);
  }

  // ── PRICE HISTORY ──

  @Get('products/:id/price-history')
  async getPriceHistory(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.getPriceHistory(id, cafeId);
  }

  // ── COSTING ENGINE ──

  @Get('products/:id/cost-breakdown')
  async getCostBreakdown(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.service.getCostBreakdown(id, cafeId, from, to);
  }

  @Get('profitability')
  async getProductProfitability(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.service.getProductProfitability(cafeId!, from, to);
  }

  // ── RECIPE VERSIONS ──

  @Get('products/:id/recipe-versions')
  async getRecipeVersions(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.getRecipeVersions(id, cafeId);
  }

  // ── PRODUCT SIZES ──

  @Get('products/:id/sizes')
  async getSizes(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.getSizes(id, cafeId);
  }

  @Put('products/:id/sizes')
  async setSizes(@Param('id', ParseUUIDPipe) id: string, @Body() sizes: ProductSizeDto[], @cafeId() cafeId?: string) {
    return this.service.setSizes(id, sizes, cafeId);
  }

  // ── ADD-ON INGREDIENTS ──

  @Get('products/:id/add-ons')
  async getAddOns(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.getAddOns(id, cafeId);
  }

  @Put('products/:id/add-ons')
  async setAddOns(@Param('id', ParseUUIDPipe) id: string, @Body() addOns: AddOnIngredientDto[], @cafeId() cafeId?: string) {
    return this.service.setAddOns(id, addOns, cafeId);
  }

  // ── PACKAGING MATERIALS ──

  @Get('products/:id/packaging')
  async getPackaging(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.getPackaging(id, cafeId);
  }

  @Put('products/:id/packaging')
  async setPackaging(@Param('id', ParseUUIDPipe) id: string, @Body() materials: PackagingMaterialDto[], @cafeId() cafeId?: string) {
    return this.service.setPackaging(id, materials, cafeId);
  }

  // ── COST SNAPSHOTS ──

  @Post('products/:id/cost-snapshot')
  async createCostSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { sellingPrice: number; orderItemId?: string; sizeName?: string },
    @cafeId() cafeId?: string,
  ) {
    return this.service.createCostSnapshot(id, body.sellingPrice, cafeId, body.orderItemId, body.sizeName);
  }

  @Get('products/:id/cost-snapshots')
  async getCostSnapshots(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.getCostSnapshots(id, cafeId);
  }

  // ── CATEGORIES ──

  @Get('categories')
  async getCategories(@Query('includeInactive') includeInactive?: string, @cafeId() cafeId?: string) {
    return this.service.findAllCategories(includeInactive === 'true', cafeId);
  }

  @Post('categories')
  async createCategory(@Body() dto: CreateCategoryDto, @cafeId() cafeId?: string, @BranchId() branchId?: string) {
    const finalCafeId = cafeId || dto.cafeId;
    return this.service.createCategory(dto, finalCafeId, branchId);
  }

  @Patch('categories/:id')
  async updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto, @cafeId() cafeId?: string) {
    return this.service.updateCategory(id, dto, cafeId);
  }

  @Delete('categories/:id')
  async deleteCategory(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.deleteCategory(id, cafeId);
  }

  // ── REFRIGERATOR CATEGORIES ──

  @Get('refrigerator-categories')
  async getRefrigeratorCategories(@Query('includeInactive') includeInactive?: string, @cafeId() cafeId?: string) {
    return this.service.findAllRefrigeratorCategories(includeInactive === 'true', cafeId);
  }

  @Post('refrigerator-categories')
  async createRefrigeratorCategory(@Body() dto: CreateRefrigeratorCategoryDto, @cafeId() cafeId?: string) {
    const finalCafeId = cafeId || dto.cafeId;
    return this.service.createRefrigeratorCategory(dto, finalCafeId);
  }

  @Patch('refrigerator-categories/:id')
  async updateRefrigeratorCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRefrigeratorCategoryDto, @cafeId() cafeId?: string) {
    return this.service.updateRefrigeratorCategory(id, dto, cafeId);
  }

  @Delete('refrigerator-categories/:id')
  async deleteRefrigeratorCategory(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.deleteRefrigeratorCategory(id, cafeId);
  }

  // ─── Generic Catalog ────────────────────────────────────────

  @Put('products/:id/images')
  async setProductImages(@Param('id', ParseUUIDPipe) id: string, @Body() body: { images: any[] }, @cafeId() cafeId?: string) {
    return this.service.updateProductCatalog(id, cafeId, { images: body.images });
  }

  @Put('products/:id/attributes')
  async setProductAttributes(@Param('id', ParseUUIDPipe) id: string, @Body() body: { attributes: any[] }, @cafeId() cafeId?: string) {
    return this.service.updateProductCatalog(id, cafeId, { attributes: body.attributes });
  }

  @Put('products/:id/tags')
  async setProductTags(@Param('id', ParseUUIDPipe) id: string, @Body() body: { tags: string[] }, @cafeId() cafeId?: string) {
    return this.service.updateProductCatalog(id, cafeId, { tags: body.tags });
  }

  @Put('products/:id/variants')
  async setProductVariants(@Param('id', ParseUUIDPipe) id: string, @Body() body: { variants: any[] }, @cafeId() cafeId?: string) {
    return this.service.updateProductCatalog(id, cafeId, { variants: body.variants });
  }

  @Put('products/:id/availability')
  async setProductAvailability(@Param('id', ParseUUIDPipe) id: string, @Body() body: { availability: any }, @cafeId() cafeId?: string) {
    return this.service.updateProductCatalog(id, cafeId, { availability: body.availability });
  }


  @Get('products/:id/catalog')
  async getProductCatalog(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.service.getProductCatalog(id, cafeId);
  }

  @Get('catalog')
  async listCatalog(@Query('tag') tag?: string, @Query('categoryId') categoryId?: string, @Query('search') search?: string, @cafeId() cafeId?: string) {
    return this.service.listCatalog(cafeId, { tag, categoryId, search });
  }
}

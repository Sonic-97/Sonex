import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { generateEntityCode } from '../common/utils/code-generator';
import {
  CreateProductDto, UpdateProductDto,
  RecipeIngredientDto, ProductOptionDto,
  ProductSizeDto, AddOnIngredientDto, PackagingMaterialDto,
  CreateCategoryDto, UpdateCategoryDto,
  CreateRefrigeratorCategoryDto, UpdateRefrigeratorCategoryDto,
} from './dto/product.dto';

import * as sonexCore from '../../../sonex-core';

@Injectable()
export class ProductManagementService {
  private readonly logger = new Logger(ProductManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async validateCafe(cafeId?: string) {
    if (!cafeId) {
      throw new BadRequestException('معرف الكافيه مطلوب');
    }
    const cafe = await this.prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { active: true },
    });
    if (!cafe) {
      throw new NotFoundException('الكافيه غير موجود');
    }
    if (!cafe.active) {
      throw new BadRequestException('الكافيه غير نشط حالياً');
    }
  }

  private verifyOwnership<T extends { cafeId: string }>(
    entity: T | null | undefined,
    cafeId: string | undefined,
    name: string,
  ): T {
    if (!entity) throw new NotFoundException(`${name} غير موجود`);
    if (cafeId && entity.cafeId !== cafeId) {
      throw new ForbiddenException(`لا يمكن الوصول إلى ${name} لهذا الكافيه`);
    }
    return entity;
  }

  // ── PRODUCTS ──

  async findAllProducts(includeInactive = false, cafeId?: string) {
    const where: any = {};
    if (cafeId) {
      where.cafeId = cafeId;
    }
    if (!includeInactive) where.active = true;
    return this.prisma.product.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: {
        categoryRel: true,
        recipe: { include: { inventory: { select: { id: true, itemName: true, unit: true, costPerUnit: true } } } },
        options: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async findProduct(id: string, cafeId?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        categoryRel: true,
        recipe: { include: { inventory: { select: { id: true, itemName: true, unit: true, costPerUnit: true } } } },
        options: { orderBy: { sortOrder: 'asc' } },
        priceChanges: { orderBy: { createdAt: 'desc' }, take: 10 },
        refrigeratorCategory: true,
        refrigeratorInventory: { select: { id: true, currentQty: true, minThreshold: true, unit: true } },
      },
    });
    this.verifyOwnership(product, cafeId, 'المنتج');
    return product;
  }

  async createProduct(dto: CreateProductDto, cafeId?: string, branchId?: string) {
    await this.validateCafe(cafeId);

    if (dto.isRefrigerated && dto.refrigeratorCategoryId) {
      const cat = await this.prisma.refrigeratorCategory.findUnique({
        where: { id: dto.refrigeratorCategoryId },
      });
      if (!cat || (cafeId && cat.cafeId !== cafeId)) {
        throw new BadRequestException('التصنيف غير موجود أو لا ينتمي لهذا الكافيه');
      }
    }

    const stockQty = dto.refrigeratorStock ? Number(dto.refrigeratorStock) : 0;
    let inventoryId: string | null = null;

    if (dto.isRefrigerated && stockQty >= 0) {
      const invCode = await generateEntityCode(this.prisma, cafeId!, 'inventory');
      const inv = await this.prisma.inventory.create({
        data: {
          cafeId: cafeId!,
          branchId: branchId ?? null,
          itemName: dto.name,
          code: invCode,
          emoji: dto.emoji || '📦',
          unit: 'piece',
          currentQty: new Prisma.Decimal(stockQty),
          minThreshold: new Prisma.Decimal(dto.lowStockThreshold ?? 0),
          costPerUnit: new Prisma.Decimal(dto.cost ?? 0),
        } as any,
      });
      inventoryId = inv.id;
    }

    const code = await generateEntityCode(this.prisma, cafeId!, 'product');

    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        code,
        category: dto.category || 'general',
        categoryId: dto.categoryId || null,
        description: dto.description || null,
        price: new Prisma.Decimal(dto.price),
        cost: new Prisma.Decimal(dto.cost ?? 0),
        cafePrice: dto.cafePrice != null ? new Prisma.Decimal(dto.cafePrice) : null,
        active: dto.active ?? true,
        cafeId: cafeId!,
        branchId: branchId ?? null,
        isRefrigerated: dto.isRefrigerated ?? false,
        emoji: dto.emoji || '',
        refrigeratorStock: stockQty,
        lowStockThreshold: dto.lowStockThreshold ? Number(dto.lowStockThreshold) : 0,
        refrigeratorCategoryId: dto.refrigeratorCategoryId || null,
        refrigeratorInventoryId: inventoryId,
        recipe: dto.recipe && dto.recipe.length > 0 ? {
          create: dto.recipe.map(r => ({
            cafeId: cafeId!,
            inventoryId: r.inventoryId,
            quantity: new Prisma.Decimal(r.quantity),
            unit: r.unit || 'g',
            notes: r.notes || null,
          }))
        } : undefined,
      } as any,
      include: { categoryRel: true, refrigeratorCategory: true },
    });

    this.eventsService.emit('product.updated', {
      productId: product.id,
      name: product.name,
      action: 'created',
    });

    return product;
  }

  async updateProduct(id: string, dto: UpdateProductDto, cafeId?: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    this.verifyOwnership(existing, cafeId, 'المنتج');

    const priceChanged = dto.price != null && Number(dto.price) !== Number(existing.price);
    const costChanged = dto.cost != null && Number(dto.cost) !== Number(existing.cost);

    const product = await this.prisma.$transaction(async (tx) => {
      const toUpdate: Record<string, unknown> = {};
      if (dto.name !== undefined) toUpdate.name = dto.name;
      if (dto.category !== undefined) toUpdate.category = dto.category;
      if (dto.categoryId !== undefined) toUpdate.categoryId = dto.categoryId;
      if (dto.description !== undefined) toUpdate.description = dto.description;
      if (dto.price !== undefined) toUpdate.price = new Prisma.Decimal(dto.price);
      if (dto.cost !== undefined) toUpdate.cost = new Prisma.Decimal(dto.cost);
      if (dto.cafePrice !== undefined) toUpdate.cafePrice = dto.cafePrice != null ? new Prisma.Decimal(dto.cafePrice) : null;
      if (dto.active !== undefined) toUpdate.active = dto.active;
      if (dto.isRefrigerated !== undefined) toUpdate.isRefrigerated = dto.isRefrigerated;
      if (dto.emoji !== undefined) toUpdate.emoji = dto.emoji;
      if (dto.refrigeratorStock !== undefined) toUpdate.refrigeratorStock = Number(dto.refrigeratorStock);
      if (dto.lowStockThreshold !== undefined) toUpdate.lowStockThreshold = Number(dto.lowStockThreshold);
      if (dto.refrigeratorCategoryId !== undefined) toUpdate.refrigeratorCategoryId = dto.refrigeratorCategoryId;

      const updated = await tx.product.update({
        where: { id },
        data: toUpdate as any,
      });

      // Sync refrigerator stock to linked inventory
      if (dto.refrigeratorStock !== undefined && existing.refrigeratorInventoryId) {
        await tx.inventory.update({
          where: { id: existing.refrigeratorInventoryId },
          data: { currentQty: new Prisma.Decimal(Number(dto.refrigeratorStock)) },
        });
      }

      // If converting to refrigerated without an inventory link, create one
      if (dto.isRefrigerated === true && !existing.refrigeratorInventoryId) {
        const inv = await tx.inventory.create({
          data: {
            cafeId: cafeId!,
            branchId: existing.branchId ?? null,
            itemName: dto.name || existing.name,
            unit: 'piece',
            currentQty: new Prisma.Decimal(dto.refrigeratorStock ?? existing.refrigeratorStock),
            minThreshold: new Prisma.Decimal(dto.lowStockThreshold ?? existing.lowStockThreshold ?? 0),
            costPerUnit: new Prisma.Decimal(dto.cost ?? Number(existing.cost)),
          } as any,
        });
        await tx.product.update({
          where: { id },
          data: { refrigeratorInventoryId: inv.id },
        });
      }

      if (priceChanged || costChanged) {
        await tx.priceChangeLog.create({
          data: {
            cafeId: cafeId!,
            productId: id,
            oldPrice: priceChanged ? existing.price : new Prisma.Decimal(Number(existing.price)),
            newPrice: priceChanged ? new Prisma.Decimal(dto.price!) : existing.price,
            oldCost: costChanged ? existing.cost : null,
            newCost: costChanged ? new Prisma.Decimal(dto.cost!) : null,
            reason: priceChanged ? 'Price update' : 'Cost update',
          } as any,
        });
      }

      if (dto.recipe !== undefined) {
        await tx.recipeIngredient.deleteMany({
          where: { productId: id }
        });
        
        if (dto.recipe.length > 0) {
          await tx.recipeIngredient.createMany({
            data: dto.recipe.map(r => ({
              cafeId: cafeId!,
              productId: id,
              inventoryId: r.inventoryId,
              quantity: new Prisma.Decimal(r.quantity),
              unit: r.unit || 'g',
              wastePercent: r.wastePercent != null ? new Prisma.Decimal(r.wastePercent) : new Prisma.Decimal(0),
              emoji: r.emoji || null,
              notes: r.notes || null,
            }))
          });
        }

        const lastVer = await tx.recipeVersion.findFirst({
          where: { productId: id },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });
        const computed = await this.computeProductCost(id, cafeId);
        const fresh = await tx.product.findUnique({
          where: { id },
          include: { recipe: { include: { inventory: { select: { itemName: true, unit: true, costPerUnit: true } } } } },
        });
        await tx.recipeVersion.create({
          data: {
            cafeId: cafeId!,
            productId: id,
            versionNumber: (lastVer?.versionNumber ?? 0) + 1,
            snapshot: fresh?.recipe ?? [],
            totalCost: new Prisma.Decimal(computed),
          },
        });
      }

      return updated;
    });

    this.eventsService.emit('product.updated', {
      productId: product.id,
      name: product.name,
      action: 'updated',
      priceChanged,
      costChanged,
    });

    return this.findProduct(product.id);
  }

  async deactivateProduct(id: string, cafeId?: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    this.verifyOwnership(existing, cafeId, 'المنتج');

    const product = await this.prisma.product.update({
      where: { id },
      data: { active: false },
    });

    this.eventsService.emit('product.updated', {
      productId: product.id,
      name: product.name,
      action: 'deactivated',
    });

    return product;
  }

  async activateProduct(id: string, cafeId?: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    this.verifyOwnership(existing, cafeId, 'المنتج');

    const product = await this.prisma.product.update({
      where: { id },
      data: { active: true },
    });

    this.eventsService.emit('product.updated', {
      productId: product.id,
      name: product.name,
      action: 'activated',
    });

    return product;
  }

  async computeProductCost(id: string, cafeId?: string, sizeName?: string): Promise<number> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    this.verifyOwnership(product, cafeId, 'المنتج');

    const recipe = await this.prisma.recipeIngredient.findMany({
      where: { productId: id },
      include: { inventory: true },
    });

    const packaging = await this.prisma.packagingMaterial.findMany({
      where: { productId: id },
      include: { inventory: true },
    });

    const ingredients = recipe.map(r => ({
      quantity: Number(r.quantity),
      wastePercent: Number(r.wastePercent ?? 0),
      costPerUnit: Number(r.inventory.costPerUnit),
    }));

    const packagingInputs = packaging.map(p => ({
      quantity: Number(p.quantity),
      costPerUnit: Number(p.inventory.costPerUnit),
    }));

    const productCost = product ? Number(product.cost) : 0;

    let costPercent = 100;
    if (sizeName) {
      const size = await this.prisma.productSize.findUnique({
        where: { cafeId_productId_name: { cafeId: product!.cafeId, productId: id, name: sizeName } },
      });
      if (size) costPercent = Number(size.costPercent);
    }

    return sonexCore.computeProductCost(ingredients, packagingInputs, productCost, costPercent);
  }

  async recalculateCost(id: string, cafeId?: string) {
    const computedCost = await this.computeProductCost(id, cafeId);
    const product = await this.prisma.product.update({
      where: { id },
      data: { cost: new Prisma.Decimal(computedCost) },
    });

    this.eventsService.emit('product.updated', {
      productId: product.id,
      name: product.name,
      action: 'cost_recalculated',
      computedCost,
    });

    return product;
  }

  // ── RECIPE INGREDIENTS ──

  async getRecipe(productId: string, cafeId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    this.verifyOwnership(product, cafeId, 'المنتج');
    return this.prisma.recipeIngredient.findMany({
      where: { productId },
      include: { inventory: { select: { id: true, itemName: true, unit: true, costPerUnit: true } } },
      orderBy: { inventory: { itemName: 'asc' } },
    });
  }

  async setRecipe(productId: string, ingredients: RecipeIngredientDto[], cafeId?: string, branchId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    this.verifyOwnership(product, cafeId, 'المنتج');

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.recipeIngredient.deleteMany({ where: { productId } });

      if (ingredients.length > 0) {
        const inventoryIds = ingredients.map((i) => i.inventoryId);
        const inventories = await tx.inventory.findMany({ where: { id: { in: inventoryIds } } });
        if (inventories.length !== inventoryIds.length) {
          throw new BadRequestException('One or more inventory items not found');
        }

        await tx.recipeIngredient.createMany({
          data: ingredients.map((i) => ({
            cafeId: cafeId!,
            productId,
            inventoryId: i.inventoryId,
            quantity: new Prisma.Decimal(i.quantity),
            unit: i.unit ?? 'g',
            wastePercent: i.wastePercent != null ? new Prisma.Decimal(i.wastePercent) : new Prisma.Decimal(0),
            emoji: i.emoji || null,
            notes: i.notes || null,
          })),
        });
      }

      const updated = await tx.product.findUnique({
        where: { id: productId },
        include: { recipe: { include: { inventory: { select: { itemName: true, unit: true, costPerUnit: true } } } } },
      });

      const lastVersion = await tx.recipeVersion.findFirst({
        where: { productId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      const nextVersion = (lastVersion?.versionNumber ?? 0) + 1;
      const computedCost = await this.computeProductCost(productId, cafeId);
      await tx.recipeVersion.create({
        data: {
          cafeId: cafeId!,
          productId,
          versionNumber: nextVersion,
          snapshot: updated?.recipe ?? [],
          totalCost: new Prisma.Decimal(computedCost),
          createdBy: branchId || null,
        },
      });

      return updated;
    });

    await this.recalculateCost(productId);

    this.eventsService.emit('product.updated', {
      productId,
      name: product.name,
      action: 'recipe_updated',
    });

    return result;
  }

  async getRecipeVersions(productId: string, cafeId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    this.verifyOwnership(product, cafeId, 'المنتج');
    return this.prisma.recipeVersion.findMany({
      where: { productId },
      orderBy: { versionNumber: 'desc' },
      take: 20,
    });
  }

  // ── PRODUCT SIZES ──

  async getSizes(productId: string, cafeId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    this.verifyOwnership(product, cafeId, 'المنتج');
    return this.prisma.productSize.findMany({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async setSizes(productId: string, sizes: ProductSizeDto[], cafeId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    this.verifyOwnership(product, cafeId, 'المنتج');

    return this.prisma.$transaction(async (tx) => {
      await tx.productSize.deleteMany({ where: { productId } });
      if (sizes.length > 0) {
        await tx.productSize.createMany({
          data: sizes.map((s) => ({
            cafeId: cafeId!,
            productId,
            name: s.name,
            sortOrder: s.sortOrder ?? 0,
            priceAdjust: new Prisma.Decimal(s.priceAdjust ?? 0),
            costPercent: new Prisma.Decimal(s.costPercent ?? 100),
            active: s.active ?? true,
          })),
        });
      }
      return tx.productSize.findMany({ where: { productId }, orderBy: { sortOrder: 'asc' } });
    });
  }

  // ── ADD-ON INGREDIENTS ──

  async getAddOns(productId: string, cafeId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    this.verifyOwnership(product, cafeId, 'المنتج');
    return this.prisma.addOnIngredient.findMany({
      where: { productId, active: true },
      include: { inventory: { select: { id: true, itemName: true, unit: true, costPerUnit: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async setAddOns(productId: string, addOns: AddOnIngredientDto[], cafeId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    this.verifyOwnership(product, cafeId, 'المنتج');

    return this.prisma.$transaction(async (tx) => {
      await tx.addOnIngredient.deleteMany({ where: { productId } });
      if (addOns.length > 0) {
        const invIds = addOns.map((a) => a.inventoryId);
        const invs = await tx.inventory.findMany({ where: { id: { in: invIds } } });
        if (invs.length !== invIds.length) throw new BadRequestException('بعض أصناف المخزون غير موجودة');
        await tx.addOnIngredient.createMany({
          data: addOns.map((a) => ({
            cafeId: cafeId!,
            productId,
            name: a.name,
            price: new Prisma.Decimal(a.price),
            inventoryId: a.inventoryId,
            quantity: new Prisma.Decimal(a.quantity),
            unit: a.unit ?? 'g',
            active: a.active ?? true,
            sortOrder: a.sortOrder ?? 0,
          })),
        });
      }
      return tx.addOnIngredient.findMany({
        where: { productId, active: true },
        include: { inventory: { select: { id: true, itemName: true, unit: true, costPerUnit: true } } },
        orderBy: { sortOrder: 'asc' },
      });
    });
  }

  // ── PACKAGING MATERIALS ──

  async getPackaging(productId: string, cafeId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    this.verifyOwnership(product, cafeId, 'المنتج');
    return this.prisma.packagingMaterial.findMany({
      where: { productId },
      include: { inventory: { select: { id: true, itemName: true, unit: true, costPerUnit: true } } },
    });
  }

  async setPackaging(productId: string, materials: PackagingMaterialDto[], cafeId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    this.verifyOwnership(product, cafeId, 'المنتج');

    return this.prisma.$transaction(async (tx) => {
      await tx.packagingMaterial.deleteMany({ where: { productId } });
      if (materials.length > 0) {
        const invIds = materials.map((m) => m.inventoryId);
        const invs = await tx.inventory.findMany({ where: { id: { in: invIds } } });
        if (invs.length !== invIds.length) throw new BadRequestException('بعض أصناف المخزون غير موجودة');
        await tx.packagingMaterial.createMany({
          data: materials.map((m) => ({
            cafeId: cafeId!,
            productId,
            name: m.name,
            inventoryId: m.inventoryId,
            quantity: new Prisma.Decimal(m.quantity),
            unit: m.unit ?? 'piece',
          })),
        });
      }
      return tx.packagingMaterial.findMany({
        where: { productId },
        include: { inventory: { select: { id: true, itemName: true, unit: true, costPerUnit: true } } },
      });
    });
  }

  // ── COST SNAPSHOT ──

  async createCostSnapshot(productId: string, sellingPrice: number, cafeId?: string, orderItemId?: string, sizeName?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    this.verifyOwnership(product, cafeId, 'المنتج');

    const ingredientCost = await this.computeProductCost(productId, cafeId, sizeName);
    const packaging = await this.prisma.packagingMaterial.findMany({
      where: { productId },
      include: { inventory: true },
    });
    const packagingCost = packaging.reduce((s, p) => s + Number(p.quantity) * Number(p.inventory.costPerUnit), 0);

    return this.prisma.costSnapshot.create({
      data: {
        cafeId: cafeId!,
        productId,
        orderItemId: orderItemId || null,
        ingredientCost: new Prisma.Decimal(ingredientCost - packagingCost),
        packagingCost: new Prisma.Decimal(packagingCost),
        laborCost: new Prisma.Decimal(0),
        overheadCost: new Prisma.Decimal(0),
        totalCost: new Prisma.Decimal(ingredientCost),
        sellingPrice: new Prisma.Decimal(sellingPrice),
        sizeName: sizeName || null,
      },
    });
  }

  async getCostSnapshots(productId: string, cafeId?: string, limit = 50) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    this.verifyOwnership(product, cafeId, 'المنتج');
    return this.prisma.costSnapshot.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ── PRODUCT OPTIONS ──

  async getOptions(productId: string, cafeId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    this.verifyOwnership(product, cafeId, 'المنتج');
    return this.prisma.productOption.findMany({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async setOptions(productId: string, options: ProductOptionDto[], cafeId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    this.verifyOwnership(product, cafeId, 'المنتج');

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.productOption.deleteMany({ where: { productId } });

      if (options.length > 0) {
        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          await tx.productOption.create({
            data: {
              cafeId: cafeId!,
              productId,
              name: opt.name,
              required: opt.required ?? false,
              multiSelect: opt.multiSelect ?? false,
              choices: opt.choices as any,
              sortOrder: opt.sortOrder ?? i,
            } as any,
          });
        }
      }

      return tx.productOption.findMany({
        where: { productId },
        orderBy: { sortOrder: 'asc' },
      });
    });

    this.eventsService.emit('product.updated', {
      productId,
      name: product.name,
      action: 'options_updated',
    });

    return result;
  }

  // ── CATEGORIES ──

  async findAllCategories(includeInactive = false, cafeId?: string) {
    const where: any = {};
    if (cafeId) {
      where.cafeId = cafeId;
    }
    if (!includeInactive) where.active = true;
    return this.prisma.productCategory.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      include: { products: { where: { active: true }, select: { id: true, name: true } } },
    });
  }

  async createCategory(dto: CreateCategoryDto, cafeId?: string, branchId?: string) {
    await this.validateCafe(cafeId);

    const existing = await this.prisma.productCategory.findFirst({
      where: { cafeId, branchId: branchId ?? null, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`التصنيف "${dto.name}" موجود بالفعل`);
    }

    const code = await generateEntityCode(this.prisma, cafeId!, 'productCategory');

    const category = await this.prisma.productCategory.create({
      data: {
        name: dto.name,
        code,
        icon: dto.icon || null,
        color: dto.color || null,
        sortOrder: dto.sortOrder ?? 0,
        cafeId: cafeId!,
        branchId: branchId ?? null,
      } as any,
    });

    this.eventEmitter.emit('audit.log', {
      cafeId: cafeId ?? '',
      action: 'CATEGORY_CREATE',
      entityType: 'Category',
      entityId: category.id,
    });
    this.eventsService.emit('category.updated', { action: 'created', category });
    return category;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, cafeId?: string) {
    const existing = await this.prisma.productCategory.findUnique({ where: { id } });
    this.verifyOwnership(existing, cafeId, 'التصنيف');

    if (dto.name !== undefined && dto.name !== existing.name) {
      const dup = await this.prisma.productCategory.findFirst({
        where: { cafeId: existing.cafeId, branchId: existing.branchId, name: dto.name, id: { not: id } },
      });
      if (dup) throw new ConflictException(`التصنيف "${dto.name}" موجود بالفعل`);
    }

    const category = await this.prisma.productCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
      include: { products: { select: { id: true, name: true } } },
    });

    this.eventEmitter.emit('audit.log', {
      cafeId: cafeId ?? '',
      action: 'CATEGORY_UPDATE',
      entityType: 'Category',
      entityId: category.id,
    });
    this.eventsService.emit('category.updated', { action: 'updated', category });
    return category;
  }

  // ── PRICE CHANGE HISTORY ──

  async getPriceHistory(productId: string, cafeId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    this.verifyOwnership(product, cafeId, 'المنتج');
    return this.prisma.priceChangeLog.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { changedBy: { select: { id: true, name: true } } },
    });
  }

  // ── AI GROUNDING ──

  async getActiveProducts(cafeId?: string) {
    const where: any = { active: true };
    if (cafeId) {
      where.cafeId = cafeId;
    }
    return this.prisma.product.findMany({
      where,
      include: {
        categoryRel: true,
        recipe: {
          include: { inventory: true },
        },
      },
    });
  }

  async buildAIProductContext(cafeId?: string) {
    const where: any = { active: true };
    if (cafeId) {
      where.cafeId = cafeId;
    }
    return this.prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        category: true,
        price: true,
        isRefrigerated: true,
        refrigeratorStock: true,
        refrigeratorInventoryId: true,
      },
    });
  }

  // ── INVENTORY DEDUCTION (recipe-based) ──

  async deductRecipeStock(orderId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    for (const item of order.items) {
      const recipe = await db.recipeIngredient.findMany({
        where: { productId: item.productId },
      });

      if (recipe.length === 0) continue;

      for (const r of recipe) {
        const totalNeeded = new Prisma.Decimal(Number(r.quantity) * item.quantity);

        const inv = await db.inventory.findUnique({ where: { id: r.inventoryId } });
        if (!inv) continue;

        if (inv.currentQty.lt(totalNeeded)) {
          throw new BadRequestException(
            `Insufficient stock for ${inv.itemName}. Available: ${inv.currentQty.toString()}, needed: ${totalNeeded.toString()}`,
          );
        }

        await db.inventory.update({
          where: { id: r.inventoryId },
          data: { currentQty: { decrement: totalNeeded } },
        });
      }
    }
  }

  // ── ENHANCED PRODUCT COSTING ENGINE ──

  async getCostBreakdown(productId: string, cafeId?: string, from?: string, to?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    this.verifyOwnership(product, cafeId, 'المنتج');

    const dateFrom = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const dateTo = to ? new Date(to) : new Date();

    const recipe = await this.prisma.recipeIngredient.findMany({
      where: { productId },
      include: { inventory: { select: { costPerUnit: true, unit: true, itemName: true } } },
    });
    const ingredientBreakdown = recipe.map(r => ({
      itemName: r.inventory.itemName,
      quantity: Number(r.quantity),
      unit: r.unit,
      costPerUnit: Number(r.inventory.costPerUnit),
      total: Number(r.quantity) * Number(r.inventory.costPerUnit),
    }));

    const totalOrders = await this.prisma.order.count({
      where: { cafeId, createdAt: { gte: dateFrom, lte: dateTo } },
    });
    const staffAttendances = await this.prisma.attendance.findMany({
      where: { cafeId, date: { gte: dateFrom, lte: dateTo }, status: 'COMPLETED' },
      include: { staff: { select: { salary: true, salaryType: true, hourlyWage: true } } },
    });
    const totalLaborCost = staffAttendances.reduce((sum, a) => {
      if (!a.staff) return sum;
      const hours = Number(a.totalHours ?? 0);
      if (a.staff.salaryType === 'HOURLY') {
        return sum + hours * Number(a.staff.hourlyWage ?? a.staff.salary);
      } else if (a.staff.salaryType === 'DAILY') {
        return sum + Number(a.staff.salary);
      } else {
        const daysInMonth = new Date(a.date.getFullYear(), a.date.getMonth() + 1, 0).getDate();
        return sum + Number(a.staff.salary) / daysInMonth;
      }
    }, 0);
    const totalItemsSold = await this.prisma.orderItem.count({
      where: { product: { cafeId }, order: { createdAt: { gte: dateFrom, lte: dateTo } } },
    });
    const productOrderCount = await this.prisma.orderItem.count({
      where: { productId, order: { createdAt: { gte: dateFrom, lte: dateTo } } },
    });

    const totalExpenses = await this.prisma.expense.aggregate({
      where: { cafeId, expenseDate: { gte: dateFrom, lte: dateTo } },
      _sum: { amount: true },
    });
    const totalOperationalExpenses = Number(totalExpenses._sum.amount ?? 0);

    const utilityExpenses = await this.prisma.expense.aggregate({
      where: { cafeId, category: { in: ['كهرباء', 'مياه', 'غاز', 'Utilities', 'utility'] }, expenseDate: { gte: dateFrom, lte: dateTo } },
      _sum: { amount: true },
    });
    const totalUtilityCost = Number(utilityExpenses._sum.amount ?? 0);

    const result = sonexCore.computeCostBreakdown({
      productId,
      productName: product?.name ?? '',
      sellingPrice: Number(product?.price ?? 0),
      ingredients: ingredientBreakdown,
      totalLaborCost,
      totalOrders: totalOrders,
      productOrderCount,
      totalItemsSold,
      totalOperationalExpenses,
      totalUtilityCost,
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
    });

    return {
      productId: result.productId,
      productName: result.productName,
      sellingPrice: result.sellingPrice,
      estimatedCost: result.estimatedCost,
      estimatedProfit: result.estimatedProfit,
      profitMargin: result.profitMargin,
      breakdown: {
        ingredientCost: result.ingredientCost,
        ingredientBreakdown: result.ingredientBreakdown,
        laborCost: result.laborCost,
        laborDetails: {
          totalLaborCostPeriod: result.laborDetails.totalLaborCostPeriod,
          totalOrdersInPeriod: result.laborDetails.totalOrdersInPeriod,
          productOrderCount: result.laborDetails.productOrderCount,
        },
        operationalCost: result.operationalCost,
        utilityCost: result.utilityCost,
        miscellaneousCost: result.miscellaneousCost,
      },
      dateRange: {
        from: result.dateRange.from,
        to: result.dateRange.to,
      },
    };
  }

  async getProductProfitability(cafeId: string, from?: string, to?: string) {
    const products = await this.prisma.product.findMany({ where: { cafeId, active: true } });
    const breakdowns = await Promise.all(products.map(p => this.getCostBreakdown(p.id, cafeId, from, to)));
    const sortedByMargin = [...breakdowns].sort((a, b) => b.profitMargin - a.profitMargin);
    const sortedByProfit = [...breakdowns].sort((a, b) => b.estimatedProfit - a.estimatedProfit);
    return {
      products: breakdowns,
      mostProfitableByMargin: sortedByMargin.slice(0, 10),
      mostProfitableByProfit: sortedByProfit.slice(0, 10),
      leastProfitableByMargin: sortedByMargin.slice(-10).reverse(),
      leastProfitableByProfit: sortedByProfit.slice(-10).reverse(),
    };
  }

  async deleteCategory(id: string, cafeId?: string) {
    const existing = await this.prisma.productCategory.findUnique({ where: { id } });
    this.verifyOwnership(existing, cafeId, 'التصنيف');

    await this.prisma.product.updateMany({
      where: { categoryId: id },
      data: { categoryId: null },
    });

    const category = await this.prisma.productCategory.delete({
      where: { id },
    });

    this.eventEmitter.emit('audit.log', {
      cafeId: cafeId ?? '',
      action: 'CATEGORY_DELETE',
      entityType: 'Category',
      entityId: id,
    });
    this.eventsService.emit('category.updated', { action: 'deleted', categoryId: id, category: { id, name: existing.name } });
    return category;
  }

  // ── REFRIGERATOR CATEGORIES ──

  async findAllRefrigeratorCategories(includeInactive = false, cafeId?: string) {
    const where: any = {};
    if (cafeId) {
      where.cafeId = cafeId;
    }
    if (!includeInactive) where.active = true;
    return this.prisma.refrigeratorCategory.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  }

  async createRefrigeratorCategory(dto: CreateRefrigeratorCategoryDto, cafeId?: string) {
    await this.validateCafe(cafeId);

    const category = await this.prisma.refrigeratorCategory.create({
      data: {
        name: dto.name,
        emoji: dto.emoji || '🥤',
        cafeId: cafeId!,
      } as any,
    });

    this.eventEmitter.emit('audit.log', {
      cafeId: cafeId ?? '',
      action: 'CATEGORY_CREATE',
      entityType: 'RefrigeratorCategory',
      entityId: category.id,
    });

    return category;
  }

  async updateRefrigeratorCategory(id: string, dto: UpdateRefrigeratorCategoryDto, cafeId?: string) {
    const existing = await this.prisma.refrigeratorCategory.findUnique({ where: { id } });
    this.verifyOwnership(existing, cafeId, 'تصنيف الثلاجة');

    const category = await this.prisma.refrigeratorCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.emoji !== undefined && { emoji: dto.emoji }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });

    this.eventEmitter.emit('audit.log', {
      cafeId: cafeId ?? '',
      action: 'CATEGORY_UPDATE',
      entityType: 'RefrigeratorCategory',
      entityId: category.id,
    });

    return category;
  }

  async deleteRefrigeratorCategory(id: string, cafeId?: string) {
    const existing = await this.prisma.refrigeratorCategory.findUnique({ where: { id } });
    this.verifyOwnership(existing, cafeId, 'تصنيف الثلاجة');

    // Remove category link from products
    await this.prisma.product.updateMany({
      where: { refrigeratorCategoryId: id },
      data: { refrigeratorCategoryId: null },
    });

    const category = await this.prisma.refrigeratorCategory.delete({
      where: { id },
    });

    this.eventEmitter.emit('audit.log', {
      cafeId: cafeId ?? '',
      action: 'CATEGORY_DELETE',
      entityType: 'RefrigeratorCategory',
      entityId: id,
    });

    return category;
  }

  // ─── Generic Catalog ────────────────────────────────────────

  async updateProductCatalog(id: string, cafeId: string, data: Partial<{
    images: any[]; attributes: any[]; tags: string[];
    variants: any[]; availability: any;
  }>) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    this.verifyOwnership(product, cafeId, 'المنتج');
    if (!product) throw new NotFoundException('Product not found');

    const updateData: any = {};
    if (data.images !== undefined) updateData.images = data.images;
    if (data.attributes !== undefined) updateData.attributes = data.attributes;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.variants !== undefined) updateData.variants = data.variants;
    if (data.availability !== undefined) updateData.availability = data.availability;

    return this.prisma.product.update({ where: { id }, data: updateData });
  }

  async getProductCatalog(id: string, cafeId?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { options: true, sizes: true },
    });
    this.verifyOwnership(product, cafeId, 'المنتج');
    if (!product) throw new NotFoundException('Product not found');

    return {
      id: product.id,
      name: product.name,
      price: Number(product.price),
      description: product.description,
      categoryId: product.categoryId,
      emoji: product.emoji,
      active: product.active,
      images: product.images as any[],
      attributes: product.attributes as any[],
      tags: product.tags as string[],
      variants: product.variants as any[],
      availability: product.availability as any,
      options: product.options,
      sizes: product.sizes,
    };
  }

  async listCatalog(cafeId?: string, filters?: { tag?: string; categoryId?: string; search?: string }) {
    const where: any = { cafeId, active: true };

    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    let products = await this.prisma.product.findMany({
      where,
      include: { options: true, sizes: true, categoryRel: true },
      orderBy: { name: 'asc' },
    });

    if (filters?.tag) {
      products = products.filter(p => {
        const tags = (p.tags as string[]) || [];
        return tags.some(t => t.toLowerCase() === filters.tag!.toLowerCase());
      });
    }

    return products.map(p => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      description: p.description,
      emoji: p.emoji,
      category: p.categoryRel?.name || p.category,
      images: p.images as any[],
      attributes: p.attributes as any[],
      tags: p.tags as string[],
      variants: p.variants as any[],
      options: p.options,
      sizes: p.sizes,
      active: p.active,
    }));
  }
}

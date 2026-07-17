import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductManagementService } from '../product-management/product-management.service';
import { RecipeIngredientDto } from '../product-management/dto/product.dto';
import { InventoryService } from '../inventory/inventory.service';
import { StaffService } from '../staff/staff.service';
import { AiMenuParserService } from './ai-menu-parser.service';
import {
  SaveStep1Dto, SaveStep3Dto, SaveStep4Dto,
  SaveStep5Dto, SaveStep6Dto, SaveStep7Dto, SaveStep8Dto,
} from './dto/onboarding.dto';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productManagement: ProductManagementService,
    private readonly inventoryService: InventoryService,
    private readonly staffService: StaffService,
    private readonly aiMenuParser: AiMenuParserService,
  ) {}

  async getSession(cafeId: string) {
    let session = await this.prisma.onboardingSession.findUnique({ where: { cafeId } });
    if (!session) {
      session = await this.prisma.onboardingSession.create({
        data: { cafeId, currentStep: 0, status: 'PENDING' },
      });
    }
    return session;
  }

  async saveStep(cafeId: string, step: number, data: any) {
    const session = await this.prisma.onboardingSession.findUnique({ where: { cafeId } });
    if (!session) throw new NotFoundException('No onboarding session found');

    const existingStepData = (session.stepData as any) || {};
    existingStepData[`step${step}`] = data;

    const completed = (session.completedSteps as number[]) || [];
    if (!completed.includes(step)) {
      completed.push(step);
    }

    const nextStep = Math.min(step + 1, 9);

    return this.prisma.onboardingSession.update({
      where: { cafeId },
      data: {
        currentStep: nextStep,
        stepData: existingStepData,
        completedSteps: completed,
        status: 'IN_PROGRESS',
      },
    });
  }

  async submitStep1(cafeId: string, dto: SaveStep1Dto) {
    const updateData: any = {};
    if (dto.businessName) updateData.name = dto.businessName;
    if (dto.currency) updateData.currency = dto.currency;
    if (dto.timezone) updateData.timezone = dto.timezone;
    if (dto.logo) updateData.logo = dto.logo;

    await this.prisma.cafe.update({ where: { id: cafeId }, data: updateData });

    if (dto.branches && dto.branches.length > 0) {
      const existingBranches = await this.prisma.branch.findMany({
        where: { cafeId }, select: { id: true },
      });
      if (existingBranches.length === 0) {
        for (const b of dto.branches) {
          await this.prisma.branch.create({
            data: {
              cafeId,
              name: b.name,
              slug: b.slug || b.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
              location: b.location,
              phone: b.phone,
            },
          });
        }
      }
    }

    return { success: true };
  }

  async importMenu(cafeId: string, text: string) {
    return this.aiMenuParser.parseMenuText(text);
  }

  async submitStep3(cafeId: string, dto: SaveStep3Dto) {
    const cafe = await this.prisma.cafe.findUnique({ where: { id: cafeId } });
    if (!cafe) throw new NotFoundException('Cafe not found');

    const branch = await this.prisma.branch.findFirst({
      where: { cafeId, active: true },
    });
    if (!branch) throw new BadRequestException('No active branch found');

    const defaultCategory = await this.prisma.productCategory.findFirst({
      where: { cafeId },
      orderBy: { sortOrder: 'asc' },
    });

    const created: any[] = [];
    for (const p of dto.products) {
      const product = await this.productManagement.createProduct({
        name: p.name,
        price: p.price,
        description: p.description,
        categoryId: defaultCategory?.id,
        emoji: p.emoji,
        cafeId,
        branchId: branch.id,
      } as any, cafeId);
      created.push({ id: product.id, name: product.name, price: product.price });
    }

    return { count: created.length, products: created };
  }

  async submitStep4(cafeId: string, dto: SaveStep4Dto) {
    const branch = await this.prisma.branch.findFirst({
      where: { cafeId, active: true },
    });
    if (!branch) throw new BadRequestException('No active branch found');

    const created: any[] = [];
    for (const item of dto.items) {
      try {
        const inv = await this.inventoryService.create({
          itemName: item.name,
          unit: item.unit,
          currentQty: item.currentQty,
          minThreshold: item.minThreshold,
          costPerUnit: item.costPerUnit,
          emoji: item.emoji,
          cafeId,
          branchId: branch.id,
        });
        created.push({ id: inv.id, name: inv.itemName });

        if (item.supplierName) {
          const existing = await this.prisma.supplier.findFirst({
            where: { cafeId, name: item.supplierName },
          });
          if (!existing) {
            await this.prisma.supplier.create({
              data: { cafeId, name: item.supplierName },
            });
          }
        }
      } catch (err) {
        this.logger.warn(`Failed to create inventory item "${item.name}": ${(err as Error).message}`);
      }
    }

    return { count: created.length };
  }

  async submitStep5(cafeId: string, dto: SaveStep5Dto) {
    const grouped = new Map<string, any[]>();
    for (const r of dto.recipes) {
      const arr = grouped.get(r.productId) || [];
      arr.push({ inventoryId: r.inventoryId, quantity: r.quantity, unit: r.unit || 'g' });
      grouped.set(r.productId, arr);
    }

    let count = 0;
    for (const [productId, ingredients] of grouped) {
      try {
        await this.productManagement.setRecipe(productId, ingredients as RecipeIngredientDto[], cafeId);
        count += ingredients.length;
      } catch (err) {
        this.logger.warn(`Failed to set recipe for product ${productId}: ${(err as Error).message}`);
      }
    }

    return { recipeCount: count, productCount: grouped.size };
  }

  async submitStep6(cafeId: string, dto: SaveStep6Dto) {
    let count = 0;
    for (const t of dto.taxes) {
      await this.prisma.tax.create({
        data: {
          cafeId,
          name: t.name,
          rate: t.rate,
          type: t.type || 'PERCENTAGE',
          sortOrder: count,
        },
      });
      count++;
    }
    return { count };
  }

  async submitStep7(cafeId: string, dto: SaveStep7Dto) {
    let count = 0;
    for (const m of dto.methods) {
      await this.prisma.paymentMethod.create({
        data: {
          cafeId,
          name: m.name,
          type: m.type || 'CASH',
          sortOrder: count,
        },
      });
      count++;
    }
    return { count };
  }

  async submitStep8(cafeId: string, dto: SaveStep8Dto) {
    const branch = await this.prisma.branch.findFirst({
      where: { cafeId, active: true },
    });
    if (!branch) throw new BadRequestException('No active branch found');

    const owner = await this.prisma.staff.findFirst({
      where: { cafeId, role: 'OWNER' },
    });

    const created: any[] = [];
    for (const e of dto.employees) {
      try {
        const staff = await this.staffService.create({
          name: e.name,
          role: e.role,
          phone: e.phone,
          salary: e.salary,
          salaryType: e.salaryType,
          loginCode: e.loginCode,
        }, cafeId, owner?.id);
        created.push({ id: staff.id, name: staff.name, role: staff.role });
      } catch (err) {
        this.logger.warn(`Failed to create staff "${e.name}": ${(err as Error).message}`);
      }
    }

    return { count: created.length, employees: created };
  }

  async getReadinessReport(cafeId: string) {
    const [
      cafe, products, inventoryItems, taxes,
      paymentMethods, staff, suppliers, recipes,
    ] = await Promise.all([
      this.prisma.cafe.findUnique({ where: { id: cafeId } }),
      this.prisma.product.findMany({ where: { cafeId, active: true } }),
      this.prisma.inventory.findMany({ where: { cafeId } }),
      this.prisma.tax.findMany({ where: { cafeId } }),
      this.prisma.paymentMethod.findMany({ where: { cafeId } }),
      this.prisma.staff.findMany({ where: { cafeId, active: true, role: { not: 'OWNER' } } }),
      this.prisma.supplier.findMany({ where: { cafeId } }),
      this.prisma.recipeIngredient.findMany({ where: { cafeId } }),
    ]);

    const productsWithRecipes = new Set(recipes.map(r => r.productId));
    const productsMissingRecipes = products.filter(p => !productsWithRecipes.has(p.id));
    const productsMissingPrice = products.filter(p => Number(p.price) <= 0);

    return {
      summary: {
        productsCreated: products.length,
        recipesCompleted: productsWithRecipes.size,
        recipesMissing: productsMissingRecipes.length,
        productsMissingPrice: productsMissingPrice.length,
        inventoryItems: inventoryItems.length,
        suppliers: suppliers.length,
        taxesConfigured: taxes.length,
        paymentMethods: paymentMethods.length,
        employeesAdded: staff.length,
      },
      details: {
        products: products.map(p => ({ id: p.id, name: p.name, price: Number(p.price), hasRecipe: productsWithRecipes.has(p.id) })),
        inventoryItems: inventoryItems.map(i => ({ id: i.id, name: i.itemName, currentQty: Number(i.currentQty), unit: i.unit })),
        productsMissingRecipes: productsMissingRecipes.map(p => ({ id: p.id, name: p.name })),
        productsMissingPrice: productsMissingPrice.map(p => ({ id: p.id, name: p.name })),
        suppliers: suppliers.map(s => ({ id: s.id, name: s.name })),
        missingSuppliers: inventoryItems.filter(i => !i.itemName.toLowerCase().includes('supplier')),
        taxes,
        paymentMethods,
        employees: staff.map(s => ({ id: s.id, name: s.name, role: s.role })),
      },
      allComplete: products.length > 0
        && productsMissingRecipes.length === 0
        && productsMissingPrice.length === 0
        && inventoryItems.length > 0
        && taxes.length > 0
        && paymentMethods.length > 0,
    };
  }

  async complete(cafeId: string) {
    return this.prisma.onboardingSession.update({
      where: { cafeId },
      data: { currentStep: 9, status: 'COMPLETED' },
    });
  }
}

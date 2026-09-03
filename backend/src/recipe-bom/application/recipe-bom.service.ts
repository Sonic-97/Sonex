import { Inject, Injectable } from '@nestjs/common';
import { IRecipeBOMRepository } from '../domain/repositories/recipe-bom.repository.interface';
import { RecipeBOM } from '../domain/recipe-bom.entity';
import { Result } from '../../common/result';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

export interface BOMDeductionRequest {
  productId: string;
  productName: string;
  quantity: number;
}

export interface MaterialDeductionResult {
  inventoryId: string;
  itemName: string;
  deductedQuantity: number;
  unit: string;
}

@Injectable()
export class RecipeBOMService {
  constructor(
    @Inject('IRecipeBOMRepository')
    private readonly repo: IRecipeBOMRepository,
    private readonly prisma: PrismaService,
  ) {}

  async setProductRecipeBOM(
    productId: string,
    inventoryId: string,
    quantity: number,
    unit: string,
  ): Promise<Result<RecipeBOM>> {
    try {
      const bom = new RecipeBOM({
        id: uuidv4(),
        productId,
        inventoryId,
        quantity,
        unit,
      });
      const saved = await this.repo.save(bom);
      return Result.ok(saved);
    } catch (err: any) {
      return Result.fail(`Failed to set Recipe BOM: ${err.message}`);
    }
  }

  async getRecipeBOMs(productId: string): Promise<Result<RecipeBOM[]>> {
    try {
      const boms = await this.repo.findByProductId(productId);
      return Result.ok(boms);
    } catch (err: any) {
      return Result.fail(`Failed to get Recipe BOMs: ${err.message}`);
    }
  }

  async processOrderRecipeDeductions(
    cafeId: string,
    branchId: string,
    orderId: string,
    orderItems: BOMDeductionRequest[],
  ): Promise<Result<MaterialDeductionResult[]>> {
    try {
      const results: MaterialDeductionResult[] = [];

      for (const item of orderItems) {
        const boms = await this.repo.findByProductId(item.productId);
        for (const bom of boms) {
          const neededQty = bom.calculateDeduction(item.quantity);

          // Find inventory item
          const inv = await this.prisma.inventory.findUnique({
            where: { id: bom.inventoryId },
          });

          if (!inv) continue;

          // Deduct from currentQty
          const updated = await this.prisma.inventory.update({
            where: { id: bom.inventoryId },
            data: {
              currentQty: {
                decrement: neededQty,
              },
            },
          });

          // Log consumption
          await this.prisma.inventoryConsumption.create({
            data: {
              cafeId,
              inventoryId: bom.inventoryId,
              orderId,
              productId: item.productId,
              productName: item.productName,
              quantity: neededQty,
              unit: bom.unit,
              costPerUnit: inv.costPerUnit,
              totalCost: Number(inv.costPerUnit) * neededQty,
            },
          });

          results.push({
            inventoryId: bom.inventoryId,
            itemName: inv.itemName,
            deductedQuantity: neededQty,
            unit: bom.unit,
          });
        }
      }

      return Result.ok(results);
    } catch (err: any) {
      return Result.fail(`Failed to process BOM deductions: ${err.message}`);
    }
  }
}

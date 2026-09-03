import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { IRecipeBOMRepository } from '../../domain/repositories/recipe-bom.repository.interface';
import { RecipeBOM } from '../../domain/recipe-bom.entity';

@Injectable()
export class PrismaRecipeBOMRepository implements IRecipeBOMRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByProductId(productId: string): Promise<RecipeBOM[]> {
    const raws = await this.prisma.recipeBOM.findMany({
      where: { productId },
    });

    return raws.map(
      (raw) =>
        new RecipeBOM({
          id: raw.id,
          productId: raw.productId,
          inventoryId: raw.inventoryId,
          quantity: Number(raw.quantity),
          unit: raw.unit,
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
        }),
    );
  }

  async save(bom: RecipeBOM): Promise<RecipeBOM> {
    const raw = await this.prisma.recipeBOM.upsert({
      where: {
        productId_inventoryId: {
          productId: bom.productId,
          inventoryId: bom.inventoryId,
        },
      },
      create: {
        id: bom.id,
        productId: bom.productId,
        inventoryId: bom.inventoryId,
        quantity: bom.quantity,
        unit: bom.unit,
      },
      update: {
        quantity: bom.quantity,
        unit: bom.unit,
      },
    });

    return new RecipeBOM({
      id: raw.id,
      productId: raw.productId,
      inventoryId: raw.inventoryId,
      quantity: Number(raw.quantity),
      unit: raw.unit,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.recipeBOM.delete({ where: { id } });
  }
}

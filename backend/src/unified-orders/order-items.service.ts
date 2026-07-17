import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ItemInput {
  productId: string;
  quantity: number;
  unitPrice?: number;
  discountAmount?: number;
  notes?: string;
  modifiers?: string[];
  addons?: string[];
}

export interface ItemSnapshot {
  productId: string;
  productName: string;
  productPrice: Prisma.Decimal;
  categoryId?: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  notes: string | null;
}

@Injectable()
export class OrderItemsService {
  private readonly logger = new Logger(OrderItemsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveAndSnapshot(
    items: ItemInput[],
    cafeId: string,
    branchId: string,
  ): Promise<{
    snapshots: ItemSnapshot[];
    total: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    productMap: Map<string, any>;
  }> {
    if (!items?.length) {
      throw new BadRequestException('Order must contain at least one item');
    }

    const productIds = [...new Set(items.map(i => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, active: true, cafeId },
    });

    const found = new Set(products.map(p => p.id));
    const missing = productIds.filter(id => !found.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`Products not found or inactive: ${missing.join(', ')}`);
    }

    const productMap = new Map(products.map(p => [p.id, p]));
    const snapshots: ItemSnapshot[] = [];
    let subtotal = new Prisma.Decimal(0);
    let discountTotal = new Prisma.Decimal(0);

    for (const item of items) {
      const product = productMap.get(item.productId)!;
      const unitPrice = item.unitPrice != null
        ? new Prisma.Decimal(item.unitPrice)
        : product.cafePrice ?? product.price;

      const discountAmount = item.discountAmount != null
        ? new Prisma.Decimal(item.discountAmount)
        : new Prisma.Decimal(0);

      const lineTotal = unitPrice.mul(item.quantity);
      subtotal = subtotal.plus(lineTotal);
      discountTotal = discountTotal.plus(discountAmount);

      snapshots.push({
        productId: item.productId,
        productName: product.name,
        productPrice: product.price,
        categoryId: product.categoryId,
        quantity: item.quantity,
        unitPrice,
        discountAmount,
        subtotal: lineTotal,
        notes: item.notes ?? null,
      });
    }

    const total = subtotal.minus(discountTotal);

    return { snapshots, total, subtotal, discountTotal, productMap };
  }

  buildUnifiedOrderItemData(
    orderId: string,
    cafeId: string,
    branchId: string,
    snapshot: ItemSnapshot,
  ): Prisma.UnifiedOrderItemCreateManyInput {
    return {
      cafeId,
      branchId,
      orderId,
      productId: snapshot.productId,
      quantity: snapshot.quantity,
      unitPrice: snapshot.unitPrice,
      discountAmount: snapshot.discountAmount,
      notes: snapshot.notes,
      preparationStatus: 'PENDING',
    };
  }

  async createItems(
    tx: Prisma.TransactionClient,
    orderId: string,
    cafeId: string,
    branchId: string,
    snapshots: ItemSnapshot[],
  ): Promise<void> {
    const data = snapshots.map(s => this.buildUnifiedOrderItemData(orderId, cafeId, branchId, s));
    await tx.unifiedOrderItem.createMany({ data });
  }
}

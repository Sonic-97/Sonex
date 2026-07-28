import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductCatalogRepository } from '../application/product-catalog.repository';
import { ProductCatalogRecord, ProductCatalogScope } from '../application/product-catalog.record';
import { ProductId } from '../domain/product-resolution.types';

interface DecimalValue { toString(): string; }
interface PrismaCatalogRow {
  readonly id: string; readonly cafeId: string; readonly branchId: string | null; readonly name: string; readonly code: string | null;
  readonly price: DecimalValue; readonly active: boolean; readonly attributes: unknown; readonly tags: unknown; readonly images: unknown; readonly availability: unknown;
  readonly sizes: readonly { readonly id: string; readonly name: string; readonly priceAdjust: DecimalValue; readonly active: boolean; }[];
  readonly options: readonly { readonly id: string; readonly name: string; readonly required: boolean; readonly multiSelect: boolean; readonly choices: unknown; }[];
  readonly branchProducts: readonly { readonly price: DecimalValue; readonly isAvailable: boolean; }[];
}

interface ProductCatalogPrismaPort {
  readonly product: { findFirst(args: object): Promise<PrismaCatalogRow | null>; };
}

@Injectable()
export class PrismaProductCatalogRepository implements ProductCatalogRepository {
  constructor(@Inject(PrismaService) private readonly prisma: ProductCatalogPrismaPort) {}

  async findById(scope: ProductCatalogScope, productId: ProductId): Promise<ProductCatalogRecord | null> {
    const branchId = scope.branchId ? String(scope.branchId) : undefined;
    const product = await this.prisma.product.findFirst({
      where: {
        id: String(productId),
        cafeId: scope.cafeId,
        ...(branchId ? { OR: [{ branchId: null }, { branchId }] } : { branchId: null }),
      },
      select: {
        id: true,
        cafeId: true,
        branchId: true,
        name: true,
        code: true,
        price: true,
        active: true,
        attributes: true,
        tags: true,
        images: true,
        availability: true,
        sizes: { select: { id: true, name: true, priceAdjust: true, active: true }, orderBy: { sortOrder: 'asc' } },
        options: { select: { id: true, name: true, required: true, multiSelect: true, choices: true }, orderBy: { sortOrder: 'asc' } },
        branchProducts: { where: { cafeId: scope.cafeId, branchId: branchId ?? '' }, select: { price: true, isAvailable: true }, take: 1 },
      },
    });
    if (!product) return null;
    const branchOverride = product.branchProducts[0];
    return {
      id: product.id,
      cafeId: product.cafeId,
      branchId: product.branchId,
      name: product.name,
      code: product.code,
      price: product.price.toString(),
      active: product.active,
      attributes: product.attributes,
      tags: product.tags,
      images: product.images,
      availability: product.availability,
      sizes: product.sizes.map((size) => ({ id: size.id, name: size.name, priceAdjustment: size.priceAdjust.toString(), active: size.active })),
      options: product.options.map((option) => ({ id: option.id, name: option.name, required: option.required, multiSelect: option.multiSelect, choices: option.choices })),
      ...(branchOverride ? { branchOverride: { price: branchOverride.price.toString(), isAvailable: branchOverride.isAvailable } } : {}),
    };
  }
}

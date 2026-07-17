import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PRODUCT_UNDERSTANDING_TAGS,
  ProductUnderstandingTag,
} from './customer-need.types';

const VALID_TAGS = new Set<string>(PRODUCT_UNDERSTANDING_TAGS);

@Injectable()
export class ProductUnderstandingTagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  parse(value: unknown): ProductUnderstandingTag[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((tag): tag is ProductUnderstandingTag => typeof tag === 'string' && VALID_TAGS.has(tag)))];
  }

  validate(tags: unknown): ProductUnderstandingTag[] {
    if (!Array.isArray(tags)) throw new BadRequestException('tags must be an array');
    const invalid = tags.filter((tag) => typeof tag !== 'string' || !VALID_TAGS.has(tag));
    if (invalid.length) throw new BadRequestException(`Unsupported product understanding tags: ${invalid.join(', ')}`);
    return [...new Set(tags as ProductUnderstandingTag[])];
  }

  async list(cafeId: string, branchId?: string) {
    const products = await this.prisma.product.findMany({
      where: {
        cafeId,
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, active: true, branchId: true, understandingTags: true },
    });
    return products.map((product) => ({ ...product, understandingTags: this.parse(product.understandingTags) }));
  }

  async replace(
    cafeId: string,
    productId: string,
    tagsInput: unknown,
    actor: { id?: string; role?: string },
  ) {
    const tags = this.validate(tagsInput);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, cafeId },
      select: { id: true, name: true, understandingTags: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    const before = this.parse(product.understandingTags);
    const updated = await this.prisma.product.update({
      where: { id: product.id },
      data: { understandingTags: tags },
      select: { id: true, name: true, understandingTags: true },
    });
    await this.audit.log({
      cafeId,
      action: 'CONFIG_CHANGE',
      entityType: 'ProductUnderstandingTags',
      entityId: product.id,
      actorId: actor.id || null,
      actorRole: actor.role === 'MANAGER' ? 'MANAGER' : 'OWNER',
      beforeState: { tags: before },
      afterState: { tags },
      metadata: { source: 'STAGE_7_OWNER_APPROVED_TAGGING' },
    });
    return { ...updated, understandingTags: this.parse(updated.understandingTags) };
  }
}

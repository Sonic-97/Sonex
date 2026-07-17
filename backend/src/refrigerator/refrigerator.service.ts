import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRefrigeratorCategoryDto, UpdateRefrigeratorCategoryDto } from './dto/refrigerator-category.dto';

@Injectable()
export class RefrigeratorService {
  constructor(private readonly prisma: PrismaService) {}

  // ── CATEGORIES ──

  async findAllCategories(cafeId?: string) {
    const where: Record<string, unknown> = {};
    if (cafeId) where.cafeId = cafeId;
    return this.prisma.refrigeratorCategory.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  async createCategory(dto: CreateRefrigeratorCategoryDto, cafeId?: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');
    const existing = await this.prisma.refrigeratorCategory.findFirst({
      where: { cafeId, name: dto.name },
    });
    if (existing) throw new ConflictException(`التصنيف "${dto.name}" موجود بالفعل`);
    return this.prisma.refrigeratorCategory.create({
      data: {
        name: dto.name,
        emoji: dto.emoji || '🥤',
        active: dto.active ?? true,
        cafeId,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateRefrigeratorCategoryDto, cafeId?: string) {
    const cat = await this.prisma.refrigeratorCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('التصنيف غير موجود');
    if (cafeId && cat.cafeId !== cafeId) throw new ForbiddenException('لا يمكن الوصول إلى هذا التصنيف');
    if (dto.name !== undefined && dto.name !== cat.name) {
      const dup = await this.prisma.refrigeratorCategory.findFirst({
        where: { cafeId: cat.cafeId, name: dto.name, id: { not: id } },
      });
      if (dup) throw new ConflictException(`التصنيف "${dto.name}" موجود بالفعل`);
    }
    return this.prisma.refrigeratorCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.emoji !== undefined && { emoji: dto.emoji }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
      include: { _count: { select: { products: true } } },
    });
  }

  async deleteCategory(id: string, cafeId?: string) {
    const cat = await this.prisma.refrigeratorCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('التصنيف غير موجود');
    if (cafeId && cat.cafeId !== cafeId) throw new ForbiddenException('لا يمكن الوصول إلى هذا التصنيف');
    const count = await this.prisma.product.count({ where: { refrigeratorCategoryId: id } });
    if (count > 0) {
      throw new BadRequestException('لا يمكن حذف التصنيف لأنه يحتوي على منتجات. قم بنقل المنتجات أولاً.');
    }
    return this.prisma.refrigeratorCategory.delete({ where: { id } });
  }

  // ── REFRIGERATOR PRODUCTS ──

  async findAllRefrigeratorProducts(cafeId?: string) {
    const where: Record<string, unknown> = { isRefrigerated: true };
    if (cafeId) where.cafeId = cafeId;
    return this.prisma.product.findMany({
      where,
      orderBy: [{ refrigeratorCategoryId: 'asc' }, { name: 'asc' }],
      include: {
        refrigeratorCategory: true,
        refrigeratorInventory: { select: { id: true, currentQty: true, minThreshold: true, unit: true } },
      },
    });
  }
}

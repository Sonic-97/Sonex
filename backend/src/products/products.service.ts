import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(branchId?: string, cafeId?: string) {
    const where: any = { active: true };
    if (cafeId) {
      where.cafeId = cafeId;
    }
    if (branchId) {
      where.branchId = branchId;
    }
    return this.prisma.product.findMany({ where, orderBy: { category: 'asc' } });
  }

  async findOne(id: string, cafeId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (cafeId && product.cafeId !== cafeId) {
      throw new ForbiddenException('Unauthorized cafe access for this product');
    }
    return product;
  }

  async create(data: { name: string; category: string; price: number; cost: number; branchId?: string }, cafeId?: string) {
    let targetBranchId = data.branchId;
    if (!targetBranchId) {
      const defaultBranch = await this.prisma.branch.findFirst({
        where: { slug: 'main-branch', ...(cafeId ? { cafeId } : {}) },
        select: { id: true },
      });
      targetBranchId = defaultBranch?.id;
    }
    return this.prisma.product.create({
      data: {
        name: data.name,
        category: data.category,
        price: data.price,
        cost: data.cost,
        branchId: targetBranchId!,
        cafeId: cafeId!,
      } as any,
    });
  }

  async update(id: string, data: any, cafeId?: string) {
    await this.findOne(id, cafeId);
    return this.prisma.product.update({ where: { id }, data });
  }

  async remove(id: string, cafeId?: string) {
    await this.findOne(id, cafeId);
    return this.prisma.product.update({ where: { id }, data: { active: false } });
  }
}




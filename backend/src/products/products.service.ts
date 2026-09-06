import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(branchId?: string, cafeId?: string) {
    if (!cafeId) throw new ForbiddenException('Tenant context (cafeId) is required');
    const where: any = { active: true, cafeId };
    if (branchId) {
      where.branchId = branchId;
    }
    return this.prisma.product.findMany({ where, orderBy: { category: 'asc' } });
  }

  async findOne(id: string, cafeId?: string) {
    if (!cafeId) throw new ForbiddenException('Tenant context (cafeId) is required');
    const product = await this.prisma.product.findFirst({ where: { id, cafeId } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(data: { name: string; category: string; price: number; cost: number; branchId?: string }, cafeId?: string) {
    if (!cafeId) throw new ForbiddenException('Tenant context (cafeId) is required');
    let targetBranchId = data.branchId;
    if (!targetBranchId) {
      const defaultBranch = await this.prisma.branch.findFirst({
        where: { slug: 'main-branch', cafeId },
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
        cafeId,
      } as any,
    });
  }

  async update(id: string, data: any, cafeId?: string) {
    if (!cafeId) throw new ForbiddenException('Tenant context (cafeId) is required');
    await this.findOne(id, cafeId);
    return this.prisma.product.update({ where: { id }, data });
  }

  async remove(id: string, cafeId?: string) {
    if (!cafeId) throw new ForbiddenException('Tenant context (cafeId) is required');
    await this.findOne(id, cafeId);
    return this.prisma.product.update({ where: { id }, data: { active: false } });
  }
}




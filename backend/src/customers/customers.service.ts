import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: string, cafeId?: string, branchId?: string) {
    const where: any = {};
    if (cafeId) where.cafeId = cafeId;
    if (branchId) where.branchId = branchId;
    if (query?.trim()) {
      where.name = { contains: query.trim(), mode: 'insensitive' };
    }
    return this.prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        totalOrders: true,
        totalSpent: true,
        lastOrderDate: true,
      },
      orderBy: { lastOrderDate: 'desc' },
      take: 20,
    });
  }

  async findAll(cafeId?: string, branchId?: string) {
    const where: any = {};
    if (cafeId) where.cafeId = cafeId;
    if (branchId) where.branchId = branchId;
    return this.prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, cafeId?: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        orders: { take: 5, orderBy: { createdAt: 'desc' }, include: { items: { include: { product: true } } } },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (cafeId && customer.cafeId !== cafeId) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }
}

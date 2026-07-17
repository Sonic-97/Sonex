import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryPurchaseService {
  private readonly logger = new Logger(InventoryPurchaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    itemName: string;
    quantity: number;
    unit: string;
    cost?: number;
    supplier?: string;
    purchasedById?: string;
    inventoryId?: string;
    notes?: string;
    branchId?: string;
    cafeId?: string;
  }) {
    let targetBranchId = data.branchId;
    if (!targetBranchId && data.purchasedById) {
      const staff = await this.prisma.staff.findUnique({
        where: { id: data.purchasedById },
        select: { branchId: true },
      });
      targetBranchId = staff?.branchId;
    }
    if (!targetBranchId) {
      const defaultBranch = await this.prisma.branch.findFirst({
        where: { slug: 'main-branch' },
        select: { id: true },
      });
      targetBranchId = defaultBranch?.id;
    }
    if (!targetBranchId) throw new BadRequestException('No active branch found');

    return this.prisma.inventoryPurchase.create({
      data: {
        cafeId: data.cafeId!,
        branchId: targetBranchId,
        itemName: data.itemName,
        quantity: data.quantity,
        unit: data.unit,
        cost: data.cost ?? null,
        supplier: data.supplier ?? null,
        purchasedById: data.purchasedById ?? null,
        inventoryId: data.inventoryId ?? null,
        notes: data.notes ?? null,
      } as any,
    });
  }

  async findAll(from?: string, to?: string, cafeId?: string) {
    const where: Record<string, unknown> = {};
    if (cafeId) where.cafeId = cafeId;
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
      if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to);
    }
    return this.prisma.inventoryPurchase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { purchasedBy: { select: { id: true, name: true } } },
    });
  }

  async findOne(id: string, cafeId?: string) {
    const purchase = await this.prisma.inventoryPurchase.findUnique({
      where: { id },
      include: { purchasedBy: { select: { id: true, name: true } } },
    });
    if (!purchase) throw new NotFoundException('Purchase not found');
    if (cafeId && purchase.cafeId !== cafeId) {
      throw new ForbiddenException('Unauthorized cafe access for this purchase');
    }
    return purchase;
  }
}





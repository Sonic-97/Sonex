import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateStaffPurchaseDto } from './dto/create-staff-purchase.dto';

@Injectable()
export class StaffPurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async create(dto: CreateStaffPurchaseDto, cafeId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (cafeId && product.cafeId !== cafeId) {
      throw new ForbiddenException('Unauthorized cafe access for this product');
    }

    const staff = await this.prisma.staff.findUnique({ where: { id: dto.staffId }, select: { cafeId: true, branchId: true } });
    if (!staff) throw new NotFoundException('Staff not found');
    if (cafeId && staff.cafeId !== cafeId) {
      throw new ForbiddenException('Unauthorized cafe access for this staff');
    }

    const costPerUnit = Number(product.cost);
    const finalCost = dto.customPrice !== undefined ? dto.customPrice * dto.quantity : costPerUnit * dto.quantity;

    const purchase = await this.prisma.staffPurchase.create({
      data: {
        cafeId: staff?.cafeId ?? '',
        branchId: staff?.branchId ?? null,
        staffId: dto.staffId,
        productId: dto.productId,
        quantity: dto.quantity,
        customPrice: dto.customPrice ?? null,
        finalCost,
        notes: dto.notes ?? null,
      } as any,
      include: { product: true, staff: true },
    });

    this.events.emitToOwner('staff.purchase.created', { purchase } as any);

    return purchase;
  }

  async findAll(cafeId?: string) {
    const where: any = {};
    if (cafeId) where.cafeId = cafeId;
    return this.prisma.staffPurchase.findMany({
      where,
      include: { product: true, staff: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}





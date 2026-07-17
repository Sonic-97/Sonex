import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditService } from '../audit/audit.service';
import { OrderStatus } from '../orders/dto/update-order-status.dto';

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(cafeId?: string) {
    const where: any = { active: true };
    if (cafeId) {
      where.cafeId = cafeId;
    }
    return this.prisma.driver.findMany({
      where,
      select: {
        id: true, name: true, phone: true, active: true,
      },
    });
  }

  async findOne(id: string, cafeId?: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: {
        orders: {
          where: { status: { in: ['READY', 'PICKED_UP', 'DELIVERED'] } },
          orderBy: { createdAt: 'desc' },
        },
        cashSettlements: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    if (cafeId && driver.cafeId !== cafeId) {
      throw new ForbiddenException('Unauthorized cafe access for this driver');
    }
    return driver;
  }

  async create(data: { name: string; phone: string; branchId?: string }, cafeId?: string) {
    const existing = await this.prisma.driver.findUnique({
      where: { phone: data.phone },
    });
    if (existing) throw new BadRequestException('Phone already registered as driver');

    let targetBranchId = data.branchId;
    if (!targetBranchId) {
      const defaultBranch = await this.prisma.branch.findFirst({
        where: { slug: 'main-branch', ...(cafeId ? { cafeId } : {}) },
        select: { id: true },
      });
      targetBranchId = defaultBranch?.id;
    }
    if (!targetBranchId) throw new BadRequestException('No active branch found');

    return this.prisma.$transaction(async (tx) => {
      const driver = await tx.driver.create({
        data: {
          name: data.name,
          phone: data.phone,
          branchId: targetBranchId,
          cafeId: cafeId!,
          totalDeliveries: 0,
          totalRevenue: 0,
          newCustomersAcquired: 0,
          bonusEligible: false,
        } as any,
      });
      await this.auditService.logTransactional(tx, {
        cafeId: cafeId!,
        action: 'DRIVER_CREATE',
        entityType: 'Driver',
        entityId: driver.id,
        metadata: { name: data.name, phone: data.phone },
      });
      return driver;
    });
  }

  async update(id: string, data: { name?: string; phone?: string; active?: boolean }, cafeId?: string) {
    await this.findOne(id, cafeId);
    const updated = await this.prisma.driver.update({ where: { id }, data });
    await this.auditService.log({
      cafeId: cafeId!,
      action: 'DRIVER_UPDATE',
      entityType: 'Driver',
      entityId: id,
      metadata: { updates: data },
    });
    return updated;
  }

  async remove(id: string, cafeId?: string) {
    await this.findOne(id, cafeId);
    const result = await this.prisma.driver.update({ where: { id }, data: { active: false } });
    await this.auditService.log({
      cafeId: cafeId!,
      action: 'DRIVER_DELETE',
      entityType: 'Driver',
      entityId: id,
    });
    return result;
  }

  async assignToOrder(driverId: string, orderId: string, cafeId?: string) {
    const driver = await this.findOne(driverId, cafeId);
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.driverId) throw new BadRequestException('Order already has a driver assigned');
    if (cafeId && order.cafeId !== cafeId) {
      throw new ForbiddenException('Unauthorized cafe access for this order');
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { driverId, status: OrderStatus.PICKED_UP, pickedUpAt: new Date() },
    });
  }

  async completeDelivery(driverId: string, orderId: string, cafeId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.driverId !== driverId) throw new BadRequestException('Order not assigned to this driver');
    if (cafeId && order.cafeId !== cafeId) {
      throw new ForbiddenException('Unauthorized cafe access for this order');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.DELIVERED, deliveredAt: new Date() },
      });
      return updated;
    });
  }

  async acceptOrder(driverId: string, orderId: string, cafeId?: string) {
    const driver = await this.findOne(driverId, cafeId);
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (cafeId && order.cafeId !== cafeId) {
      throw new ForbiddenException('Unauthorized cafe access for this order');
    }
    if (order.driverId) throw new BadRequestException('Order already has a driver assigned');
    if (order.status !== OrderStatus.READY) throw new BadRequestException('Order must be READY to accept');

    return this.prisma.order.update({
      where: { id: orderId },
      data: { driverId },
    });
  }

  async pickupOrder(driverId: string, orderId: string, cafeId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (cafeId && order.cafeId !== cafeId) {
      throw new ForbiddenException('Unauthorized cafe access for this order');
    }
    if (order.driverId !== driverId) throw new BadRequestException('Order not assigned to this driver');
    if (order.status !== OrderStatus.READY) throw new BadRequestException('Order must be READY to pick up');

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PICKED_UP, pickedUpAt: new Date() },
    });
  }

  async collectPayment(driverId: string, orderId: string, cafeId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (cafeId && order.cafeId !== cafeId) {
      throw new ForbiddenException('Unauthorized cafe access for this order');
    }
    if (order.driverId !== driverId) throw new BadRequestException('Order not assigned to this driver');
    if (order.status !== OrderStatus.DELIVERED) throw new BadRequestException('Order must be DELIVERED to collect payment');

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAID, paidAt: new Date(), paymentStatus: 'PAID' },
    });
  }

  // Phase 4: Driver Cash Settlement
  async submitSettlement(driverId: string, amount: number, notes?: string, cafeId?: string, branchId?: string) {
    await this.findOne(driverId);

    const settlement = await this.prisma.driverCashSettlement.create({
      data: { driverId, amount, notes, status: 'PENDING', cafeId: cafeId!, branchId: branchId ?? null } as any,
    });

    this.eventsService.emit('system.notification', {
      type: 'driver.settlement.submitted',
      message: `Driver submitted cash settlement of $${amount.toFixed(2)}`,
      driverId,
      settlementId: settlement.id,
      severity: 'info',
    });

    return settlement;
  }

  async getPendingSettlements(cafeId?: string) {
    const where: any = { status: 'PENDING' };
    if (cafeId) {
      where.cafeId = cafeId;
    }
    return this.prisma.driverCashSettlement.findMany({
      where,
      include: { driver: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveSettlement(id: string, approvedById: string, cafeId?: string) {
    const settlement = await this.prisma.driverCashSettlement.findUnique({ where: { id } });
    if (!settlement) throw new NotFoundException('Settlement not found');
    if (cafeId && settlement.cafeId !== cafeId) {
      throw new ForbiddenException('Unauthorized cafe access for this settlement');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.driverCashSettlement.update({
        where: { id },
        data: { status: 'APPROVED', approvedById, approvedAt: new Date() },
      });

      await this.auditService.logTransactional(tx, {
        cafeId: cafeId!,
        action: 'DRIVER_SETTLEMENT',
        entityType: 'DriverCashSettlement',
        entityId: id,
        metadata: { driverId: settlement.driverId, amount: settlement.amount, settlementId: id, status: 'APPROVED' },
      });

      return { id, status: 'APPROVED' };
    });
  }

  async rejectSettlement(id: string, reason: string, cafeId?: string) {
    const settlement = await this.prisma.driverCashSettlement.findUnique({ where: { id } });
    if (!settlement) throw new NotFoundException('Settlement not found');
    if (cafeId && settlement.cafeId !== cafeId) {
      throw new ForbiddenException('Unauthorized cafe access for this settlement');
    }
    const result = await this.prisma.driverCashSettlement.update({
      where: { id },
      data: { status: 'REJECTED', notes: reason },
    });
    await this.auditService.log({
      cafeId: cafeId!,
      action: 'DRIVER_SETTLEMENT',
      entityType: 'DriverCashSettlement',
      entityId: id,
      metadata: { driverId: settlement.driverId, amount: settlement.amount, settlementId: id, reason, status: 'REJECTED' },
    });
    return result;
  }

  async getDriverStats(driverId: string, cafeId?: string) {
    const driver = await this.findOne(driverId, cafeId);
    const deliveries = await this.prisma.order.findMany({
      where: { driverId, status: 'DELIVERED', ...(cafeId ? { cafeId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { customer: true, items: { include: { product: true } } },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDeliveries = deliveries.filter((o) => new Date(o.createdAt) >= today);

    const totalCash = deliveries.reduce((s, o) => s + Number(o.cashCollected || 0), 0);
    const totalSettled = driver.cashSettlements
      ? driver.cashSettlements.filter(s => s.status === 'APPROVED').reduce((s, st) => s + Number(st.amount), 0)
      : 0;

    return {
      ...driver,
      totalDeliveries: deliveries.length,
      totalRevenue: deliveries.reduce((s, o) => s + Number(o.total), 0),
      todayDeliveries: todayDeliveries.length,
      cashCollected: totalCash,
      cashDelivered: totalSettled,
      outstandingDebt: totalCash - totalSettled,
      recentDeliveries: deliveries.slice(0, 10),
    };
  }

  async evaluateBonuses(cafeId?: string) {
    const where: any = { active: true };
    if (cafeId) where.cafeId = cafeId;
    const drivers = await this.prisma.driver.findMany({ where });
    return drivers.map(d => ({ id: d.id, name: d.name, bonusEligible: false }));
  }
}





import { BadRequestException, Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import { InventoryService } from '../inventory/inventory.service';
import { OrderStatus } from './dto/update-order-status.dto';
import { MessagesService } from '../messages/messages.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { Prisma } from '@prisma/client';

const NEXT_STATUS: Record<OrderStatus, { next: OrderStatus | null; allowedRoles: string[] }> = {
  [OrderStatus.NEW]:        { next: OrderStatus.CONFIRMED, allowedRoles: ['BARISTA', 'Cafe'] },
  [OrderStatus.CONFIRMED]:  { next: OrderStatus.PREPARING, allowedRoles: ['BARISTA', 'Cafe'] },
  [OrderStatus.PREPARING]:  { next: OrderStatus.READY,     allowedRoles: ['BARISTA', 'Cafe'] },
  [OrderStatus.READY]:      { next: OrderStatus.PICKED_UP, allowedRoles: ['DELIVERY', 'Cafe'] },
  [OrderStatus.PICKED_UP]:  { next: OrderStatus.DELIVERED, allowedRoles: ['DELIVERY', 'Cafe'] },
  [OrderStatus.DELIVERED]:  { next: OrderStatus.PAID,      allowedRoles: ['DELIVERY', 'BARISTA', 'Cafe'] },
  [OrderStatus.PAID]:       { next: OrderStatus.CLOSED,    allowedRoles: ['Cafe', 'BARISTA'] },
  [OrderStatus.CLOSED]:     { next: null,                  allowedRoles: [] },
  [OrderStatus.CANCELLED]:  { next: null,                  allowedRoles: [] },
};

@Injectable()
export class OrderStatusService {
  private readonly logger = new Logger(OrderStatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly eventsService: EventsService,
    private readonly messagesService: MessagesService,
    private readonly whatsappService: WhatsappService,
    private readonly inventoryService: InventoryService,
  ) {}

  async updateOrderStatus(orderId: string, status: OrderStatus, userId?: string, userRole?: string, branchId?: string, cafeId?: string) {
    let deductedItems: Array<{ inventoryId: string; itemName: string; deducted: string; remaining: string }> = [];

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { customer: true, items: { include: { product: true } } },
      });

      if (!order) {
        throw new NotFoundException(`Order with ID ${orderId} not found`);
      }

      if (cafeId && order.cafeId !== cafeId) {
        throw new ForbiddenException('Unauthorized cafe access for this order');
      }

      if (branchId && order.branchId !== branchId) {
        throw new BadRequestException('Unauthorized branch access for this order');
      }

      const currentStatus = order.status as OrderStatus;

      if (currentStatus === status) {
        this.logger.warn(`Order ${orderId} already in status ${status}`);
        return { updatedOrder: order, notification: null, currentStatus };
      }

      const transition = NEXT_STATUS[currentStatus];
      if (!transition || transition.next !== status) {
        throw new BadRequestException(
          `Invalid order status transition from ${order.status} to ${status}`,
        );
      }

      if (userRole && !transition.allowedRoles.includes(userRole)) {
        throw new BadRequestException(
          `Role ${userRole} not allowed to transition from ${currentStatus} to ${status}`,
        );
      }

      const updateData: Record<string, unknown> = { status };

      if (status === OrderStatus.DELIVERED) updateData.deliveredAt = new Date();
      if (status === OrderStatus.CONFIRMED) updateData.confirmedAt = new Date();
      if (status === OrderStatus.PREPARING) updateData.preparedAt = new Date();
      if (status === OrderStatus.READY) updateData.readyAt = new Date();
      if (status === OrderStatus.PICKED_UP) updateData.pickedUpAt = new Date();
      if (status === OrderStatus.PAID) {
        updateData.paidAt = new Date();
        updateData.paymentStatus = 'PAID';
      }
      if (status === OrderStatus.CLOSED) updateData.closedAt = new Date();
      if (status === OrderStatus.CANCELLED) updateData.cancelledAt = new Date();

      const updateResult = await tx.order.updateMany({
        where: { id: orderId, version: order.version },
        data: { ...updateData, version: { increment: 1 } },
      });

      if (updateResult.count === 0) {
        throw new BadRequestException('Order was modified concurrently. Please retry.');
      }

      const updatedOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          customer: true,
          items: { include: { product: true } },
        },
      });

      if (status === OrderStatus.CONFIRMED) {
        deductedItems = await this.inventoryService.confirmReservation(orderId, cafeId);
      }

      const notification = await this.whatsappService.sendStatusUpdate(updatedOrder, status);

      await this.messagesService.logMessage({
        phone: updatedOrder.customer.phone,
        content: notification || '',
        role: 'system',
        intent: `status_${status}`,
        cafeId: updatedOrder.cafeId,
      });

      this.auditService.logAction({
        cafeId,
        userId,
        action: 'ORDER_STATUS_UPDATED',
        entity: 'Order',
        entityId: orderId,
        metadata: { from: order.status, to: status },
      });

      return { updatedOrder, notification, currentStatus };
    });

    const { updatedOrder, notification, currentStatus } = result;

    const basePayload = {
      orderId,
      status,
      from: currentStatus,
      total: Number(updatedOrder.total),
      customerPhone: updatedOrder.customer.phone,
      customerName: updatedOrder.customer.name,
      type: updatedOrder.type,
      branchId: updatedOrder.branchId,
    };

    this.eventsService.emit('order.updated', basePayload);
    this.eventsService.emit('order.status.changed', { ...basePayload, timestamp: new Date().toISOString() });

    if (status === OrderStatus.READY) {
      this.eventsService.emit('order.ready', basePayload);
    }
    if (status === OrderStatus.DELIVERED) {
      this.eventsService.emit('order.delivered', basePayload);
    }
    if (status === OrderStatus.CANCELLED) {
      this.eventsService.emit('order.cancelled', basePayload);
    }
    if (status === OrderStatus.PAID) {
      this.eventsService.emit('payment.collected', {
        orderId, status: 'PAID', total: Number(updatedOrder.total), timestamp: new Date().toISOString(),
      });
    }

    if (status === OrderStatus.CONFIRMED && deductedItems.length > 0) {
      this.eventsService.emit('inventory.updated', { orderId, updatedItems: deductedItems });
      this.inventoryService.checkLowStock(deductedItems);
    }

    return { ...updatedOrder, notification };
  }

  async getBaristaQueue(cafeId: string, branchId?: string) {
    const where: Prisma.OrderWhereInput = {
      cafeId,
      status: { in: [OrderStatus.NEW, OrderStatus.CONFIRMED, OrderStatus.PREPARING] },
    };
    if (branchId) {
      where.branchId = branchId;
    }
    return this.prisma.order.findMany({
      where,
      include: {
        customer: true,
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getDriverQueue(cafeId: string, branchId?: string) {
    const where: Prisma.OrderWhereInput = {
      cafeId,
      status: { in: [OrderStatus.READY, OrderStatus.PICKED_UP] },
    };
    if (branchId) {
      where.branchId = branchId;
    }
    return this.prisma.order.findMany({
      where,
      include: {
        customer: true,
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}





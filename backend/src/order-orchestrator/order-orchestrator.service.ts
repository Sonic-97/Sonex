import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderSplitterService } from './order-splitter.service';
import {
  CustomerOrderStatus, MerchantOrderStatus,
  CreateCustomerOrderInput, OrchestratorEvent,
  OrchestratorEventType, ReplacementProposal,
  DriverPickupStop,
} from './order-orchestrator.types';

@Injectable()
export class OrderOrchestratorService {
  private readonly logger = new Logger(OrderOrchestratorService.name);
  private readonly eventListeners: Array<(event: OrchestratorEvent) => void> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly splitter: OrderSplitterService,
  ) {}

  onEvent(listener: (event: OrchestratorEvent) => void): void {
    this.eventListeners.push(listener);
  }

  // ── Create Customer Order ──

  async createCustomerOrder(input: CreateCustomerOrderInput) {
    const groups = this.splitter.split(input.items);
    if (groups.length === 0) throw new Error('No valid items to order');

    const subtotal = groups.reduce((s, g) => s + g.subtotal, 0);
    const deliveryFee = input.deliveryFee ?? 0;
    const grandTotal = subtotal + deliveryFee;

    const customerOrder = await this.prisma.customerOrder.create({
      data: {
        customerId: input.customerId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        address: input.address,
        deliveryMethod: input.deliveryMethod || 'DELIVERY',
        status: 'CREATED',
        subtotal,
        deliveryFee,
        grandTotal,
        totalMerchantCount: groups.length,
        merchantOrders: {
          create: groups.map((g, i) => ({
            cafeId: g.cafeId,
            businessName: g.businessName,
            businessType: g.businessType,
            status: 'CREATED',
            preparationTimeMinutes: 15,
            pickupSequence: i,
            items: {
              create: g.items.map(item => ({
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.unitPrice * item.quantity,
                notes: item.notes,
              })),
            },
          })),
        },
      },
      include: { merchantOrders: { include: { items: true } } },
    });

    this.emit('CustomerOrderCreated', customerOrder.id);
    for (const mo of customerOrder.merchantOrders) {
      this.emit('MerchantOrderCreated', customerOrder.id, mo.id, mo.cafeId);
    }

    return this.transitionCustomerOrder(customerOrder.id, 'PROCESSING');
  }

  // ── Merchant Actions ──

  async acceptMerchantOrder(merchantOrderId: string) {
    const mo = await this.prisma.merchantOrder.update({
      where: { id: merchantOrderId },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        estimatedReadyAt: this.calcEstimatedReady(new Date(), 15),
      },
    });
    this.emit('MerchantAccepted', mo.customerOrderId, mo.id, mo.cafeId);
    return this.transitionMerchantOrder(merchantOrderId, 'PREPARING');
  }

  async rejectMerchantOrder(merchantOrderId: string, reason?: string) {
    const mo = await this.prisma.merchantOrder.update({
      where: { id: merchantOrderId },
      data: { status: 'CANCELLED', cancellationReason: reason || 'Merchant rejected', cancelledAt: new Date() },
    });
    this.emit('MerchantRejected', mo.customerOrderId, mo.id, mo.cafeId, { reason });

    await this.checkPartialFailure(mo.customerOrderId);
    return mo;
  }

  async startPreparing(merchantOrderId: string) {
    return this.transitionMerchantOrder(merchantOrderId, 'PREPARING');
  }

  async markMerchantReady(merchantOrderId: string) {
    const mo = await this.transitionMerchantOrder(merchantOrderId, 'READY');
    this.emit('MerchantReady', mo.customerOrderId, mo.id, mo.cafeId);

    const customerOrder = await this.prisma.customerOrder.findUnique({
      where: { id: mo.customerOrderId },
      select: { readyMerchantCount: true, totalMerchantCount: true, status: true },
    });

    if (customerOrder) {
      const newReadyCount = customerOrder.readyMerchantCount + 1;
      await this.prisma.customerOrder.update({
        where: { id: mo.customerOrderId },
        data: { readyMerchantCount: newReadyCount },
      });

      if (newReadyCount >= customerOrder.totalMerchantCount) {
        await this.transitionCustomerOrder(mo.customerOrderId, 'READY_FOR_PICKUP');
      } else {
        await this.transitionCustomerOrder(mo.customerOrderId, 'PARTIALLY_READY');
      }
    }

    return mo;
  }

  async delayMerchantOrder(merchantOrderId: string, extraMinutes: number) {
    const mo = await this.prisma.merchantOrder.findUnique({ where: { id: merchantOrderId } });
    if (!mo) throw new Error('Merchant order not found');

    const newReady = this.calcEstimatedReady(new Date(), extraMinutes);
    await this.prisma.merchantOrder.update({
      where: { id: merchantOrderId },
      data: { estimatedReadyAt: newReady, status: 'PREPARING' },
    });
    this.emit('MerchantDelayed', mo.customerOrderId, mo.id, mo.cafeId, { extraMinutes });
  }

  async pickupMerchantOrder(merchantOrderId: string) {
    const mo = await this.transitionMerchantOrder(merchantOrderId, 'PICKED_UP');
    this.emit('PickupStarted', mo.customerOrderId, mo.id, mo.cafeId);
    return this.transitionCustomerOrder(mo.customerOrderId, 'COLLECTING');
  }

  async completeMerchantOrder(merchantOrderId: string) {
    const mo = await this.transitionMerchantOrder(merchantOrderId, 'COMPLETED');
    this.emit('PickupCompleted', mo.customerOrderId, mo.id, mo.cafeId);

    const allComplete = await this.areAllMerchantsComplete(mo.customerOrderId);
    if (allComplete) {
      await this.transitionCustomerOrder(mo.customerOrderId, 'OUT_FOR_DELIVERY');
    }
    return mo;
  }

  // ── Driver Actions ──

  async assignDriver(customerOrderId: string, driverId: string) {
    await this.prisma.customerOrder.update({
      where: { id: customerOrderId },
      data: { driverId },
    });
    this.emit('DriverAssigned', customerOrderId, undefined, undefined, { driverId });
  }

  async deliverCustomerOrder(customerOrderId: string) {
    const co = await this.transitionCustomerOrder(customerOrderId, 'DELIVERED');
    this.emit('CustomerDelivered', customerOrderId);
    return this.transitionCustomerOrder(customerOrderId, 'COMPLETED');
  }

  // ── Replacements ──

  async proposeReplacement(merchantOrderId: string, proposal: ReplacementProposal) {
    this.emit('ReplacementRequested', undefined, merchantOrderId, proposal.cafeId, proposal as unknown as Record<string, unknown>);
  }

  async acceptReplacement(merchantOrderId: string, proposal: ReplacementProposal) {
    await this.prisma.merchantOrderItem.create({
      data: {
        merchantOrderId,
        productName: proposal.suggestedProductName,
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        notes: `Replacement for ${proposal.originalProductName}: ${proposal.reason}`,
      },
    });
    this.emit('ReplacementAccepted', undefined, merchantOrderId, proposal.cafeId, proposal as unknown as Record<string, unknown>);
  }

  async rejectReplacement(merchantOrderId: string, proposal: ReplacementProposal) {
    this.emit('ReplacementRejected', undefined, merchantOrderId, proposal.cafeId, proposal as unknown as Record<string, unknown>);
  }

  // ── Customer Cancellation ──

  async cancelCustomerOrder(customerOrderId: string) {
    const co = await this.prisma.customerOrder.findUnique({
      where: { id: customerOrderId },
      include: { merchantOrders: true },
    });
    if (!co) throw new Error('Customer order not found');

    await this.prisma.merchantOrder.updateMany({
      where: { customerOrderId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'Customer cancelled' },
    });

    return this.transitionCustomerOrder(customerOrderId, 'CANCELLED');
  }

  async cancelMerchantOrder(merchantOrderId: string, reason?: string) {
    const mo = await this.prisma.merchantOrder.update({
      where: { id: merchantOrderId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason || 'Cancelled' },
    });
    await this.checkPartialFailure(mo.customerOrderId);
    return mo;
  }

  // ── Driver Route ──

  async getDriverRoute(customerOrderId: string): Promise<DriverPickupStop[]> {
    const orders = await this.prisma.merchantOrder.findMany({
      where: { customerOrderId, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
      orderBy: { pickupSequence: 'asc' },
    });

    return orders.map(o => ({
      merchantOrderId: o.id,
      cafeId: o.cafeId,
      businessName: o.businessName || 'Unknown',
      sequence: o.pickupSequence,
      estimatedReadyAt: o.estimatedReadyAt?.toISOString() || null,
      status: o.status as MerchantOrderStatus,
    }));
  }

  async optimizeRoute(customerOrderId: string): Promise<DriverPickupStop[]> {
    const orders = await this.prisma.merchantOrder.findMany({
      where: { customerOrderId, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
    });

    const readyFirst = orders.sort((a, b) => {
      const aReady = a.estimatedReadyAt?.getTime() || 0;
      const bReady = b.estimatedReadyAt?.getTime() || 0;
      if (a.status === 'READY' && b.status !== 'READY') return -1;
      if (a.status !== 'READY' && b.status === 'READY') return 1;
      return aReady - bReady;
    });

    for (let i = 0; i < readyFirst.length; i++) {
      await this.prisma.merchantOrder.update({
        where: { id: readyFirst[i].id },
        data: { pickupSequence: i },
      });
    }

    return readyFirst.map((o, i) => ({
      merchantOrderId: o.id,
      cafeId: o.cafeId,
      businessName: o.businessName || 'Unknown',
      sequence: i,
      estimatedReadyAt: o.estimatedReadyAt?.toISOString() || null,
      status: o.status as MerchantOrderStatus,
    }));
  }

  // ── Tracking ──

  async getCustomerTracking(customerOrderId: string) {
    const co = await this.prisma.customerOrder.findUnique({
      where: { id: customerOrderId },
      include: { merchantOrders: true },
    });
    if (!co) return null;

    const total = co.totalMerchantCount;
    const ready = co.readyMerchantCount;
    const status = co.status as CustomerOrderStatus;

    return {
      status,
      summary: this.trackingSummary(status, total, ready),
      readyMerchants: ready,
      totalMerchants: total,
      driverAssigned: !!co.driverId,
    };
  }

  private trackingSummary(status: CustomerOrderStatus, total: number, ready: number): string {
    switch (status) {
      case 'CREATED':
      case 'PROCESSING': return 'Preparing your order';
      case 'PARTIALLY_READY': return `${ready} of ${total} merchants ready`;
      case 'READY_FOR_PICKUP': return 'All merchants ready';
      case 'COLLECTING': return 'Driver collecting';
      case 'OUT_FOR_DELIVERY': return 'Out for delivery';
      case 'DELIVERED':
      case 'COMPLETED': return 'Delivered';
      case 'CANCELLED': return 'Cancelled';
    }
  }

  // ── Private ──

  private async transitionCustomerOrder(id: string, status: CustomerOrderStatus) {
    const updateData: any = { status };
    if (status === 'COMPLETED') updateData.completedAt = new Date();
    if (status === 'CANCELLED') updateData.cancelledAt = new Date();
    return this.prisma.customerOrder.update({
      where: { id },
      data: updateData,
      include: { merchantOrders: { include: { items: true } } },
    });
  }

  private async transitionMerchantOrder(id: string, status: MerchantOrderStatus) {
    const updateData: any = { status };
    if (status === 'PREPARING') updateData.startedAt = new Date();
    if (status === 'READY') updateData.readyAt = new Date();
    if (status === 'PICKED_UP') updateData.pickedUpAt = new Date();
    if (status === 'COMPLETED') updateData.completedAt = new Date();
    if (status === 'CANCELLED') updateData.cancelledAt = new Date();
    return this.prisma.merchantOrder.update({ where: { id }, data: updateData });
  }

  private async checkPartialFailure(customerOrderId: string) {
    const co = await this.prisma.customerOrder.findUnique({
      where: { id: customerOrderId },
      include: { merchantOrders: true },
    });
    if (!co) return;

    const cancelled = co.merchantOrders.filter(m => m.status === 'CANCELLED').length;
    if (cancelled > 0) {
      this.emit('PartialFailure', customerOrderId);
    }
  }

  private async areAllMerchantsComplete(customerOrderId: string): Promise<boolean> {
    const orders = await this.prisma.merchantOrder.findMany({
      where: { customerOrderId },
    });
    return orders.every(o => o.status === 'COMPLETED' || o.status === 'CANCELLED');
  }

  private calcEstimatedReady(from: Date, prepMinutes: number): Date {
    return new Date(from.getTime() + prepMinutes * 60000);
  }

  private emit(
    type: OrchestratorEventType,
    customerOrderId?: string,
    merchantOrderId?: string,
    cafeId?: string,
    data?: Record<string, unknown>,
  ) {
    const event: OrchestratorEvent = {
      type,
      customerOrderId: customerOrderId || '',
      merchantOrderId,
      cafeId,
      timestamp: new Date().toISOString(),
      data,
    };
    for (const listener of this.eventListeners) {
      try { listener(event); } catch (e) { this.logger.error('Event listener error', e); }
    }
  }
}

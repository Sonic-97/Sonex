import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { UnifiedFulfillmentStatus, UnifiedCancelStatus, UnifiedPaymentStatusEnum } from './dto/update-order-status.dto';

export interface StatusTransition {
  from: string;
  to: string;
  allowedRoles: string[];
  allowedChannels: string[];
  requiresPayment?: boolean;
  requiresStock?: boolean;
}

export interface ChannelStatusMap {
  status: string;
  next: string[];
  cancelTo?: string;
}

@Injectable()
export class OrderStatusMachine {
  private readonly logger = new Logger(OrderStatusMachine.name);

  // ── Fulfillment state machine (channel-aware) ──
  private readonly fulfillmentTransitions: Record<string, StatusTransition[]> = {
    [UnifiedFulfillmentStatus.NEW]: [
      { from: 'NEW', to: 'CONFIRMED', allowedRoles: ['BARISTA', 'OWNER'], allowedChannels: ['IN_CAFE', 'DELIVERY', 'PICKUP', 'KIOSK', 'CATERING'] },
    ],
    [UnifiedFulfillmentStatus.CONFIRMED]: [
      { from: 'CONFIRMED', to: 'PREPARING', allowedRoles: ['BARISTA', 'OWNER'], allowedChannels: ['IN_CAFE', 'DELIVERY', 'PICKUP', 'KIOSK', 'CATERING'] },
    ],
    [UnifiedFulfillmentStatus.PREPARING]: [
      { from: 'PREPARING', to: 'READY', allowedRoles: ['BARISTA', 'OWNER'], allowedChannels: ['IN_CAFE', 'DELIVERY', 'PICKUP', 'KIOSK', 'CATERING'] },
    ],
    [UnifiedFulfillmentStatus.READY]: [
      { from: 'READY', to: 'PICKED_UP', allowedRoles: ['DRIVER', 'BARISTA', 'OWNER'], allowedChannels: ['DELIVERY', 'PICKUP'] },
      { from: 'READY', to: 'DELIVERED', allowedRoles: ['BARISTA', 'OWNER'], allowedChannels: ['IN_CAFE', 'KIOSK'] },
      { from: 'READY', to: 'PAID', allowedRoles: ['BARISTA', 'OWNER'], allowedChannels: ['IN_CAFE'] },
    ],
    [UnifiedFulfillmentStatus.PICKED_UP]: [
      { from: 'PICKED_UP', to: 'DELIVERED', allowedRoles: ['DRIVER', 'OWNER'], allowedChannels: ['DELIVERY', 'PICKUP'] },
    ],
    [UnifiedFulfillmentStatus.DELIVERED]: [
      { from: 'DELIVERED', to: 'PAID', allowedRoles: ['DRIVER', 'BARISTA', 'OWNER'], allowedChannels: ['DELIVERY', 'PICKUP'] },
      { from: 'DELIVERED', to: 'CLOSED', allowedRoles: ['OWNER'], allowedChannels: ['DELIVERY', 'PICKUP'] },
    ],
    [UnifiedFulfillmentStatus.PAID]: [
      { from: 'PAID', to: 'CLOSED', allowedRoles: ['OWNER', 'BARISTA'], allowedChannels: ['IN_CAFE', 'DELIVERY', 'PICKUP', 'KIOSK', 'CATERING'] },
    ],
    [UnifiedFulfillmentStatus.CLOSED]: [],
    [UnifiedFulfillmentStatus.COMPLETED]: [],
  };

  // ── Cancel transitions (any state can cancel) ──
  private readonly cancelTransitions: Record<string, string[]> = {
    [UnifiedFulfillmentStatus.NEW]: ['CANCELLED', 'VOID'],
    [UnifiedFulfillmentStatus.CONFIRMED]: ['CANCELLED', 'VOID'],
    [UnifiedFulfillmentStatus.PREPARING]: ['CANCELLED', 'VOID'],
    [UnifiedFulfillmentStatus.READY]: ['CANCELLED'],
    [UnifiedFulfillmentStatus.PICKED_UP]: ['CANCELLED'],
    [UnifiedFulfillmentStatus.DELIVERED]: [],
    [UnifiedFulfillmentStatus.PAID]: ['CANCELLED'],
    [UnifiedFulfillmentStatus.CLOSED]: [],
    [UnifiedFulfillmentStatus.COMPLETED]: [],
  };

  // ── Payment status transitions ──
  private readonly paymentTransitions: Record<string, string[]> = {
    [UnifiedPaymentStatusEnum.UNPAID]: ['PAID', 'PARTIALLY_PAID'],
    [UnifiedPaymentStatusEnum.PARTIALLY_PAID]: ['PAID', 'UNPAID'],
    [UnifiedPaymentStatusEnum.PAID]: ['REFUNDED', 'PARTIALLY_REFUNDED'],
    [UnifiedPaymentStatusEnum.REFUNDED]: [],
    [UnifiedPaymentStatusEnum.PARTIALLY_REFUNDED]: ['REFUNDED'],
  };

  validateFulfillmentTransition(from: string, to: string, role?: string, channel?: string): void {
    if (from === to) {
      throw new BadRequestException(`Order is already in status ${from}`);
    }

    const transitions = this.fulfillmentTransitions[from];
    if (!transitions || transitions.length === 0) {
      throw new BadRequestException(`No transitions allowed from status ${from}`);
    }

    const valid = transitions.find(t => t.to === to);
    if (!valid) {
      throw new BadRequestException(`Invalid fulfillment transition from ${from} to ${to}`);
    }

    if (role && !valid.allowedRoles.includes(role)) {
      throw new BadRequestException(`Role ${role} not allowed to transition from ${from} to ${to}`);
    }

    if (channel && !valid.allowedChannels.includes(channel)) {
      throw new BadRequestException(`Channel ${channel} not allowed to transition from ${from} to ${to}`);
    }
  }

  validateCancelTransition(from: string, cancelTo: string): void {
    const allowed = this.cancelTransitions[from];
    if (!allowed || !allowed.includes(cancelTo)) {
      throw new BadRequestException(`Cannot ${cancelTo.toLowerCase()} order from status ${from}`);
    }
  }

  validatePaymentTransition(from: string, to: string): void {
    if (from === to) return;

    const allowed = this.paymentTransitions[from];
    if (!allowed || !allowed.includes(to)) {
      throw new BadRequestException(`Invalid payment transition from ${from} to ${to}`);
    }
  }

  getFulfillmentTimestampField(status: string): string | null {
    const map: Record<string, string> = {
      CONFIRMED: 'confirmedAt',
      PREPARING: 'preparedAt',
      READY: 'readyAt',
      PICKED_UP: 'pickedUpAt',
      DELIVERED: 'deliveredAt',
      PAID: 'paidAt',
      CLOSED: 'closedAt',
      CANCELLED: 'cancelledAt',
    };
    return map[status] || null;
  }

  getAllowedNextStatuses(from: string, role?: string, channel?: string): string[] {
    const transitions = this.fulfillmentTransitions[from];
    if (!transitions) return [];

    return transitions
      .filter(t => {
        if (role && !t.allowedRoles.includes(role)) return false;
        if (channel && !t.allowedChannels.includes(channel)) return false;
        return true;
      })
      .map(t => t.to);
  }
}

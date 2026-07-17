import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  MerchantMessageType, MerchantResponseType,
  ORDER_STATES, OrderState,
  STATE_TRANSITIONS,
} from './merchant-communication.types';

export interface StateTransitionResult {
  success: boolean;
  newState?: string;
  error?: string;
}

@Injectable()
export class MerchantStateCoordinator {
  private readonly logger = new Logger(MerchantStateCoordinator.name);

  constructor(private readonly prisma: PrismaService) {}

  async applyMessageTransition(merchantOrderId: string, messageType: MerchantMessageType): Promise<StateTransitionResult> {
    const targetState = this.messageToTargetState(messageType);
    if (!targetState) return { success: true };

    return this.transition(merchantOrderId, targetState);
  }

  async applyResponseTransition(merchantOrderId: string, responseType: MerchantResponseType, estimatedReadyTime?: string): Promise<StateTransitionResult> {
    const targetState = this.responseToTargetState(responseType);
    if (!targetState) {
      return { success: false, error: `Unknown response type: ${responseType}` };
    }

    const result = await this.transition(merchantOrderId, targetState);
    if (result.success && estimatedReadyTime) {
      await this.prisma.merchantOrder.update({
        where: { id: merchantOrderId },
        data: { estimatedReadyAt: new Date(estimatedReadyTime) },
      });
    }
    return result;
  }

  async getCurrentState(merchantOrderId: string): Promise<string | null> {
    const order = await this.prisma.merchantOrder.findUnique({
      where: { id: merchantOrderId },
      select: { status: true },
    });
    return order?.status || null;
  }

  private async transition(merchantOrderId: string, targetState: string): Promise<StateTransitionResult> {
    const order = await this.prisma.merchantOrder.findUnique({
      where: { id: merchantOrderId },
      select: { status: true },
    });
    if (!order) return { success: false, error: 'Order not found' };

    const currentState = order.status;
    const allowed = STATE_TRANSITIONS[currentState];
    if (!allowed) {
      return { success: false, error: `No transitions allowed from ${currentState}` };
    }
    if (!allowed.includes(targetState)) {
      return { success: false, error: `Cannot transition from ${currentState} to ${targetState}` };
    }

    const updateData: any = { status: targetState };
    if (targetState === 'PREPARING') updateData.startedAt = new Date();
    if (targetState === 'READY') updateData.readyAt = new Date();
    if (targetState === 'PICKED_UP') updateData.pickedUpAt = new Date();
    if (targetState === 'COMPLETED') updateData.completedAt = new Date();
    if (targetState === 'REJECTED' || targetState === 'CANCELLED') updateData.cancelledAt = new Date();

    await this.prisma.merchantOrder.update({
      where: { id: merchantOrderId },
      data: updateData,
    });

    return { success: true, newState: targetState };
  }

  private messageToTargetState(type: MerchantMessageType): string | null {
    const map: Partial<Record<MerchantMessageType, string>> = {
      PREPARATION_STARTED: 'PREPARING',
      READY_FOR_PICKUP: 'READY',
      OUT_OF_STOCK: 'OUT_OF_STOCK',
      ORDER_COMPLETED: 'COMPLETED',
      ORDER_CANCELLED: 'CANCELLED',
      ORDER_REJECTED: 'REJECTED',
    };
    return map[type] || null;
  }

  private responseToTargetState(type: MerchantResponseType): string | null {
    const map: Record<MerchantResponseType, string> = {
      ACCEPT: 'ACCEPTED',
      REJECT: 'REJECTED',
      REQUEST_MORE_TIME: 'PREPARING',
      REQUEST_REPLACEMENT: 'OUT_OF_STOCK',
      READY: 'READY',
      CANCEL: 'CANCELLED',
    };
    return map[type] || null;
  }
}

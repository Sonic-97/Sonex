import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MerchantMessageValidator } from './merchant-message-validator';
import { MerchantStateCoordinator } from './merchant-state-coordinator';
import { MerchantEventPublisher } from './merchant-event-publisher';
import {
  MerchantMessage, MerchantMessageType, MerchantResponseType,
  MerchantResponse, MerchantCommunicationEvent,
  RESPONSE_TO_EVENT, MESSAGE_TO_EVENT,
  MERCHANT_MESSAGE_TYPES, MERCHANT_RESPONSE_TYPES,
} from './merchant-communication.types';

@Injectable()
export class MerchantCommunicationService {
  private readonly logger = new Logger(MerchantCommunicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: MerchantMessageValidator,
    private readonly stateCoordinator: MerchantStateCoordinator,
    private readonly eventPublisher: MerchantEventPublisher,
  ) {}

  onEvent(listener: (event: MerchantCommunicationEvent) => void): void {
    this.eventPublisher.onEvent(listener);
  }

  async receiveMessage(message: MerchantMessage, cafeId: string): Promise<MerchantResponse> {
    const validation = await this.validator.validateMessage(message, cafeId);
    if (!validation.valid) {
      await this.storeMessage(message, null, 'FAILED', validation.errorCode);
      return this.errorResponse(message, validation.errorCode!, validation.errorMessage!);
    }

    await this.storeMessage(message, null, 'PROCESSED');

    const transition = await this.stateCoordinator.applyMessageTransition(message.merchantOrderId, message.messageType);
    if (!transition.success) {
      return this.errorResponse(message, 'INVALID_TRANSITION' as any, transition.error || 'Transition failed');
    }

    const eventType = MESSAGE_TO_EVENT[message.messageType];
    if (eventType) {
      this.eventPublisher.publish(eventType, message.merchantId, message.merchantOrderId, message.customerOrderId, message.payload);
    }

    return this.successResponse(message, transition.newState || 'PROCESSED');
  }

  async receiveResponse(
    merchantId: string,
    merchantOrderId: string,
    customerOrderId: string,
    responseType: MerchantResponseType,
    cafeId: string,
    payload?: Record<string, unknown>,
  ): Promise<MerchantResponse> {
    const validation = await this.validator.validateResponse(merchantId, merchantOrderId, responseType, cafeId);
    if (!validation.valid) {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        merchantId,
        merchantOrderId,
        status: 'FAILED',
        messageCode: validation.errorCode || 'ERROR',
        metadata: { error: validation.errorMessage },
      };
    }

    const estimatedReadyTime = payload?.estimatedReadyTime as string | undefined;
    const transition = await this.stateCoordinator.applyResponseTransition(merchantOrderId, responseType, estimatedReadyTime);
    if (!transition.success) {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        merchantId,
        merchantOrderId,
        status: 'FAILED',
        messageCode: 'INVALID_TRANSITION',
        metadata: { error: transition.error },
      };
    }

    await this.storeResponse(merchantId, merchantOrderId, customerOrderId, responseType, payload);

    const eventType = RESPONSE_TO_EVENT[responseType];
    if (eventType) {
      this.eventPublisher.publish(eventType, merchantId, merchantOrderId, customerOrderId, payload);
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      merchantId,
      merchantOrderId,
      status: transition.newState || 'PROCESSED',
      estimatedReadyTime,
      messageCode: 'SUCCESS',
      metadata: payload || {},
    };
  }

  async getOrderHistory(merchantOrderId: string, merchantId: string): Promise<MerchantMessage[]> {
    const messages = await this.prisma.merchantMessage.findMany({
      where: { merchantOrderId, merchantId },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map(m => ({
      messageId: m.id,
      merchantId: m.merchantId,
      merchantOrderId: m.merchantOrderId,
      customerOrderId: m.customerOrderId,
      messageType: m.messageType as MerchantMessageType,
      timestamp: m.createdAt.toISOString(),
      payload: m.payload as Record<string, unknown>,
      metadata: m.metadata as Record<string, unknown>,
      version: m.version,
    }));
  }

  private async storeResponse(
    merchantId: string,
    merchantOrderId: string,
    customerOrderId: string,
    responseType: MerchantResponseType,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    const lastMsg = await this.prisma.merchantMessage.findFirst({
      where: { merchantId, merchantOrderId },
      orderBy: { version: 'desc' },
    });

    await this.prisma.merchantMessage.create({
      data: {
        merchantId,
        merchantOrderId,
        customerOrderId,
        messageType: responseType,
        responseType,
        payload: (payload || {}) as any,
        metadata: {},
        version: (lastMsg?.version || 0) + 1,
        status: 'PROCESSED',
        processedAt: new Date(),
      },
    });
  }

  private async storeMessage(
    message: MerchantMessage,
    responseType: string | null,
    status: string,
    errorCode?: string,
  ): Promise<void> {
    const lastMsg = await this.prisma.merchantMessage.findFirst({
      where: { merchantId: message.merchantId, merchantOrderId: message.merchantOrderId },
      orderBy: { version: 'desc' },
    });

    await this.prisma.merchantMessage.create({
      data: {
        merchantId: message.merchantId,
        merchantOrderId: message.merchantOrderId,
        customerOrderId: message.customerOrderId,
        messageType: message.messageType,
        responseType,
        payload: message.payload as any,
        metadata: message.metadata as any,
        version: (lastMsg?.version || 0) + 1,
        status,
        errorCode,
        processedAt: status === 'PROCESSED' ? new Date() : null,
      },
    });
  }

  private successResponse(message: MerchantMessage, status: string): MerchantResponse {
    return {
      success: true,
      timestamp: new Date().toISOString(),
      merchantId: message.merchantId,
      merchantOrderId: message.merchantOrderId,
      status,
      messageCode: 'SUCCESS',
      metadata: {},
    };
  }

  private errorResponse(message: MerchantMessage, code: string, error: string): MerchantResponse {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      merchantId: message.merchantId,
      merchantOrderId: message.merchantOrderId,
      status: 'FAILED',
      messageCode: code,
      metadata: { error },
    };
  }
}

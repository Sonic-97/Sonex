import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  MerchantMessage, MerchantMessageType, MerchantResponseType,
  MERCHANT_MESSAGE_TYPES, MERCHANT_RESPONSE_TYPES,
  MERCHANT_ERROR_CODES, STATE_ALLOWED_MESSAGES, STATE_ALLOWED_RESPONSES,
  MerchantErrorCode,
} from './merchant-communication.types';

export interface ValidationResult {
  valid: boolean;
  errorCode?: MerchantErrorCode;
  errorMessage?: string;
}

@Injectable()
export class MerchantMessageValidator {
  private readonly logger = new Logger(MerchantMessageValidator.name);

  constructor(private readonly prisma: PrismaService) {}

  async validateMessage(message: MerchantMessage, cafeId: string): Promise<ValidationResult> {
    const schema = this.validateSchema(message);
    if (!schema.valid) return schema;

    const merchant = await this.validateMerchant(message.merchantId, cafeId);
    if (!merchant.valid) return merchant;

    const order = await this.validateOrder(message.merchantOrderId, message.merchantId);
    if (!order.valid) return order;

    const dup = await this.checkDuplicate(message);
    if (!dup.valid) return dup;

    const state = await this.validateStateTransition(message.merchantOrderId, message.messageType);
    if (!state.valid) return state;

    return { valid: true };
  }

  async validateResponse(
    merchantId: string,
    merchantOrderId: string,
    responseType: MerchantResponseType,
    cafeId: string,
  ): Promise<ValidationResult> {
    if (!MERCHANT_RESPONSE_TYPES.includes(responseType)) {
      return { valid: false, errorCode: 'INVALID_TRANSITION', errorMessage: `Unknown response type: ${responseType}` };
    }

    const merchant = await this.validateMerchant(merchantId, cafeId);
    if (!merchant.valid) return merchant;

    const order = await this.validateOrder(merchantOrderId, merchantId);
    if (!order.valid) return order;

    const state = await this.validateResponseTransition(merchantOrderId, responseType);
    if (!state.valid) return state;

    return { valid: true };
  }

  private validateSchema(message: MerchantMessage): ValidationResult {
    if (!message.messageId) return { valid: false, errorCode: 'INVALID_TRANSITION', errorMessage: 'Missing messageId' };
    if (!message.merchantId) return { valid: false, errorCode: 'UNKNOWN_MERCHANT', errorMessage: 'Missing merchantId' };
    if (!message.merchantOrderId) return { valid: false, errorCode: 'UNKNOWN_ORDER', errorMessage: 'Missing merchantOrderId' };
    if (!MERCHANT_MESSAGE_TYPES.includes(message.messageType)) {
      return { valid: false, errorCode: 'INVALID_TRANSITION', errorMessage: `Unknown message type: ${message.messageType}` };
    }
    if (message.version < 1) return { valid: false, errorCode: 'VERSION_CONFLICT', errorMessage: 'Version must be >= 1' };
    return { valid: true };
  }

  private async validateMerchant(merchantId: string, cafeId: string): Promise<ValidationResult> {
    const cafe = await this.prisma.cafe.findUnique({ where: { id: cafeId } });
    if (!cafe || cafe.id !== merchantId) {
      return { valid: false, errorCode: 'UNKNOWN_MERCHANT', errorMessage: 'Merchant not found' };
    }
    if (!cafe.active) {
      return { valid: false, errorCode: 'MERCHANT_OFFLINE', errorMessage: 'Merchant is offline' };
    }
    return { valid: true };
  }

  private async validateOrder(merchantOrderId: string, merchantId: string): Promise<ValidationResult> {
    const order = await this.prisma.merchantOrder.findUnique({ where: { id: merchantOrderId } });
    if (!order) {
      return { valid: false, errorCode: 'UNKNOWN_ORDER', errorMessage: 'Merchant order not found' };
    }
    if (order.cafeId !== merchantId) {
      return { valid: false, errorCode: 'UNKNOWN_ORDER', errorMessage: 'Order does not belong to this merchant' };
    }
    return { valid: true };
  }

  private async checkDuplicate(message: MerchantMessage): Promise<ValidationResult> {
    const existing = await this.prisma.merchantMessage.findFirst({
      where: {
        merchantId: message.merchantId,
        merchantOrderId: message.merchantOrderId,
        messageType: message.messageType as string,
        version: message.version,
      },
    });
    if (existing) {
      return { valid: false, errorCode: 'DUPLICATE_MESSAGE', errorMessage: `Duplicate message: ${message.messageId}` };
    }
    return { valid: true };
  }

  private async validateStateTransition(merchantOrderId: string, messageType: MerchantMessageType): Promise<ValidationResult> {
    const order = await this.prisma.merchantOrder.findUnique({
      where: { id: merchantOrderId },
      select: { status: true },
    });
    if (!order) return { valid: false, errorCode: 'UNKNOWN_ORDER', errorMessage: 'Order not found' };

    const allowedMessages = STATE_ALLOWED_MESSAGES[order.status];
    if (!allowedMessages || !allowedMessages.includes(messageType)) {
      return {
        valid: false,
        errorCode: 'INVALID_TRANSITION',
        errorMessage: `Cannot send ${messageType} from state ${order.status}`,
      };
    }

    return { valid: true };
  }

  private async validateResponseTransition(merchantOrderId: string, responseType: MerchantResponseType): Promise<ValidationResult> {
    const order = await this.prisma.merchantOrder.findUnique({
      where: { id: merchantOrderId },
      select: { status: true },
    });
    if (!order) return { valid: false, errorCode: 'UNKNOWN_ORDER', errorMessage: 'Order not found' };

    const allowedResponses = STATE_ALLOWED_RESPONSES[order.status];
    if (!allowedResponses || !allowedResponses.includes(responseType)) {
      return {
        valid: false,
        errorCode: 'INVALID_TRANSITION',
        errorMessage: `Cannot ${responseType} from state ${order.status}`,
      };
    }

    return { valid: true };
  }
}

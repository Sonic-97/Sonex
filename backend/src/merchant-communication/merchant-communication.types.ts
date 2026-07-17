export const MERCHANT_MESSAGE_TYPES = [
  'NEW_ORDER', 'ORDER_UPDATED', 'ORDER_CANCELLED', 'ORDER_CONFIRMED',
  'ORDER_REJECTED', 'PREPARATION_STARTED', 'READY_FOR_PICKUP',
  'OUT_OF_STOCK', 'REPLACEMENT_PROPOSED', 'CUSTOMER_NOTE',
  'DELAY_NOTICE', 'ORDER_COMPLETED',
] as const;
export type MerchantMessageType = typeof MERCHANT_MESSAGE_TYPES[number];

export const MERCHANT_RESPONSE_TYPES = [
  'ACCEPT', 'REJECT', 'REQUEST_MORE_TIME', 'REQUEST_REPLACEMENT',
  'READY', 'CANCEL',
] as const;
export type MerchantResponseType = typeof MERCHANT_RESPONSE_TYPES[number];

export const MERCHANT_MESSAGE_STATUSES = ['PENDING', 'PROCESSED', 'FAILED'] as const;
export type MerchantMessageStatus = typeof MERCHANT_MESSAGE_STATUSES[number];

export const MERCHANT_ERROR_CODES = [
  'MERCHANT_OFFLINE', 'UNKNOWN_MERCHANT', 'UNKNOWN_ORDER',
  'DUPLICATE_MESSAGE', 'VERSION_CONFLICT', 'INVALID_TRANSITION',
  'TIMEOUT',
] as const;
export type MerchantErrorCode = typeof MERCHANT_ERROR_CODES[number];

export const ORDER_STATES = [
  'NEW_ORDER', 'ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP', 'COMPLETED',
  'REJECTED', 'CANCELLED', 'OUT_OF_STOCK',
] as const;
export type OrderState = typeof ORDER_STATES[number];

export interface MerchantMessage {
  messageId: string;
  merchantId: string;
  merchantOrderId: string;
  customerOrderId: string;
  messageType: MerchantMessageType;
  timestamp: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  version: number;
}

export interface MerchantResponse {
  success: boolean;
  timestamp: string;
  merchantId: string;
  merchantOrderId: string;
  status: string;
  estimatedReadyTime?: string;
  messageCode: string;
  metadata: Record<string, unknown>;
}

export interface MerchantCommunicationEvent {
  type: string;
  merchantId: string;
  merchantOrderId: string;
  customerOrderId: string;
  messageType?: MerchantMessageType;
  responseType?: MerchantResponseType;
  payload?: Record<string, unknown>;
  timestamp: string;
}

export const STATE_TRANSITIONS: Record<string, string[]> = {
  NEW_ORDER: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['PREPARING', 'REJECTED', 'CANCELLED'],
  PREPARING: ['READY', 'OUT_OF_STOCK', 'REJECTED', 'CANCELLED', 'PREPARING'],
  READY: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['COMPLETED', 'CANCELLED'],
  OUT_OF_STOCK: ['OUT_OF_STOCK', 'CANCELLED'],
};

export const STATE_ALLOWED_MESSAGES: Record<string, MerchantMessageType[]> = {
  NEW_ORDER: ['NEW_ORDER', 'ORDER_UPDATED', 'ORDER_CANCELLED'],
  ACCEPTED: ['PREPARATION_STARTED', 'OUT_OF_STOCK', 'CUSTOMER_NOTE', 'DELAY_NOTICE', 'ORDER_CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'OUT_OF_STOCK', 'CUSTOMER_NOTE', 'DELAY_NOTICE', 'ORDER_CANCELLED', 'ORDER_UPDATED'],
  READY: ['ORDER_COMPLETED', 'ORDER_CANCELLED', 'ORDER_UPDATED'],
  PICKED_UP: ['ORDER_COMPLETED', 'ORDER_CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
};

export const STATE_ALLOWED_RESPONSES: Record<string, MerchantResponseType[]> = {
  NEW_ORDER: ['ACCEPT', 'REJECT'],
  ACCEPTED: ['CANCEL'],
  PREPARING: ['CANCEL', 'REQUEST_MORE_TIME', 'REQUEST_REPLACEMENT'],
  READY: ['CANCEL'],
  PICKED_UP: [],
  REJECTED: [],
  CANCELLED: [],
  OUT_OF_STOCK: ['REQUEST_REPLACEMENT', 'CANCEL'],
};

export const MESSAGE_TO_STATE: Record<string, string> = {
  NEW_ORDER: 'NEW_ORDER',
  ACCEPT: 'ACCEPTED',
  REJECT: 'REJECTED',
  PREPARATION_STARTED: 'PREPARING',
  READY_FOR_PICKUP: 'READY',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  CUSTOMER_NOTE: null as any,
  DELAY_NOTICE: 'PREPARING',
  ORDER_COMPLETED: 'COMPLETED',
  CANCEL: 'CANCELLED',
};

export const RESPONSE_TO_EVENT: Record<string, string> = {
  ACCEPT: 'MerchantAccepted',
  REJECT: 'MerchantRejected',
  REQUEST_MORE_TIME: 'MerchantDelayed',
  REQUEST_REPLACEMENT: 'ReplacementRequested',
  READY: 'MerchantReady',
  CANCEL: 'MerchantCancelled',
};

export const MESSAGE_TO_EVENT: Record<string, string> = {
  PREPARATION_STARTED: 'PreparationStarted',
  READY_FOR_PICKUP: 'MerchantReady',
  OUT_OF_STOCK: 'OutOfStock',
  REPLACEMENT_PROPOSED: 'ReplacementProposed',
  CUSTOMER_NOTE: 'CustomerNoteReceived',
  DELAY_NOTICE: 'MerchantDelayed',
  ORDER_COMPLETED: 'MerchantCompleted',
  ORDER_CANCELLED: 'MerchantCancelled',
};

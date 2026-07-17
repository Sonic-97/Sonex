export const ADAPTER_EVENT_TYPES = {
  MESSAGE_RECEIVED: 'adapter.message.received',
  MESSAGE_SENT: 'adapter.message.sent',
  DELIVERY_CONFIRMED: 'adapter.delivery.confirmed',
  DELIVERY_FAILED: 'adapter.delivery.failed',
} as const;

export interface AdapterMessageReceivedPayload {
  channelType: string;
  sessionId: string;
  externalId: string;
  cafeId: string;
  messageType: string;
  timestamp: string;
}

export interface AdapterMessageSentPayload {
  channelType: string;
  sessionId: string;
  cafeId: string;
  messageType: string;
  deliveryStatus: string;
  timestamp: string;
}

export interface AdapterDeliveryConfirmedPayload {
  channelType: string;
  sessionId: string;
  externalMessageId: string;
  cafeId: string;
  timestamp: string;
}

export interface AdapterDeliveryFailedPayload {
  channelType: string;
  sessionId: string;
  externalMessageId: string;
  cafeId: string;
  error: string;
  timestamp: string;
}

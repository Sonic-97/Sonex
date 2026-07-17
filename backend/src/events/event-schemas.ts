export interface EventEnvelope<T = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  eventVersion: number;
  timestamp: string;
  source: string;
  cafeId: string;
  correlationId: string;
  causationId: string;
  payload: T;
}

export interface MessageReceivedPayload {
  messageId: string;
  remoteJid: string;
  message: string;
  participant?: string;
  fromMe: boolean;
  timestamp: number;
}

export interface SenderResolvedPayload {
  remoteJid: string;
  phone: string;
  phoneJid: string;
  resolutionPath: 'lid_mapping' | 'contacts_store' | 'session_cache' | 'customer_record' | 'direct';
  cafeId: string;
  messageBody?: string;
  messageId?: string;
}

export interface MessageParsedPayload {
  phone: string;
  message: string;
  intent: 'create_order' | 'order_flow' | 'unknown' | 'inquiry';
  confidence: number;
  entities?: {
    items?: Array<{ name: string; quantity: number }>;
    customerName?: string;
    notes?: string;
    isRepeatOrder?: boolean;
  };
  cafeId: string;
}

export interface OrderCreatedPayload {
  orderId: string;
  orderCode: string;
  cafeId: string;
  branchId: string;
  customerId: string;
  customerPhone: string;
  status: string;
  total: number;
  items: Array<{ productId: string; productName: string; quantity: number; unitPrice: number; options?: Record<string, string> }>;
  sourceType: string;
  source: string;
  createdAt: string;
  createdById?: string;
  employeeId?: string;
}

export interface OrderStatusChangedPayload {
  orderId: string;
  from: string;
  to: string;
  cafeId: string;
  branchId: string;
  total: number;
  customerPhone: string;
  customerName: string;
  timestamp: string;
}

export interface InventoryDeductedPayload {
  orderId: string;
  cafeId: string;
  branchId: string;
  deductions: Array<{ inventoryId: string; itemName: string; quantityDeducted: number; unit: string; remainingStock: number; costPerUnit: number; totalCost: number }>;
  totalCost: number;
  stockDeductedAt: string;
}

export interface PaymentCollectedPayload {
  paymentId?: string;
  orderId: string;
  orderCode: string;
  cafeId: string;
  branchId: string;
  amount: number;
  method: 'CASH' | 'CARD' | 'WALLET';
  paymentStatus: 'PAID' | 'PARTIAL_PAYMENT';
  remainingAmount: number;
  collectedById: string;
  collectedByRole: 'BARISTA' | 'DRIVER' | 'OWNER';
  collectedAt: string;
  isDelivery: boolean;
}

export interface PendingReplyCreatedPayload {
  pendingReplyId: string;
  lid: string;
  message: string;
  cafeId: string;
  createdAt: string;
}

export interface PendingReplyResolvedPayload {
  pendingReplyId: string;
  lid: string;
  phoneJid: string;
  resolvedAt: string;
}

export interface WebhookRegisteredPayload {
  sessionId: string;
  webhookUrl: string;
  success: boolean;
  registeredAt: string;
  cafeId?: string;
}

export interface SessionRecoveredPayload {
  tempPhone: string;
  realPhone: string;
  cafeId: string;
  hadSession: boolean;
  hadPendingReply: boolean;
}

export interface LidMappingUpsertedPayload {
  lid: string;
  phone: string;
  phoneJid: string;
  source: string;
  cafeId: string;
}

export interface MessageAcceptedPayload {
  messageId: string;
  phone: string;
  message: string;
  cafeId: string;
}

export type EventPayloadMap = {
  'message.received': MessageReceivedPayload;
  'sender.resolved': SenderResolvedPayload;
  'message.parsed': MessageParsedPayload;
  'message.accepted': MessageAcceptedPayload;
  'order.created': OrderCreatedPayload;
  'order.status.changed': OrderStatusChangedPayload;
  'inventory.deducted': InventoryDeductedPayload;
  'payment.collected': PaymentCollectedPayload;
  'pending-reply.created': PendingReplyCreatedPayload;
  'pending-reply.resolved': PendingReplyResolvedPayload;
  'lid-mapping.upserted': LidMappingUpsertedPayload;
  'webhook.registered': WebhookRegisteredPayload;
  'session.recovered': SessionRecoveredPayload;
};

export type CustomerOrderStatus =
  | 'CREATED'
  | 'PROCESSING'
  | 'PARTIALLY_READY'
  | 'READY_FOR_PICKUP'
  | 'COLLECTING'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

export type MerchantOrderStatus =
  | 'CREATED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'PICKED_UP'
  | 'COMPLETED'
  | 'CANCELLED';

export interface OrderItemInput {
  productName: string;
  quantity: number;
  unitPrice: number;
  cafeId: string;
  businessName?: string;
  businessType?: string;
  notes?: string;
}

export interface SplitGroup {
  cafeId: string;
  businessName: string;
  businessType: string;
  items: OrderItemInput[];
  subtotal: number;
}

export interface DriverPickupStop {
  merchantOrderId: string;
  cafeId: string;
  businessName: string;
  sequence: number;
  estimatedReadyAt: string | null;
  status: MerchantOrderStatus;
}

export type OrchestratorEventType =
  | 'CustomerOrderCreated'
  | 'MerchantOrderCreated'
  | 'MerchantAccepted'
  | 'MerchantRejected'
  | 'MerchantReady'
  | 'MerchantDelayed'
  | 'DriverAssigned'
  | 'PickupStarted'
  | 'PickupCompleted'
  | 'CustomerDelivered'
  | 'PartialFailure'
  | 'ReplacementRequested'
  | 'ReplacementAccepted'
  | 'ReplacementRejected';

export interface OrchestratorEvent {
  type: OrchestratorEventType;
  customerOrderId: string;
  merchantOrderId?: string;
  cafeId?: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface CreateCustomerOrderInput {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  deliveryMethod?: string;
  items: OrderItemInput[];
  deliveryFee?: number;
}

export interface ReplacementProposal {
  merchantOrderId: string;
  cafeId: string;
  originalProductName: string;
  suggestedProductName: string;
  suggestedProductId: string;
  reason: string;
}

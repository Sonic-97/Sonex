export interface CustomerLoginRequest {
  phone: string;
  cafeId: string;
}

export interface CustomerLoginResponse {
  token: string;
  customerId: string;
  name: string;
  expiresAt: string;
}

export interface CustomerMessageRequest {
  message: string;
}

export interface CustomerConfirmRequest {
  confirmed: boolean;
}

export interface CustomerCancelRequest {
  orderId: string;
}

export interface AuthPayload {
  customerId: string;
  cafeId: string;
}

export interface CustomerSession {
  customerId: string;
  cafeId: string;
  phone: string;
  currentStep: string;
  collectedInformation: Record<string, unknown>;
  missingInformation: string[];
  currentIntent?: string;
}

export interface CustomerApiResponse {
  success: boolean;
  type: 'conversation' | 'clarification' | 'confirmation' | 'execution' | 'order_status' | 'recommendations' | 'error';
  data?: unknown;
  message?: string;
  requiresConfirmation?: boolean;
}

export interface CustomerOrderItem {
  productName: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

export interface CustomerOrderResponse {
  orderId: string;
  status: string;
  items: CustomerOrderItem[];
  subtotal: string;
  deliveryFee: string;
  grandTotal: string;
  createdAt: string;
  merchantOrders: Array<{
    merchantOrderId: string;
    cafeId: string;
    businessName: string;
    status: string;
  }>;
}

export interface CustomerRecommendation {
  productId: string;
  name: string;
  reason: string;
  priority: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error: string;
}

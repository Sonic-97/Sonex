export interface LoginRequest {
  merchantId: string;
  apiKey: string;
}

export interface LoginResponse {
  token: string;
  merchantId: string;
  expiresAt: string;
}

export interface MerchantActionRequest {
  merchantOrderId: string;
  customerOrderId: string;
  reason?: string;
  estimatedReadyTime?: string;
  productName?: string;
  extraMinutes?: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error: string;
}

export interface AuthPayload {
  merchantId: string;
  cafeId: string;
}

export interface AvailabilityUpdateRequest {
  action: 'pause' | 'resume';
}

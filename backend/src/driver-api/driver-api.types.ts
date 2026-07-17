export interface DriverLoginRequest {
  driverId: string;
  apiKey: string;
}

export interface DriverLoginResponse {
  token: string;
  driverId: string;
  expiresAt: string;
}

export interface DriverProfileResponse {
  driverId: string;
  name: string;
  phone: string;
  status: string;
  vehicleType: string;
  capacity: number;
  activeAssignments: number;
  totalDeliveries: number;
  todayEarnings?: number;
}

export interface DriverAssignmentResponse {
  assignmentId: string;
  merchantOrderId: string;
  customerOrderId: string;
  status: string;
  score: number | null;
  assignedAt: string;
  expiresAt: string | null;
  respondedAt: string | null;
  merchantName: string;
  merchantStatus: string;
  pickupSequence: number;
  estimatedReadyAt: string | null;
}

export interface DriverLocationUpdate {
  latitude: number;
  longitude: number;
}

export interface DriverStatusUpdate {
  status: 'ONLINE' | 'OFFLINE' | 'PAUSED';
}

export interface AuthPayload {
  driverId: string;
}

export interface DriverActionResponse {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error: string;
}

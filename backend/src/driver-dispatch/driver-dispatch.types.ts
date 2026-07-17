export type DriverStatus = 'OFFLINE' | 'ONLINE' | 'BUSY' | 'ON_PICKUP' | 'ON_DELIVERY' | 'PAUSED';

export type AssignmentStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'TIMEOUT' | 'CANCELLED';

export type DispatchEventType =
  | 'DriverFound'
  | 'DriverScored'
  | 'DriverAssigned'
  | 'DriverAccepted'
  | 'DriverRejected'
  | 'DriverTimeout';

export interface DispatchWeights {
  distance: number;
  workload: number;
  acceptanceRate: number;
  merchantPriority: number;
}

export const DEFAULT_DISPATCH_WEIGHTS: DispatchWeights = {
  distance: 0.4,
  workload: 0.25,
  acceptanceRate: 0.2,
  merchantPriority: 0.15,
};

export interface DispatchableDriver {
  driverId: string;
  name: string;
  phone: string;
  driverStatus: DriverStatus;
  vehicleType: string;
  merchantZoneId?: string;
  currentLatitude: number | null;
  currentLongitude: number | null;
  capacity: number;
  activeAssignments: number;
  acceptanceRate: number;
  lastHeartbeat: Date | null;
  distance: number;
}

export interface DriverScore {
  driverId: string;
  distance: number;
  distanceScore: number;
  workloadScore: number;
  acceptanceScore: number;
  priorityScore: number;
  totalScore: number;
}

export interface DispatchAssignment {
  assignmentId: string;
  driverId: string;
  merchantOrderId: string;
  status: AssignmentStatus;
  score: number | null;
  assignedAt: Date;
  expiresAt: Date | null;
}

export interface DispatchEvent {
  type: DispatchEventType;
  assignmentId: string;
  driverId?: string;
  merchantOrderId: string;
  score?: number;
  timestamp: string;
}

export type PresenceEventType =
  | 'DriverOnline'
  | 'DriverOffline'
  | 'HeartbeatReceived'
  | 'DriverPaused'
  | 'DriverResumed'
  | 'LocationUpdated';

export interface PresenceEvent {
  type: PresenceEventType;
  driverId: string;
  previousStatus?: string;
  currentStatus?: string;
  latitude?: number;
  longitude?: number;
  timestamp: string;
}

export interface PresenceConfig {
  heartbeatTimeoutMs: number;
}

export const DEFAULT_PRESENCE_CONFIG: PresenceConfig = {
  heartbeatTimeoutMs: 300000,
};

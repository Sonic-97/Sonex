export type MerchantStatus =
  | 'OPEN'
  | 'BUSY'
  | 'VERY_BUSY'
  | 'PAUSED'
  | 'CLOSED'
  | 'OFFLINE';

export type MerchantAvailabilityEventType =
  | 'MerchantBusy'
  | 'MerchantRecovered'
  | 'MerchantPaused'
  | 'MerchantOpened'
  | 'MerchantClosed'
  | 'ETAChanged';

export interface MerchantAvailabilityData {
  cafeId: string;
  status: MerchantStatus;
  queueLength: number;
  currentETA: number;
  averagePreparationTime: number;
  maxQueue: number;
  maxConcurrentOrders: number;
  activeOrderCount: number;
}

export interface MerchantAvailabilityEvent {
  type: MerchantAvailabilityEventType;
  cafeId: string;
  previousStatus?: MerchantStatus;
  currentStatus: MerchantStatus;
  queueLength: number;
  currentETA: number;
  timestamp: string;
}

export const STATUS_THRESHOLDS = {
  busyRatio: 0.5,
  veryBusyRatio: 0.8,
};

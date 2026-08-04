export enum InCafeOrderStatus {
  NEW = 'NEW',
  PREPARING = 'PREPARING',
  READY = 'READY',
  DELIVERED = 'DELIVERED',
  COMPLETED = 'COMPLETED',
  ON_HOLD = 'ON_HOLD',
  VOID = 'VOID',
}

export interface InCafeOrderTransitionRule {
  next: string[];
  allowedRoles: string[];
}

export const IN_CAFE_ORDER_TRANSITIONS: Record<string, InCafeOrderTransitionRule> = {
  [InCafeOrderStatus.NEW]: { next: [InCafeOrderStatus.PREPARING, InCafeOrderStatus.ON_HOLD], allowedRoles: ['BARISTA', 'Cafe'] },
  [InCafeOrderStatus.PREPARING]: { next: [InCafeOrderStatus.READY, InCafeOrderStatus.ON_HOLD], allowedRoles: ['BARISTA', 'Cafe'] },
  [InCafeOrderStatus.ON_HOLD]: { next: [InCafeOrderStatus.PREPARING, InCafeOrderStatus.NEW], allowedRoles: ['BARISTA', 'Cafe'] },
  [InCafeOrderStatus.READY]: { next: [InCafeOrderStatus.DELIVERED], allowedRoles: ['BARISTA', 'Cafe'] },
  [InCafeOrderStatus.DELIVERED]: { next: [InCafeOrderStatus.COMPLETED], allowedRoles: ['BARISTA', 'Cafe'] },
  [InCafeOrderStatus.COMPLETED]: { next: [], allowedRoles: [] },
  [InCafeOrderStatus.VOID]: { next: [], allowedRoles: [] },
};

export const IN_CAFE_ORDER_STATUSES = Object.values(InCafeOrderStatus);

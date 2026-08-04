import { OrderStatus } from '../dto/update-order-status.dto';

export type OrderTimestampField =
  | 'confirmedAt'
  | 'preparedAt'
  | 'readyAt'
  | 'pickedUpAt'
  | 'deliveredAt'
  | 'paidAt'
  | 'closedAt'
  | 'cancelledAt';

export interface OrderTransitionRule {
  next: OrderStatus | null;
  allowedRoles: string[];
  timestampField: OrderTimestampField | null;
}

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderTransitionRule> = {
  [OrderStatus.NEW]:        { next: OrderStatus.CONFIRMED, allowedRoles: ['BARISTA', 'Cafe'], timestampField: 'confirmedAt' },
  [OrderStatus.CONFIRMED]:  { next: OrderStatus.PREPARING, allowedRoles: ['BARISTA', 'Cafe'], timestampField: 'preparedAt' },
  [OrderStatus.PREPARING]:  { next: OrderStatus.READY,     allowedRoles: ['BARISTA', 'Cafe'], timestampField: 'readyAt' },
  [OrderStatus.READY]:      { next: OrderStatus.PICKED_UP, allowedRoles: ['DELIVERY', 'Cafe'], timestampField: 'pickedUpAt' },
  [OrderStatus.PICKED_UP]:  { next: OrderStatus.DELIVERED, allowedRoles: ['DELIVERY', 'Cafe'], timestampField: 'deliveredAt' },
  [OrderStatus.DELIVERED]:  { next: OrderStatus.PAID,      allowedRoles: ['DELIVERY', 'BARISTA', 'Cafe'], timestampField: 'paidAt' },
  [OrderStatus.PAID]:       { next: OrderStatus.CLOSED,    allowedRoles: ['Cafe', 'BARISTA'], timestampField: 'closedAt' },
  [OrderStatus.CLOSED]:     { next: null,                  allowedRoles: [], timestampField: null },
  [OrderStatus.CANCELLED]:  { next: null,                  allowedRoles: [], timestampField: 'cancelledAt' },
};

export const ORDER_TIMESTAMP_FIELDS: OrderTimestampField[] = [
  'confirmedAt',
  'preparedAt',
  'readyAt',
  'pickedUpAt',
  'deliveredAt',
  'paidAt',
  'closedAt',
  'cancelledAt',
];

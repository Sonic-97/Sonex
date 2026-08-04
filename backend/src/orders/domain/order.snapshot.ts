import { createHash } from 'crypto';
import { OrderStatus } from '../dto/update-order-status.dto';

export const CURRENT_ORDER_SNAPSHOT_SCHEMA_VERSION = 1;

export interface OrderItemSnapshot {
  productId: string;
  quantity: number;
  unitPrice: string;
  notes: string | null;
}

export interface OrderSnapshot {
  snapshotSchemaVersion: number;
  aggregateVersion: number;
  id: string;
  cafeId: string;
  branchId: string;
  customerId: string;
  code: string;
  status: OrderStatus;
  type: string;
  source: string;
  sourceType: string;
  address: string | null;
  staffId: string | null;
  employeeId: string | null;
  createdById: string | null;
  externalId: string | null;
  total: string;
  stockDeducted: boolean;
  paymentStatus: string | null;
  items: OrderItemSnapshot[];
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  preparedAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  paidAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  checksum: string;
}

export class OrderSerializer {
  static serialize(snapshot: Omit<OrderSnapshot, 'checksum'>): string {
    return JSON.stringify(snapshot);
  }

  static computeChecksum(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  static addChecksum(snapshot: Omit<OrderSnapshot, 'checksum'>): OrderSnapshot {
    return { ...snapshot, checksum: this.computeChecksum(this.serialize(snapshot)) };
  }

  static validateChecksum(snapshot: OrderSnapshot): boolean {
    const { checksum, ...rest } = snapshot;
    return this.computeChecksum(this.serialize(rest as Omit<OrderSnapshot, 'checksum'>)) === checksum;
  }

  static assertRequiredFields(snapshot: Record<string, unknown>): void {
    const required = ['id', 'cafeId', 'branchId', 'customerId', 'code', 'status', 'type', 'total'];
    for (const field of required) {
      if (snapshot[field] === undefined || snapshot[field] === null) {
        throw new Error(`Missing required field ${field} in OrderSnapshot`);
      }
    }
  }

  static deserialize(data: string): OrderSnapshot {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    this.assertRequiredFields(parsed);
    const snapshot = parsed as unknown as OrderSnapshot;
    if (!this.validateChecksum(snapshot)) {
      throw new Error('OrderSnapshot checksum validation failed');
    }
    return snapshot;
  }

  static storeJson(snapshot: OrderSnapshot): string {
    return JSON.stringify(snapshot);
  }
}

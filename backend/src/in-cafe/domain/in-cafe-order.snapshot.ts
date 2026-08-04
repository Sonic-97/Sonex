import { createHash } from 'crypto';
import { PaymentStatus } from '../dto/update-payment.dto';

export const CURRENT_IN_CAFE_ORDER_SNAPSHOT_SCHEMA_VERSION = 1;

export interface InCafeOrderItemSnapshot {
  productId: string;
  quantity: number;
  unitPrice: string;
  notes: string | null;
  selectedOptions: unknown[];
}

export interface InCafeOrderSnapshot {
  snapshotSchemaVersion: number;
  aggregateVersion: number;
  id: string;
  cafeId: string;
  branchId: string;
  code: string;
  customerName: string;
  customerPhone: string | null;
  customerId: string | null;
  notes: string | null;
  createdById: string | null;
  status: string;
  isPaid: boolean;
  paymentStatus: PaymentStatus | string;
  paymentMethod: string | null;
  total: string;
  paidAmount: string;
  remainingBalance: string;
  paymentTimestamp: string | null;
  voidReason: string | null;
  orderType: string;
  tableNumber: string | null;
  employeeId: string | null;
  sourceType: string;
  stockDeducted: boolean;
  isRevenueConfirmed: boolean;
  items: InCafeOrderItemSnapshot[];
  createdAt: string;
  updatedAt: string;
  checksum: string;
}

export class InCafeOrderSerializer {
  static serialize(snapshot: Omit<InCafeOrderSnapshot, 'checksum'>): string {
    return JSON.stringify(snapshot);
  }

  static computeChecksum(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  static addChecksum(snapshot: Omit<InCafeOrderSnapshot, 'checksum'>): InCafeOrderSnapshot {
    return { ...snapshot, checksum: this.computeChecksum(this.serialize(snapshot)) };
  }

  static validateChecksum(snapshot: InCafeOrderSnapshot): boolean {
    const { checksum, ...rest } = snapshot;
    return this.computeChecksum(this.serialize(rest as Omit<InCafeOrderSnapshot, 'checksum'>)) === checksum;
  }

  static assertRequiredFields(snapshot: Record<string, unknown>): void {
    const required = ['id', 'cafeId', 'branchId', 'code', 'status', 'total', 'customerName'];
    for (const field of required) {
      if (snapshot[field] === undefined || snapshot[field] === null) {
        throw new Error(`Missing required field ${field} in InCafeOrderSnapshot`);
      }
    }
  }

  static deserialize(data: string): InCafeOrderSnapshot {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    this.assertRequiredFields(parsed);
    const snapshot = parsed as unknown as InCafeOrderSnapshot;
    if (!this.validateChecksum(snapshot)) {
      throw new Error('InCafeOrderSnapshot checksum validation failed');
    }
    return snapshot;
  }

  static storeJson(snapshot: InCafeOrderSnapshot): string {
    return JSON.stringify(snapshot);
  }
}

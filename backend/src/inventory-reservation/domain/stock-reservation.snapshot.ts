import { createHash } from 'crypto';

export const CURRENT_SNAPSHOT_SCHEMA_VERSION = 1;

export type StockReservationStatus = 'ACTIVE' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED';

export interface StockReservationSnapshot {
  snapshotSchemaVersion: number;
  aggregateVersion: number;
  id: string;
  cafeId: string;
  inventoryId: string;
  orderId: string;
  quantity: string;
  status: StockReservationStatus;
  createdAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  checksum: string;
}

function serializeContent(snapshot: Omit<StockReservationSnapshot, 'checksum'>): string {
  return JSON.stringify({
    snapshotSchemaVersion: snapshot.snapshotSchemaVersion,
    aggregateVersion: snapshot.aggregateVersion,
    id: snapshot.id,
    cafeId: snapshot.cafeId,
    inventoryId: snapshot.inventoryId,
    orderId: snapshot.orderId,
    quantity: snapshot.quantity,
    status: snapshot.status,
    createdAt: snapshot.createdAt,
    confirmedAt: snapshot.confirmedAt,
    releasedAt: snapshot.releasedAt,
  });
}

export class StockReservationSerializer {
  static serialize(snapshot: Omit<StockReservationSnapshot, 'checksum'>): string {
    return serializeContent(snapshot);
  }

  static computeChecksum(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  static addChecksum(snapshot: Omit<StockReservationSnapshot, 'checksum'>): StockReservationSnapshot {
    const serialized = this.serialize(snapshot);
    const checksum = this.computeChecksum(serialized);
    return { ...snapshot, checksum };
  }

  static validateChecksum(snapshot: StockReservationSnapshot): boolean {
    const { checksum, ...rest } = snapshot;
    const serialized = serializeContent(rest);
    const expected = this.computeChecksum(serialized);
    return expected === checksum;
  }

  static deserialize(data: string): StockReservationSnapshot {
    const parsed = JSON.parse(data);
    this.assertRequiredFields(parsed);
    const snapshot: StockReservationSnapshot = {
      snapshotSchemaVersion: parsed.snapshotSchemaVersion,
      aggregateVersion: parsed.aggregateVersion,
      id: parsed.id,
      cafeId: parsed.cafeId,
      inventoryId: parsed.inventoryId,
      orderId: parsed.orderId,
      quantity: String(parsed.quantity),
      status: parsed.status,
      createdAt: parsed.createdAt,
      confirmedAt: parsed.confirmedAt ?? null,
      releasedAt: parsed.releasedAt ?? null,
      checksum: parsed.checksum,
    };
    if (!this.validateChecksum(snapshot)) {
      throw new Error('Snapshot checksum validation failed');
    }
    return snapshot;
  }

  static storeJson(snapshot: StockReservationSnapshot): string {
    return JSON.stringify(snapshot);
  }

  private static assertRequiredFields(data: Record<string, unknown>): void {
    const required = ['snapshotSchemaVersion', 'aggregateVersion', 'id', 'cafeId', 'inventoryId', 'orderId', 'quantity', 'status', 'createdAt', 'checksum'];
    for (const field of required) {
      if (data[field] === undefined || data[field] === null) {
        throw new Error(`Snapshot missing required field: ${field}`);
      }
    }
  }
}

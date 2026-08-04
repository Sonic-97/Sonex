import { createHash } from 'crypto';
import { MoneyData } from './value-objects/money';

export const CURRENT_SNAPSHOT_SCHEMA_VERSION = 1;

export interface PaymentIntentSnapshot {
  snapshotSchemaVersion: number;
  aggregateVersion: number;
  id: string;
  tenantId: string;
  status: string;
  amount: MoneyData;
  orderId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  checksum: string;
}

function serializeContent(snapshot: Omit<PaymentIntentSnapshot, 'checksum'>): string {
  const { snapshotSchemaVersion, aggregateVersion, id, tenantId, status, amount, orderId, metadata, createdAt, updatedAt } = snapshot;
  return JSON.stringify({
    snapshotSchemaVersion,
    aggregateVersion,
    id,
    tenantId,
    status,
    amount: { currency: amount.currency, amount: amount.amount },
    orderId,
    metadata,
    createdAt,
    updatedAt,
  });
}

function serializeFull(snapshot: PaymentIntentSnapshot): string {
  return JSON.stringify(snapshot);
}

export class SnapshotSerializer {
  static serialize(snapshot: Omit<PaymentIntentSnapshot, 'checksum'>): string {
    return serializeContent(snapshot);
  }

  static computeChecksum(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  static addChecksum(snapshot: Omit<PaymentIntentSnapshot, 'checksum'>): PaymentIntentSnapshot {
    const serialized = this.serialize(snapshot);
    const checksum = this.computeChecksum(serialized);
    return { ...snapshot, checksum };
  }

  static validateChecksum(snapshot: PaymentIntentSnapshot): boolean {
    const { checksum, ...rest } = snapshot;
    const serialized = serializeContent(rest);
    const expected = this.computeChecksum(serialized);
    return expected === checksum;
  }

  static deserialize(data: string): PaymentIntentSnapshot {
    const parsed = JSON.parse(data);
    this.assertRequiredFields(parsed);
    this.assertSchemaVersion(parsed.snapshotSchemaVersion);
    const snapshot: PaymentIntentSnapshot = {
      snapshotSchemaVersion: parsed.snapshotSchemaVersion,
      aggregateVersion: parsed.aggregateVersion,
      id: parsed.id,
      tenantId: parsed.tenantId,
      status: parsed.status,
      amount: parsed.amount,
      orderId: parsed.orderId,
      metadata: parsed.metadata ?? {},
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
      checksum: parsed.checksum,
    };
    if (!this.validateChecksum(snapshot)) {
      throw new Error('Snapshot checksum validation failed — data may be corrupted');
    }
    return snapshot;
  }

  static migrate(snapshot: PaymentIntentSnapshot): PaymentIntentSnapshot {
    if (!this.validateChecksum(snapshot)) {
      throw new Error(`Corrupted snapshot for PaymentIntent ${snapshot.id} — checksum mismatch`);
    }
    let current = { ...snapshot };
    while (current.snapshotSchemaVersion < CURRENT_SNAPSHOT_SCHEMA_VERSION) {
      if (current.snapshotSchemaVersion === 0) {
        current = this.migrateV0toV1(current);
      } else {
        throw new Error(`No migration path for schema version ${current.snapshotSchemaVersion}`);
      }
    }
    const rest: Omit<PaymentIntentSnapshot, 'checksum'> = {
      snapshotSchemaVersion: current.snapshotSchemaVersion,
      aggregateVersion: current.aggregateVersion,
      id: current.id,
      tenantId: current.tenantId,
      status: current.status,
      amount: current.amount,
      orderId: current.orderId,
      metadata: current.metadata,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
    };
    return this.addChecksum(rest);
  }

  static storeJson(snapshot: PaymentIntentSnapshot): string {
    return serializeFull(snapshot);
  }

  private static migrateV0toV1(snapshot: PaymentIntentSnapshot): PaymentIntentSnapshot {
    return {
      ...snapshot,
      snapshotSchemaVersion: 1,
      metadata: snapshot.metadata ?? {},
    };
  }

  private static assertRequiredFields(data: Record<string, unknown>): void {
    const required = ['snapshotSchemaVersion', 'aggregateVersion', 'id', 'tenantId', 'status', 'amount', 'orderId', 'checksum'];
    for (const field of required) {
      if (data[field] === undefined || data[field] === null) {
        throw new Error(`Snapshot missing required field: ${field}`);
      }
    }
  }

  private static assertSchemaVersion(version: number): void {
    if (version > CURRENT_SNAPSHOT_SCHEMA_VERSION) {
      throw new Error(`Unsupported future schema version: ${version}. Current max: ${CURRENT_SNAPSHOT_SCHEMA_VERSION}`);
    }
  }
}

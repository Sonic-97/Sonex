import { createHash } from 'node:crypto';
import { canonicalJson, deepFreeze, type JsonValue } from '../shared-kernel';

export type PaymentIntentSnapshot = Readonly<{
  snapshotSchemaVersion: 1;
  aggregateId: string;
  tenantId: string;
  aggregateVersion: number;
  createdAt: string;
  updatedAt: string;
  state: unknown;
  metadata: Readonly<{ snapshotType: 'PaymentIntent'; producer: 'payment' }>;
  integrity: Readonly<{ algorithm: 'SHA-256'; checksum: string }>;
}>;

type UnsignedPaymentIntentSnapshot = Omit<PaymentIntentSnapshot, 'integrity'>;
const checksum = (snapshot: UnsignedPaymentIntentSnapshot): string => createHash('sha256').update(canonicalJson(snapshot as unknown as JsonValue), 'utf8').digest('hex');

export const sealPaymentIntentSnapshot = (snapshot: UnsignedPaymentIntentSnapshot): PaymentIntentSnapshot => deepFreeze({ ...snapshot, integrity: { algorithm: 'SHA-256', checksum: checksum(snapshot) } });
export const validatePaymentIntentSnapshot = (snapshot: PaymentIntentSnapshot): void => {
  if (snapshot.integrity.algorithm !== 'SHA-256' || checksum({ snapshotSchemaVersion: snapshot.snapshotSchemaVersion, aggregateId: snapshot.aggregateId, tenantId: snapshot.tenantId, aggregateVersion: snapshot.aggregateVersion, createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt, state: snapshot.state, metadata: snapshot.metadata }) !== snapshot.integrity.checksum) throw new Error('PAYMENT_SNAPSHOT_INTEGRITY_FAILED');
};

export interface PaymentIntentPersistenceRecord { readonly tenantId: string; readonly aggregateId: string; readonly aggregateVersion: number; readonly serializedSnapshot: string; }
export class PaymentIntentSnapshotSerializer {
  serialize(snapshot: PaymentIntentSnapshot): string { validatePaymentIntentSnapshot(snapshot); return canonicalJson(snapshot as JsonValue); }
  deserialize(serialized: string): PaymentIntentSnapshot { let value: unknown; try { value = JSON.parse(serialized); } catch { throw new Error('PAYMENT_SNAPSHOT_CORRUPTED'); } if (!value || typeof value !== 'object') throw new Error('PAYMENT_SNAPSHOT_CORRUPTED'); const snapshot = value as PaymentIntentSnapshot; if (snapshot.snapshotSchemaVersion !== 1) throw new Error(snapshot.snapshotSchemaVersion > 1 ? 'PAYMENT_SNAPSHOT_FUTURE_VERSION' : 'PAYMENT_SNAPSHOT_UNSUPPORTED_VERSION'); validatePaymentIntentSnapshot(snapshot); return deepFreeze(snapshot); }
}

export class PaymentIntentSnapshotMapper {
  constructor(private readonly serializer = new PaymentIntentSnapshotSerializer()) {}
  toSnapshot(record: PaymentIntentPersistenceRecord): PaymentIntentSnapshot { const snapshot = this.serializer.deserialize(record.serializedSnapshot); if (snapshot.tenantId !== record.tenantId || snapshot.aggregateId !== record.aggregateId || snapshot.aggregateVersion !== record.aggregateVersion) throw new Error('PAYMENT_SNAPSHOT_RECORD_MISMATCH'); return snapshot; }
  toRecord(snapshot: PaymentIntentSnapshot): PaymentIntentPersistenceRecord { return Object.freeze({ tenantId: snapshot.tenantId, aggregateId: snapshot.aggregateId, aggregateVersion: snapshot.aggregateVersion, serializedSnapshot: this.serializer.serialize(snapshot) }); }
}

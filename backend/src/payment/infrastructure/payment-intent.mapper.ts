import { PersistenceRecord, SnapshotMapper } from '../domain/payment-intent.repository';
import { PaymentIntentSnapshot, SnapshotSerializer } from '../domain/payment-intent.snapshot';

export class PaymentIntentMapper implements SnapshotMapper {
  recordToSnapshot(record: PersistenceRecord): PaymentIntentSnapshot {
    const snapshot = SnapshotSerializer.deserialize(record.snapshotJson);

    if (snapshot.aggregateVersion !== record.aggregateVersion) {
      throw new Error(
        `Version mismatch for PaymentIntent ${record.id}: record version ${record.aggregateVersion}, snapshot version ${snapshot.aggregateVersion}`,
      );
    }

    if (snapshot.tenantId !== record.tenantId) {
      throw new Error(
        `Tenant mismatch for PaymentIntent ${record.id}: record tenant ${record.tenantId}, snapshot tenant ${snapshot.tenantId}`,
      );
    }

    return snapshot;
  }

  snapshotToRecord(snapshot: PaymentIntentSnapshot): PersistenceRecord {
    return {
      id: snapshot.id,
      tenantId: snapshot.tenantId,
      snapshotJson: SnapshotSerializer.storeJson(snapshot),
      aggregateVersion: snapshot.aggregateVersion,
      createdAt: new Date(snapshot.createdAt),
      updatedAt: new Date(snapshot.updatedAt),
    };
  }
}

import { PersistenceRecord, SnapshotMapper } from '../domain/in-cafe-order.repository';
import { InCafeOrderSerializer, InCafeOrderSnapshot } from '../domain/in-cafe-order.snapshot';

export class InCafeOrderMapper implements SnapshotMapper {
  recordToSnapshot(record: PersistenceRecord): InCafeOrderSnapshot {
    const snapshot = InCafeOrderSerializer.deserialize(record.snapshotJson);
    if (snapshot.aggregateVersion !== record.aggregateVersion) {
      throw new Error(
        `Version mismatch for InCafeOrder ${record.id}: record ${record.aggregateVersion}, snapshot ${snapshot.aggregateVersion}`,
      );
    }
    return snapshot;
  }

  snapshotToRecord(snapshot: InCafeOrderSnapshot): PersistenceRecord {
    return {
      id: snapshot.id,
      snapshotJson: InCafeOrderSerializer.storeJson(snapshot),
      aggregateVersion: snapshot.aggregateVersion,
      createdAt: new Date(snapshot.createdAt),
      updatedAt: new Date(snapshot.updatedAt),
    };
  }
}

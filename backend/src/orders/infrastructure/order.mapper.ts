import { PersistenceRecord, SnapshotMapper } from '../domain/order.repository';
import { OrderSerializer, OrderSnapshot } from '../domain/order.snapshot';

export class OrderMapper implements SnapshotMapper {
  recordToSnapshot(record: PersistenceRecord): OrderSnapshot {
    const snapshot = OrderSerializer.deserialize(record.snapshotJson);
    if (snapshot.aggregateVersion !== record.aggregateVersion) {
      throw new Error(
        `Version mismatch for Order ${record.id}: record ${record.aggregateVersion}, snapshot ${snapshot.aggregateVersion}`,
      );
    }
    return snapshot;
  }

  snapshotToRecord(snapshot: OrderSnapshot): PersistenceRecord {
    return {
      id: snapshot.id,
      snapshotJson: OrderSerializer.storeJson(snapshot),
      aggregateVersion: snapshot.aggregateVersion,
      createdAt: new Date(snapshot.createdAt),
      updatedAt: new Date(snapshot.updatedAt),
    };
  }
}

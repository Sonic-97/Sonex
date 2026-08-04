import { PersistenceRecord, SnapshotMapper } from '../domain/stock-reservation.repository';
import { StockReservationSnapshot, StockReservationSerializer } from '../domain/stock-reservation.snapshot';

export class StockReservationMapper implements SnapshotMapper {
  recordToSnapshot(record: PersistenceRecord): StockReservationSnapshot {
    const snapshot = StockReservationSerializer.deserialize(record.snapshotJson);

    if (snapshot.aggregateVersion !== record.aggregateVersion) {
      throw new Error(
        `Version mismatch for StockReservation ${record.id}: record version ${record.aggregateVersion}, snapshot version ${snapshot.aggregateVersion}`,
      );
    }

    return snapshot;
  }

  snapshotToRecord(snapshot: StockReservationSnapshot): PersistenceRecord {
    return {
      id: snapshot.id,
      snapshotJson: StockReservationSerializer.storeJson(snapshot),
      aggregateVersion: snapshot.aggregateVersion,
      createdAt: new Date(snapshot.createdAt),
      updatedAt: snapshot.releasedAt ? new Date(snapshot.releasedAt) : new Date(),
    };
  }
}

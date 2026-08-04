import { PersistenceRecord, SnapshotMapper } from '../domain/driver-presence.repository';
import { DriverPresenceSnapshot, DriverPresenceSerializer } from '../domain/driver-presence.snapshot';

export class DriverPresenceMapper implements SnapshotMapper {
  recordToSnapshot(record: PersistenceRecord): DriverPresenceSnapshot {
    const snapshot = DriverPresenceSerializer.deserialize(record.snapshotJson);

    if (snapshot.aggregateVersion !== record.aggregateVersion) {
      throw new Error(
        `Version mismatch for DriverPresence ${record.id}: record version ${record.aggregateVersion}, snapshot version ${snapshot.aggregateVersion}`,
      );
    }

    return snapshot;
  }

  snapshotToRecord(snapshot: DriverPresenceSnapshot): PersistenceRecord {
    return {
      id: snapshot.driverId,
      snapshotJson: DriverPresenceSerializer.storeJson(snapshot),
      aggregateVersion: snapshot.aggregateVersion,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

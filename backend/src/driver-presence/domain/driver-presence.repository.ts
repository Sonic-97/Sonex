import { DriverPresence } from './driver-presence.aggregate';
import { DriverPresenceSnapshot, DriverStatusValue } from './driver-presence.snapshot';

export interface PersistenceRecord {
  id: string;
  snapshotJson: string;
  aggregateVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DriverPresenceRepository {
  save(presence: DriverPresence): Promise<void>;
  findById(driverId: string): Promise<DriverPresence>;
  exists(driverId: string): Promise<boolean>;
}

export interface DriverPresenceStore {
  loadRecord(driverId: string): Promise<PersistenceRecord | null>;
  saveRecord(record: PersistenceRecord): Promise<void>;
  findExpiredHeartbeats(cutoff: Date): Promise<PersistenceRecord[]>;
  findActiveByStatus(statuses: DriverStatusValue[]): Promise<PersistenceRecord[]>;
}

export interface SnapshotMapper {
  recordToSnapshot(record: PersistenceRecord): DriverPresenceSnapshot;
  snapshotToRecord(snapshot: DriverPresenceSnapshot): PersistenceRecord;
}

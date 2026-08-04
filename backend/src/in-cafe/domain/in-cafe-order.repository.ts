import { InCafeOrder } from './in-cafe-order.aggregate';
import { InCafeOrderSnapshot } from './in-cafe-order.snapshot';

export interface PersistenceRecord {
  id: string;
  snapshotJson: string;
  aggregateVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InCafeOrderRepository {
  save(order: InCafeOrder, tx?: unknown): Promise<void>;
  findById(id: string): Promise<InCafeOrder>;
}

export interface InCafeOrderStore {
  loadRecord(id: string): Promise<PersistenceRecord | null>;
  saveRecord(record: PersistenceRecord, tx?: unknown): Promise<void>;
}

export interface SnapshotMapper {
  recordToSnapshot(record: PersistenceRecord): InCafeOrderSnapshot;
  snapshotToRecord(snapshot: InCafeOrderSnapshot): PersistenceRecord;
}

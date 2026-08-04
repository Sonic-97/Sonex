import { Order } from './order.aggregate';
import { OrderSnapshot } from './order.snapshot';

export interface PersistenceRecord {
  id: string;
  snapshotJson: string;
  aggregateVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderRepository {
  save(order: Order, tx?: unknown): Promise<void>;
  findById(id: string): Promise<Order>;
}

export interface OrderStore {
  loadRecord(id: string): Promise<PersistenceRecord | null>;
  saveRecord(record: PersistenceRecord, tx?: unknown): Promise<void>;
}

export interface SnapshotMapper {
  recordToSnapshot(record: PersistenceRecord): OrderSnapshot;
  snapshotToRecord(snapshot: OrderSnapshot): PersistenceRecord;
}

import { PaymentIntent } from './payment-intent.aggregate';
import { PaymentIntentSnapshot } from './payment-intent.snapshot';

export interface PersistenceRecord {
  id: string;
  tenantId: string;
  snapshotJson: string;
  aggregateVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentIntentRepository {
  save(intent: PaymentIntent): Promise<void>;
  findById(id: string, tenantId: string): Promise<PaymentIntent>;
  exists(id: string): Promise<boolean>;
}

export interface PaymentIntentStore {
  loadRecord(id: string, tenantId: string): Promise<PersistenceRecord | null>;
  saveRecord(record: PersistenceRecord): Promise<void>;
  deleteRecord(id: string): Promise<void>;
  listByTenant(tenantId: string): Promise<PersistenceRecord[]>;
}

export interface SnapshotMapper {
  recordToSnapshot(record: PersistenceRecord): PaymentIntentSnapshot;
  snapshotToRecord(snapshot: PaymentIntentSnapshot): PersistenceRecord;
}

import { StockReservation } from './stock-reservation.aggregate';
import { StockReservationSnapshot } from './stock-reservation.snapshot';

export interface PersistenceRecord {
  id: string;
  snapshotJson: string;
  aggregateVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockReservationRepository {
  save(reservation: StockReservation, ledgerReason?: string): Promise<void>;
  findById(id: string): Promise<StockReservation>;
  findAllActive(): Promise<StockReservation[]>;
  findActiveCreatedBefore(cutoff: Date): Promise<StockReservation[]>;
}

export interface StockReservationStore {
  loadRecord(id: string): Promise<PersistenceRecord | null>;
  saveRecord(record: PersistenceRecord, ledgerReason?: string): Promise<void>;
  findAllActive(): Promise<PersistenceRecord[]>;
  findActiveCreatedBefore(cutoff: Date): Promise<PersistenceRecord[]>;
}

export interface SnapshotMapper {
  recordToSnapshot(record: PersistenceRecord): StockReservationSnapshot;
  snapshotToRecord(snapshot: StockReservationSnapshot): PersistenceRecord;
}

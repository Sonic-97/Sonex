import { StockReservationRepository, StockReservationStore, SnapshotMapper } from '../domain/stock-reservation.repository';
import { StockReservation } from '../domain/stock-reservation.aggregate';
import { StockReservationNotFoundError } from '../domain/stock-reservation.errors';
import { UnitOfWork } from '../../payment/application/unit-of-work';

export class StockReservationRepositoryImpl implements StockReservationRepository {
  constructor(
    private readonly store: StockReservationStore,
    private readonly mapper: SnapshotMapper,
    private readonly uow?: UnitOfWork,
  ) {}

  async save(reservation: StockReservation, ledgerReason?: string): Promise<void> {
    if (this.uow?.isActive()) {
      this.uow.registerSave('stockReservation', reservation.id, async () => {
        const record = this.mapper.snapshotToRecord(reservation.toSnapshot());
        await this.store.saveRecord(record, ledgerReason);
      });
      return;
    }
    const record = this.mapper.snapshotToRecord(reservation.toSnapshot());
    await this.store.saveRecord(record, ledgerReason);
  }

  async findById(id: string): Promise<StockReservation> {
    const record = await this.store.loadRecord(id);
    if (!record) {
      throw new StockReservationNotFoundError(id);
    }
    return StockReservation.rehydrate(this.mapper.recordToSnapshot(record));
  }

  async findAllActive(): Promise<StockReservation[]> {
    const records = await this.store.findAllActive();
    return records.map(r => StockReservation.rehydrate(this.mapper.recordToSnapshot(r)));
  }

  async findActiveCreatedBefore(cutoff: Date): Promise<StockReservation[]> {
    const records = await this.store.findActiveCreatedBefore(cutoff);
    return records.map(r => StockReservation.rehydrate(this.mapper.recordToSnapshot(r)));
  }
}

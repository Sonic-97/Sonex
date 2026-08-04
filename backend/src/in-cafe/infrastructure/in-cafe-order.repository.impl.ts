import { InCafeOrderRepository, InCafeOrderStore, SnapshotMapper } from '../domain/in-cafe-order.repository';
import { InCafeOrder } from '../domain/in-cafe-order.aggregate';
import { InCafeOrderNotFoundError } from '../domain/in-cafe-order.errors';
import { UnitOfWork } from '../../payment/application/unit-of-work';

export class InCafeOrderRepositoryImpl implements InCafeOrderRepository {
  constructor(
    private readonly store: InCafeOrderStore,
    private readonly mapper: SnapshotMapper,
    private readonly uow?: UnitOfWork,
  ) {}

  async save(order: InCafeOrder, tx?: unknown): Promise<void> {
    if (this.uow?.isActive()) {
      this.uow.registerSave('inCafeOrder', order.id, async () => {
        const record = this.mapper.snapshotToRecord(order.toSnapshot());
        await this.store.saveRecord(record, tx);
      });
      return;
    }
    const record = this.mapper.snapshotToRecord(order.toSnapshot());
    await this.store.saveRecord(record, tx);
  }

  async findById(id: string): Promise<InCafeOrder> {
    const record = await this.store.loadRecord(id);
    if (!record) {
      throw new InCafeOrderNotFoundError(id);
    }
    return InCafeOrder.rehydrate(this.mapper.recordToSnapshot(record));
  }
}

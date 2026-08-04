import { OrderRepository, OrderStore, SnapshotMapper } from '../domain/order.repository';
import { Order } from '../domain/order.aggregate';
import { OrderNotFoundError } from '../domain/order.errors';
import { UnitOfWork } from '../../payment/application/unit-of-work';

export class OrderRepositoryImpl implements OrderRepository {
  constructor(
    private readonly store: OrderStore,
    private readonly mapper: SnapshotMapper,
    private readonly uow?: UnitOfWork,
  ) {}

  async save(order: Order, tx?: unknown): Promise<void> {
    if (this.uow?.isActive()) {
      this.uow.registerSave('order', order.id, async () => {
        const record = this.mapper.snapshotToRecord(order.toSnapshot());
        await this.store.saveRecord(record, tx);
      });
      return;
    }
    const record = this.mapper.snapshotToRecord(order.toSnapshot());
    await this.store.saveRecord(record, tx);
  }

  async findById(id: string): Promise<Order> {
    const record = await this.store.loadRecord(id);
    if (!record) {
      throw new OrderNotFoundError(id);
    }
    return Order.rehydrate(this.mapper.recordToSnapshot(record));
  }
}

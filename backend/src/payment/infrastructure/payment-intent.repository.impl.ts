import { PaymentIntentRepository, PaymentIntentStore, SnapshotMapper } from '../domain/payment-intent.repository';
import { PaymentIntent } from '../domain/payment-intent.aggregate';
import { PaymentIntentNotFoundError, CorruptedSnapshotError, TenantIsolationError } from '../domain/payment-intent.errors';
import { SnapshotSerializer } from '../domain/payment-intent.snapshot';
import { UnitOfWork } from '../application/unit-of-work';

export class PaymentIntentRepositoryImpl implements PaymentIntentRepository {
  constructor(
    private readonly store: PaymentIntentStore,
    private readonly mapper: SnapshotMapper,
    private readonly uow?: UnitOfWork,
  ) {}

  async save(intent: PaymentIntent): Promise<void> {
    if (this.uow?.isActive()) {
      this.uow.registerSave('paymentIntent', intent.id, async () => {
        const snapshot = intent.toSnapshot();
        const record = this.mapper.snapshotToRecord(snapshot);
        await this.store.saveRecord(record);
      });
      return;
    }
    const snapshot = intent.toSnapshot();
    const record = this.mapper.snapshotToRecord(snapshot);
    await this.store.saveRecord(record);
  }

  async findById(id: string, tenantId: string): Promise<PaymentIntent> {
    const record = await this.store.loadRecord(id, tenantId);
    if (!record) {
      throw new PaymentIntentNotFoundError(id);
    }

    if (record.tenantId !== tenantId) {
      throw new TenantIsolationError(id, tenantId, record.tenantId);
    }

    const snapshot = this.mapper.recordToSnapshot(record);

    if (!SnapshotSerializer.validateChecksum(snapshot)) {
      throw new CorruptedSnapshotError(id);
    }

    return PaymentIntent.rehydrate(snapshot);
  }

  async exists(id: string): Promise<boolean> {
    const record = await this.store.loadRecord(id, '*');
    if (record) return true;

    for (const tenant of ['*']) {
      const r = await this.store.loadRecord(id, tenant);
      if (r) return true;
    }
    return false;
  }

  getStore(): PaymentIntentStore {
    return this.store;
  }
}

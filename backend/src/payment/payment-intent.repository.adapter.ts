import { ConcurrencyError, failure, success, type Result, type TenantId } from '../shared-kernel';
import { PaymentIntent } from './payment.aggregates';
import { PaymentIntentSnapshotMapper, type PaymentIntentPersistenceRecord } from './payment-intent.snapshot';
import type { PaymentIntentId } from './payment.types';

/** Reference infrastructure adapter. Replace its record store, not its mapping or concurrency semantics. */
export class InMemoryPaymentIntentRepository {
  private readonly records = new Map<string, PaymentIntentPersistenceRecord>();
  private readonly mapper = new PaymentIntentSnapshotMapper();
  async load(id: PaymentIntentId, tenant: TenantId): Promise<PaymentIntent | undefined> { const record = this.records.get(`${tenant}:${id}`); if (!record) return undefined; if (record.tenantId !== tenant) return undefined; return PaymentIntent.rehydrate(this.mapper.toSnapshot(record)); }
  async save(intent: PaymentIntent, expectedVersion?: number): Promise<Result<PaymentIntent, ConcurrencyError>> { const key = `${intent.tenantId}:${intent.id}`; const current = this.records.get(key); if (current && expectedVersion !== current.aggregateVersion) return failure(new ConcurrencyError('PERSISTENCE_VERSION_CONFLICT', 'Aggregate version does not match expected version')); if (!current && expectedVersion !== undefined && expectedVersion !== 0) return failure(new ConcurrencyError('PERSISTENCE_VERSION_CONFLICT', 'Aggregate does not exist at expected version')); this.records.set(key, this.mapper.toRecord(intent.toSnapshot())); return success(intent); }
  corrupt(id: PaymentIntentId, tenant: TenantId, record: PaymentIntentPersistenceRecord): void { this.records.set(`${tenant}:${id}`, record); }
}

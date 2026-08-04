import { PersistenceRecord, PaymentIntentStore } from '../domain/payment-intent.repository';
import { OptimisticConcurrencyError } from '../domain/payment-intent.errors';

export class InMemoryPaymentIntentStore implements PaymentIntentStore {
  private records = new Map<string, PersistenceRecord>();

  private key(id: string, tenantId: string): string {
    return `${tenantId}:${id}`;
  }

  async loadRecord(id: string, tenantId: string): Promise<PersistenceRecord | null> {
    const record = this.records.get(this.key(id, tenantId));
    return record ? { ...record, snapshotJson: record.snapshotJson } : null;
  }

  async saveRecord(record: PersistenceRecord): Promise<void> {
    const existing = this.records.get(this.key(record.id, record.tenantId));

    if (existing && record.aggregateVersion !== existing.aggregateVersion + 1) {
      throw new OptimisticConcurrencyError(record.id, existing.aggregateVersion + 1, record.aggregateVersion);
    }

    this.records.set(this.key(record.id, record.tenantId), {
      ...record,
      createdAt: existing?.createdAt ?? record.createdAt,
      updatedAt: new Date(),
    });
  }

  async deleteRecord(id: string): Promise<void> {
    for (const [key] of this.records) {
      if (key.endsWith(`:${id}`)) {
        this.records.delete(key);
        return;
      }
    }
  }

  async listByTenant(tenantId: string): Promise<PersistenceRecord[]> {
    const result: PersistenceRecord[] = [];
    for (const [key, record] of this.records) {
      if (key.startsWith(`${tenantId}:`)) {
        result.push({ ...record, snapshotJson: record.snapshotJson });
      }
    }
    return result;
  }

  clear(): void {
    this.records.clear();
  }
}

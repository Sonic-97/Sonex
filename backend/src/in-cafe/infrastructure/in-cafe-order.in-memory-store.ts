import { InCafeOrderStore, PersistenceRecord } from '../domain/in-cafe-order.repository';
import { InCafeOrderSerializer } from '../domain/in-cafe-order.snapshot';

export class InMemoryInCafeOrderStore implements InCafeOrderStore {
  records = new Map<string, PersistenceRecord>();

  async loadRecord(id: string): Promise<PersistenceRecord | null> {
    return this.records.get(id) ?? null;
  }

  async saveRecord(record: PersistenceRecord, _tx?: unknown): Promise<void> {
    const existing = this.records.get(record.id);
    if (existing && existing.aggregateVersion !== record.aggregateVersion - 1) {
      throw new Error(`Version mismatch for InCafeOrder ${record.id}`);
    }
    this.records.set(record.id, { ...record });
  }
}

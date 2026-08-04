import { OrderStore, PersistenceRecord } from '../domain/order.repository';
import { OrderSerializer } from '../domain/order.snapshot';

export class InMemoryOrderStore implements OrderStore {
  records = new Map<string, PersistenceRecord>();

  async loadRecord(id: string): Promise<PersistenceRecord | null> {
    return this.records.get(id) ?? null;
  }

  async saveRecord(record: PersistenceRecord, _tx?: unknown): Promise<void> {
    const existing = this.records.get(record.id);
    if (existing && existing.aggregateVersion !== record.aggregateVersion - 1) {
      throw new Error(`Version mismatch for Order ${record.id}`);
    }
    this.records.set(record.id, { ...record });
  }
}

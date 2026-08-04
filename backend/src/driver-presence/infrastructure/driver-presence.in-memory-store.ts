import { PersistenceRecord, DriverPresenceStore } from '../domain/driver-presence.repository';
import { DriverStatusValue } from '../domain/driver-presence.snapshot';
import { OptimisticConcurrencyError } from '../domain/driver-presence.errors';

export class InMemoryDriverPresenceStore implements DriverPresenceStore {
  private records = new Map<string, PersistenceRecord>();

  async loadRecord(driverId: string): Promise<PersistenceRecord | null> {
    const record = this.records.get(driverId);
    return record ? { ...record, snapshotJson: record.snapshotJson } : null;
  }

  async saveRecord(record: PersistenceRecord): Promise<void> {
    const existing = this.records.get(record.id);

    if (existing && record.aggregateVersion !== existing.aggregateVersion + 1) {
      throw new OptimisticConcurrencyError(record.id, existing.aggregateVersion + 1, record.aggregateVersion);
    }

    this.records.set(record.id, {
      ...record,
      createdAt: existing?.createdAt ?? record.createdAt,
      updatedAt: new Date(),
    });
  }

  async findExpiredHeartbeats(cutoff: Date): Promise<PersistenceRecord[]> {
    const result: PersistenceRecord[] = [];
    for (const [, record] of this.records) {
      const snapshot = JSON.parse(record.snapshotJson);
      const status: DriverStatusValue = snapshot.status;
      const activeStatuses: DriverStatusValue[] = ['ONLINE', 'BUSY', 'ON_PICKUP', 'ON_DELIVERY'];
      if ((activeStatuses as readonly string[]).includes(status)) {
        if (!snapshot.lastHeartbeatAt || new Date(snapshot.lastHeartbeatAt) < cutoff) {
          result.push({ ...record, snapshotJson: record.snapshotJson });
        }
      }
    }
    return result;
  }

  async findActiveByStatus(statuses: DriverStatusValue[]): Promise<PersistenceRecord[]> {
    const result: PersistenceRecord[] = [];
    for (const [, record] of this.records) {
      const snapshot = JSON.parse(record.snapshotJson);
      if ((statuses as readonly string[]).includes(snapshot.status)) {
        result.push({ ...record, snapshotJson: record.snapshotJson });
      }
    }
    return result;
  }

  clear(): void {
    this.records.clear();
  }
}

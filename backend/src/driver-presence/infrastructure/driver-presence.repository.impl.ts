import { DriverPresenceRepository, DriverPresenceStore, SnapshotMapper } from '../domain/driver-presence.repository';
import { DriverPresence } from '../domain/driver-presence.aggregate';
import { DriverPresenceNotFoundError } from '../domain/driver-presence.errors';
import { UnitOfWork } from '../../payment/application/unit-of-work';

export class DriverPresenceRepositoryImpl implements DriverPresenceRepository {
  constructor(
    private readonly store: DriverPresenceStore,
    private readonly mapper: SnapshotMapper,
    private readonly uow?: UnitOfWork,
  ) {}

  async save(presence: DriverPresence): Promise<void> {
    if (this.uow?.isActive()) {
      this.uow.registerSave('driverPresence', presence.driverId, async () => {
        const snapshot = presence.toSnapshot();
        const record = this.mapper.snapshotToRecord(snapshot);
        await this.store.saveRecord(record);
      });
      return;
    }
    const snapshot = presence.toSnapshot();
    const record = this.mapper.snapshotToRecord(snapshot);
    await this.store.saveRecord(record);
  }

  async findById(driverId: string): Promise<DriverPresence> {
    const record = await this.store.loadRecord(driverId);
    if (!record) {
      throw new DriverPresenceNotFoundError(driverId);
    }
    const snapshot = this.mapper.recordToSnapshot(record);
    return DriverPresence.rehydrate(snapshot);
  }

  async exists(driverId: string): Promise<boolean> {
    const record = await this.store.loadRecord(driverId);
    return record !== null;
  }

  getStore(): DriverPresenceStore {
    return this.store;
  }
}

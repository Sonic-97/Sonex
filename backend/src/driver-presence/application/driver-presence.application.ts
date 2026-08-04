import { DriverPresenceRepository, DriverPresenceStore } from '../domain/driver-presence.repository';
import { DriverPresence } from '../domain/driver-presence.aggregate';

export class DriverPresenceApplicationService {
  constructor(
    private readonly repository: DriverPresenceRepository,
    private readonly store: DriverPresenceStore,
  ) {}

  async goOnline(driverId: string, latitude?: number, longitude?: number): Promise<void> {
    const exists = await this.repository.exists(driverId);
    if (!exists) {
      const driver = DriverPresence.create(driverId);
      driver.goOnline(latitude, longitude);
      await this.repository.save(driver);
      return;
    }

    const driver = await this.repository.findById(driverId);
    if (driver.status === 'ONLINE') {
      driver.heartbeat(latitude, longitude);
    } else if (driver.status === 'PAUSED') {
      driver.resume();
    } else {
      driver.goOnline(latitude, longitude);
    }
    await this.repository.save(driver);
  }

  async goOffline(driverId: string): Promise<void> {
    const driver = await this.repository.findById(driverId);
    if (driver.status !== 'OFFLINE') {
      driver.goOffline();
      await this.repository.save(driver);
    }
  }

  async pause(driverId: string): Promise<void> {
    const driver = await this.repository.findById(driverId);
    driver.pause();
    await this.repository.save(driver);
  }

  async resume(driverId: string): Promise<void> {
    const driver = await this.repository.findById(driverId);
    driver.resume();
    await this.repository.save(driver);
  }

  async heartbeat(driverId: string, latitude?: number, longitude?: number): Promise<void> {
    const driver = await this.repository.findById(driverId);
    driver.heartbeat(latitude, longitude);
    await this.repository.save(driver);
  }

  async updateLocation(driverId: string, latitude: number, longitude: number): Promise<void> {
    const driver = await this.repository.findById(driverId);
    driver.updateLocation(latitude, longitude);
    await this.repository.save(driver);
  }

  async checkExpiredHeartbeats(heartbeatTimeoutMs: number): Promise<string[]> {
    const cutoff = new Date(Date.now() - heartbeatTimeoutMs);
    const expired = await this.store.findExpiredHeartbeats(cutoff);
    const expiredIds: string[] = [];
    for (const record of expired) {
      const driver = await this.repository.findById(record.id);
      driver.forceOffline();
      await this.repository.save(driver);
      expiredIds.push(record.id);
    }
    return expiredIds;
  }
}

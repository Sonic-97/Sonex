import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PersistenceRecord, DriverPresenceStore } from '../domain/driver-presence.repository';
import {
  DriverPresenceSerializer,
  CURRENT_SNAPSHOT_SCHEMA_VERSION,
  DriverStatusValue,
} from '../domain/driver-presence.snapshot';

const ACTIVE_STATUSES: DriverStatusValue[] = ['ONLINE', 'BUSY', 'ON_PICKUP', 'ON_DELIVERY'];

@Injectable()
export class PrismaDriverPresenceStore implements DriverPresenceStore {
  constructor(private readonly prisma: PrismaService) {}

  async loadRecord(driverId: string): Promise<PersistenceRecord | null> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) return null;
    return this.toRecord(driver);
  }

  async saveRecord(record: PersistenceRecord): Promise<void> {
    const snapshot = DriverPresenceSerializer.deserialize(record.snapshotJson);
    await this.prisma.driver.update({
      where: { id: snapshot.driverId },
      data: {
        driverStatus: snapshot.status,
        lastHeartbeat: snapshot.lastHeartbeatAt ? new Date(snapshot.lastHeartbeatAt) : null,
        currentLatitude: snapshot.latitude,
        currentLongitude: snapshot.longitude,
        ...(snapshot.latitude != null && snapshot.longitude != null
          ? { currentLocation: { lat: snapshot.latitude, lng: snapshot.longitude } }
          : {}),
      },
    });
  }

  async findExpiredHeartbeats(cutoff: Date): Promise<PersistenceRecord[]> {
    const expired = await this.prisma.driver.findMany({
      where: {
        driverStatus: { in: ACTIVE_STATUSES as unknown as string[] },
        lastHeartbeat: { lt: cutoff },
      },
    });
    return expired.map(d => this.toRecord(d));
  }

  async findActiveByStatus(statuses: DriverStatusValue[]): Promise<PersistenceRecord[]> {
    const found = await this.prisma.driver.findMany({
      where: { driverStatus: { in: statuses as unknown as string[] } },
    });
    return found.map(d => this.toRecord(d));
  }

  private toRecord(driver: {
    id: string;
    driverStatus?: string;
    currentLatitude?: unknown;
    currentLongitude?: unknown;
    lastHeartbeat?: Date | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
  }): PersistenceRecord {
    const snapshot = DriverPresenceSerializer.addChecksum({
      snapshotSchemaVersion: CURRENT_SNAPSHOT_SCHEMA_VERSION,
      aggregateVersion: 1,
      driverId: driver.id,
      status: (driver.driverStatus as DriverStatusValue) ?? 'OFFLINE',
      latitude: driver.currentLatitude != null ? Number(driver.currentLatitude) : null,
      longitude: driver.currentLongitude != null ? Number(driver.currentLongitude) : null,
      lastHeartbeatAt: driver.lastHeartbeat ? new Date(driver.lastHeartbeat).toISOString() : null,
    });
    return {
      id: driver.id,
      snapshotJson: DriverPresenceSerializer.storeJson(snapshot),
      aggregateVersion: 1,
      createdAt: driver.createdAt ? new Date(driver.createdAt) : new Date(),
      updatedAt: driver.updatedAt ? new Date(driver.updatedAt) : new Date(),
    };
  }
}

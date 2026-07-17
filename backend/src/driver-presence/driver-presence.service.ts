import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PresenceEvent, PresenceEventType,
  PresenceConfig, DEFAULT_PRESENCE_CONFIG,
} from './driver-presence.types';

@Injectable()
export class DriverPresenceService {
  private readonly logger = new Logger(DriverPresenceService.name);
  private readonly config: PresenceConfig;
  private readonly eventListeners: Array<(event: PresenceEvent) => void> = [];

  constructor(
    private readonly prisma: PrismaService,
    config?: Partial<PresenceConfig>,
  ) {
    this.config = { ...DEFAULT_PRESENCE_CONFIG, ...config };
  }

  onEvent(listener: (event: PresenceEvent) => void): void {
    this.eventListeners.push(listener);
  }

  async goOnline(driverId: string, latitude?: number, longitude?: number) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new Error('Driver not found');

    const previousStatus = driver.driverStatus;
    const updateData: any = {
      driverStatus: 'ONLINE',
      lastHeartbeat: new Date(),
    };
    if (latitude != null && longitude != null) {
      updateData.currentLatitude = latitude;
      updateData.currentLongitude = longitude;
      updateData.currentLocation = { lat: latitude, lng: longitude };
    }

    await this.prisma.driver.update({ where: { id: driverId }, data: updateData });
    this.emit('DriverOnline', driverId, previousStatus, 'ONLINE', latitude, longitude);
  }

  async goOffline(driverId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new Error('Driver not found');

    const previousStatus = driver.driverStatus;
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { driverStatus: 'OFFLINE' },
    });
    this.emit('DriverOffline', driverId, previousStatus, 'OFFLINE');
  }

  async heartbeat(driverId: string, latitude?: number, longitude?: number) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new Error('Driver not found');

    const updateData: any = { lastHeartbeat: new Date() };
    if (latitude != null && longitude != null) {
      updateData.currentLatitude = latitude;
      updateData.currentLongitude = longitude;
      updateData.currentLocation = { lat: latitude, lng: longitude };
    }

    await this.prisma.driver.update({ where: { id: driverId }, data: updateData });
    this.emit('HeartbeatReceived', driverId, undefined, undefined, latitude, longitude);
  }

  async updateLocation(driverId: string, latitude: number, longitude: number) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new Error('Driver not found');

    await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        currentLatitude: latitude,
        currentLongitude: longitude,
        currentLocation: { lat: latitude, lng: longitude },
      },
    });
    this.emit('LocationUpdated', driverId, undefined, undefined, latitude, longitude);
  }

  async pause(driverId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new Error('Driver not found');
    if (driver.driverStatus === 'OFFLINE') throw new Error('Cannot pause offline driver');

    const previousStatus = driver.driverStatus;
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { driverStatus: 'PAUSED' },
    });
    this.emit('DriverPaused', driverId, previousStatus, 'PAUSED');
  }

  async resume(driverId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new Error('Driver not found');
    if (driver.driverStatus !== 'PAUSED') throw new Error('Driver is not paused');

    const previousStatus = driver.driverStatus;
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { driverStatus: 'ONLINE', lastHeartbeat: new Date() },
    });
    this.emit('DriverResumed', driverId, previousStatus, 'ONLINE');
  }

  async checkExpiredHeartbeats(): Promise<string[]> {
    const cutoff = new Date(Date.now() - this.config.heartbeatTimeoutMs);
    const expired = await this.prisma.driver.findMany({
      where: {
        driverStatus: { in: ['ONLINE', 'BUSY', 'ON_PICKUP', 'ON_DELIVERY'] },
        lastHeartbeat: { lt: cutoff },
      },
      select: { id: true, driverStatus: true },
    });

    const expiredIds: string[] = [];
    for (const d of expired) {
      await this.prisma.driver.update({
        where: { id: d.id },
        data: { driverStatus: 'OFFLINE' },
      });
      this.emit('DriverOffline', d.id, d.driverStatus, 'OFFLINE');
      expiredIds.push(d.id);
    }
    return expiredIds;
  }

  getConfig(): PresenceConfig {
    return { ...this.config };
  }

  private emit(
    type: PresenceEventType,
    driverId: string,
    previousStatus?: string,
    currentStatus?: string,
    latitude?: number,
    longitude?: number,
  ): void {
    const event: PresenceEvent = {
      type,
      driverId,
      previousStatus,
      currentStatus,
      latitude,
      longitude,
      timestamp: new Date().toISOString(),
    };
    for (const listener of this.eventListeners) {
      try { listener(event); } catch (e) { this.logger.error('Event listener error', e); }
    }
  }
}

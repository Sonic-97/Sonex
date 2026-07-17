import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DriverStatus, DispatchWeights, DEFAULT_DISPATCH_WEIGHTS,
  DispatchableDriver, DriverScore, DispatchAssignment,
  DispatchEvent, DispatchEventType,
} from './driver-dispatch.types';

@Injectable()
export class DriverDispatchService {
  private readonly logger = new Logger(DriverDispatchService.name);
  private readonly DISPATCH_RADIUS_KM = 5;
  private readonly HEARTBEAT_TIMEOUT_MS = 300000;
  private readonly ASSIGNMENT_TIMEOUT_MS = 60000;
  private readonly eventListeners: Array<(event: DispatchEvent) => void> = [];

  constructor(private readonly prisma: PrismaService) {}

  onEvent(listener: (event: DispatchEvent) => void): void {
    this.eventListeners.push(listener);
  }

  async findEligibleDrivers(merchantLatitude: number, merchantLongitude: number, merchantZoneId?: string): Promise<DispatchableDriver[]> {
    const where: any = { driverStatus: 'ONLINE' };
    if (merchantZoneId) {
      where.merchantZoneId = merchantZoneId;
    }

    const drivers = await this.prisma.driver.findMany({ where });

    return drivers
      .filter(d => d.activeAssignments < d.capacity)
      .filter(d => this.isHeartbeatValid(d.lastHeartbeat))
      .filter(d => {
        if (d.currentLatitude == null || d.currentLongitude == null) return false;
        const dist = this.haversine(
          Number(d.currentLatitude), Number(d.currentLongitude),
          merchantLatitude, merchantLongitude,
        );
        return dist <= this.DISPATCH_RADIUS_KM;
      })
      .map(d => this.toDispatchable(d, merchantLatitude, merchantLongitude));
  }

  scoreDrivers(drivers: DispatchableDriver[], weights: DispatchWeights = DEFAULT_DISPATCH_WEIGHTS): DriverScore[] {
    if (drivers.length === 0) return [];

    const maxDistance = Math.max(...drivers.map(d => d.distance), 1);

    return drivers.map(d => {
      const distanceScore = maxDistance > 0 ? 1 - (d.distance / maxDistance) : 1;
      const workloadScore = d.capacity > 0 ? 1 - (d.activeAssignments / d.capacity) : 0;
      const acceptanceScore = d.acceptanceRate;
      const priorityScore = 1;

      const totalScore =
        weights.distance * distanceScore +
        weights.workload * workloadScore +
        weights.acceptanceRate * acceptanceScore +
        weights.merchantPriority * priorityScore;

      return {
        driverId: d.driverId,
        distance: d.distance,
        distanceScore,
        workloadScore,
        acceptanceScore,
        priorityScore,
        totalScore,
      };
    }).sort((a, b) => b.totalScore - a.totalScore);
  }

  async dispatchDriver(merchantOrderId: string, merchantLatitude: number, merchantLongitude: number, merchantZoneId?: string): Promise<DispatchAssignment | null> {
    const eligible = await this.findEligibleDrivers(merchantLatitude, merchantLongitude, merchantZoneId);
    if (eligible.length === 0) return null;

    for (const d of eligible) {
      this.emit('DriverFound', '', d.driverId, merchantOrderId);
    }

    const scored = this.scoreDrivers(eligible);
    for (const s of scored) {
      this.emit('DriverScored', '', s.driverId, merchantOrderId, s.totalScore);
    }

    const best = scored[0];
    const driver = eligible.find(d => d.driverId === best.driverId)!;
    return this.createAssignment(best.driverId, merchantOrderId, best.totalScore);
  }

  private async createAssignment(driverId: string, merchantOrderId: string, score: number): Promise<DispatchAssignment> {
    const expiresAt = new Date(Date.now() + this.ASSIGNMENT_TIMEOUT_MS);
    const record = await this.prisma.driverAssignment.create({
      data: {
        driverId,
        merchantOrderId,
        status: 'PENDING',
        score,
        expiresAt,
      },
    });
    this.emit('DriverAssigned', record.id, driverId, merchantOrderId, score);
    return {
      assignmentId: record.id,
      driverId: record.driverId,
      merchantOrderId: record.merchantOrderId,
      status: record.status as any,
      score: Number(record.score),
      assignedAt: record.assignedAt,
      expiresAt: record.expiresAt,
    };
  }

  async acceptAssignment(assignmentId: string): Promise<DispatchAssignment> {
    const record = await this.prisma.driverAssignment.update({
      where: { id: assignmentId },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });

    await this.prisma.driver.update({
      where: { id: record.driverId },
      data: { activeAssignments: { increment: 1 }, driverStatus: 'BUSY' },
    });

    this.emit('DriverAccepted', record.id, record.driverId, record.merchantOrderId);
    return this.toAssignment(record);
  }

  async rejectAssignment(assignmentId: string): Promise<DispatchAssignment> {
    const record = await this.prisma.driverAssignment.update({
      where: { id: assignmentId },
      data: { status: 'REJECTED', respondedAt: new Date() },
    });

    this.emit('DriverRejected', record.id, record.driverId, record.merchantOrderId);

    const next = await this.dispatchNextDriver(record.merchantOrderId);
    return this.toAssignment(record, next);
  }

  async timeoutAssignment(assignmentId: string): Promise<DispatchAssignment> {
    const record = await this.prisma.driverAssignment.update({
      where: { id: assignmentId },
      data: { status: 'TIMEOUT' },
    });

    this.emit('DriverTimeout', record.id, record.driverId, record.merchantOrderId);

    const next = await this.dispatchNextDriver(record.merchantOrderId);
    return this.toAssignment(record, next);
  }

  private async dispatchNextDriver(merchantOrderId: string): Promise<DispatchAssignment | null> {
    const merchantOrder = await this.prisma.merchantOrder.findUnique({
      where: { id: merchantOrderId },
      select: { cafeId: true },
    });
    if (!merchantOrder) return null;

    const cafe = await this.prisma.cafe.findUnique({
      where: { id: merchantOrder.cafeId },
      select: { configuration: true },
    });
    let latitude = 30.0444;
    let longitude = 31.2357;
    let zoneId: string | undefined;

    if (cafe?.configuration) {
      const config = cafe.configuration as any;
      latitude = config.latitude ?? latitude;
      longitude = config.longitude ?? longitude;
      zoneId = config.zoneId;
    }

    return this.dispatchDriver(merchantOrderId, latitude, longitude, zoneId);
  }

  async completeDriverAssignment(driverId: string, merchantOrderId: string): Promise<void> {
    await this.prisma.driverAssignment.updateMany({
      where: { driverId, merchantOrderId, status: 'ACCEPTED' },
      data: { status: 'CANCELLED' },
    });

    await this.prisma.driver.update({
      where: { id: driverId },
      data: { activeAssignments: { decrement: 1 } },
    });

    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { activeAssignments: true, capacity: true },
    });
    if (driver && driver.activeAssignments < driver.capacity) {
      await this.prisma.driver.update({
        where: { id: driverId },
        data: { driverStatus: 'ONLINE' },
      });
    }
  }

  async updateDriverHeartbeat(driverId: string, latitude: number, longitude: number): Promise<void> {
    await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        lastHeartbeat: new Date(),
        currentLatitude: latitude,
        currentLongitude: longitude,
        currentLocation: { lat: latitude, lng: longitude },
      },
    });
  }

  async updateDriverStatus(driverId: string, status: DriverStatus): Promise<void> {
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { driverStatus: status },
    });
  }

  private isHeartbeatValid(lastHeartbeat: Date | null): boolean {
    if (!lastHeartbeat) return false;
    return Date.now() - lastHeartbeat.getTime() < this.HEARTBEAT_TIMEOUT_MS;
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  private toDispatchable(d: any, merchantLat: number, merchantLng: number): DispatchableDriver {
    const lat = d.currentLatitude != null ? Number(d.currentLatitude) : null;
    const lng = d.currentLongitude != null ? Number(d.currentLongitude) : null;
    const distance = (lat != null && lng != null) ? this.haversine(lat, lng, merchantLat, merchantLng) : Infinity;
    return {
      driverId: d.id,
      name: d.name,
      phone: d.phone,
      driverStatus: d.driverStatus as DriverStatus,
      vehicleType: d.vehicleType,
      merchantZoneId: d.merchantZoneId,
      currentLatitude: lat,
      currentLongitude: lng,
      capacity: d.capacity,
      activeAssignments: d.activeAssignments,
      acceptanceRate: Number(d.acceptanceRate),
      lastHeartbeat: d.lastHeartbeat,
      distance,
    };
  }

  private toAssignment(record: any, next?: DispatchAssignment | null): DispatchAssignment {
    return {
      assignmentId: record.id,
      driverId: record.driverId,
      merchantOrderId: record.merchantOrderId,
      status: record.status as any,
      score: record.score != null ? Number(record.score) : null,
      assignedAt: record.assignedAt,
      expiresAt: record.expiresAt,
    };
  }

  private emit(type: DispatchEventType, assignmentId: string, driverId: string, merchantOrderId: string, score?: number): void {
    const event: DispatchEvent = {
      type,
      assignmentId,
      driverId,
      merchantOrderId,
      score,
      timestamp: new Date().toISOString(),
    };
    for (const listener of this.eventListeners) {
      try { listener(event); } catch (e) { this.logger.error('Event listener error', e); }
    }
  }
}

import { DriverPresenceSnapshot, DriverPresenceSerializer, CURRENT_SNAPSHOT_SCHEMA_VERSION, DriverStatusValue } from './driver-presence.snapshot';
import { InvalidStatusTransitionError } from './driver-presence.errors';

const ACTIVE_STATUSES: DriverStatusValue[] = ['ONLINE', 'BUSY', 'ON_PICKUP', 'ON_DELIVERY'];

const GO_ONLINE_VALID_FROM: DriverStatusValue[] = ['OFFLINE'];
const PAUSE_VALID_FROM: DriverStatusValue[] = ['ONLINE'];
const RESUME_VALID_FROM: DriverStatusValue[] = ['PAUSED'];

interface DriverPresenceState {
  driverId: string;
  status: DriverStatusValue;
  latitude: number | null;
  longitude: number | null;
  lastHeartbeatAt: Date | null;
  aggregateVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export class DriverPresence {
  private constructor(private readonly state: DriverPresenceState) {}

  static create(driverId: string): DriverPresence {
    return new DriverPresence({
      driverId,
      status: 'OFFLINE',
      latitude: null,
      longitude: null,
      lastHeartbeatAt: null,
      aggregateVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  static rehydrate(snapshot: DriverPresenceSnapshot): DriverPresence {
    return new DriverPresence({
      driverId: snapshot.driverId,
      status: snapshot.status,
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      lastHeartbeatAt: snapshot.lastHeartbeatAt ? new Date(snapshot.lastHeartbeatAt) : null,
      aggregateVersion: snapshot.aggregateVersion,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  goOnline(latitude?: number, longitude?: number): void {
    if (!(GO_ONLINE_VALID_FROM as readonly string[]).includes(this.state.status)) {
      throw new InvalidStatusTransitionError(this.state.driverId, this.state.status, 'ONLINE');
    }
    this.state.status = 'ONLINE';
    this.state.lastHeartbeatAt = new Date();
    if (latitude != null) this.state.latitude = latitude;
    if (longitude != null) this.state.longitude = longitude;
    this.state.aggregateVersion++;
    this.state.updatedAt = new Date();
  }

  goOffline(): void {
    if (this.state.status === 'OFFLINE') {
      throw new InvalidStatusTransitionError(this.state.driverId, this.state.status, 'OFFLINE');
    }
    this.state.status = 'OFFLINE';
    this.state.aggregateVersion++;
    this.state.updatedAt = new Date();
  }

  pause(): void {
    if (!(PAUSE_VALID_FROM as readonly string[]).includes(this.state.status)) {
      throw new InvalidStatusTransitionError(this.state.driverId, this.state.status, 'PAUSED');
    }
    this.state.status = 'PAUSED';
    this.state.aggregateVersion++;
    this.state.updatedAt = new Date();
  }

  resume(): void {
    if (!(RESUME_VALID_FROM as readonly string[]).includes(this.state.status)) {
      throw new InvalidStatusTransitionError(this.state.driverId, this.state.status, 'ONLINE');
    }
    this.state.status = 'ONLINE';
    this.state.lastHeartbeatAt = new Date();
    this.state.aggregateVersion++;
    this.state.updatedAt = new Date();
  }

  heartbeat(latitude?: number, longitude?: number): void {
    this.state.lastHeartbeatAt = new Date();
    if (latitude != null) this.state.latitude = latitude;
    if (longitude != null) this.state.longitude = longitude;
    this.state.aggregateVersion++;
    this.state.updatedAt = new Date();
  }

  updateLocation(latitude: number, longitude: number): void {
    this.state.latitude = latitude;
    this.state.longitude = longitude;
    this.state.aggregateVersion++;
    this.state.updatedAt = new Date();
  }

  forceOffline(): void {
    this.state.status = 'OFFLINE';
    this.state.aggregateVersion++;
    this.state.updatedAt = new Date();
  }

  isActive(): boolean {
    return (ACTIVE_STATUSES as readonly string[]).includes(this.state.status);
  }

  toSnapshot(): DriverPresenceSnapshot {
    return DriverPresenceSerializer.addChecksum({
      snapshotSchemaVersion: CURRENT_SNAPSHOT_SCHEMA_VERSION,
      aggregateVersion: this.state.aggregateVersion,
      driverId: this.state.driverId,
      status: this.state.status,
      latitude: this.state.latitude,
      longitude: this.state.longitude,
      lastHeartbeatAt: this.state.lastHeartbeatAt?.toISOString() ?? null,
    });
  }

  get driverId(): string { return this.state.driverId; }
  get status(): DriverStatusValue { return this.state.status; }
  get latitude(): number | null { return this.state.latitude; }
  get longitude(): number | null { return this.state.longitude; }
  get lastHeartbeatAt(): Date | null { return this.state.lastHeartbeatAt; }
  get aggregateVersion(): number { return this.state.aggregateVersion; }
  get createdAt(): Date { return this.state.createdAt; }
  get updatedAt(): Date { return this.state.updatedAt; }
}

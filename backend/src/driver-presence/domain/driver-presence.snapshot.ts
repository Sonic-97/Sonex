import { createHash } from 'crypto';

export const CURRENT_SNAPSHOT_SCHEMA_VERSION = 1;

export type DriverStatusValue = 'OFFLINE' | 'ONLINE' | 'PAUSED' | 'BUSY' | 'ON_PICKUP' | 'ON_DELIVERY';

export interface DriverPresenceSnapshot {
  snapshotSchemaVersion: number;
  aggregateVersion: number;
  driverId: string;
  status: DriverStatusValue;
  latitude: number | null;
  longitude: number | null;
  lastHeartbeatAt: string | null;
  checksum: string;
}

function serializeContent(snapshot: Omit<DriverPresenceSnapshot, 'checksum'>): string {
  return JSON.stringify({
    snapshotSchemaVersion: snapshot.snapshotSchemaVersion,
    aggregateVersion: snapshot.aggregateVersion,
    driverId: snapshot.driverId,
    status: snapshot.status,
    latitude: snapshot.latitude,
    longitude: snapshot.longitude,
    lastHeartbeatAt: snapshot.lastHeartbeatAt,
  });
}

export class DriverPresenceSerializer {
  static serialize(snapshot: Omit<DriverPresenceSnapshot, 'checksum'>): string {
    return serializeContent(snapshot);
  }

  static computeChecksum(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  static addChecksum(snapshot: Omit<DriverPresenceSnapshot, 'checksum'>): DriverPresenceSnapshot {
    const serialized = this.serialize(snapshot);
    const checksum = this.computeChecksum(serialized);
    return { ...snapshot, checksum };
  }

  static validateChecksum(snapshot: DriverPresenceSnapshot): boolean {
    const { checksum, ...rest } = snapshot;
    const serialized = serializeContent(rest);
    const expected = this.computeChecksum(serialized);
    return expected === checksum;
  }

  static deserialize(data: string): DriverPresenceSnapshot {
    const parsed = JSON.parse(data);
    this.assertRequiredFields(parsed);
    const snapshot: DriverPresenceSnapshot = {
      snapshotSchemaVersion: parsed.snapshotSchemaVersion,
      aggregateVersion: parsed.aggregateVersion,
      driverId: parsed.driverId,
      status: parsed.status,
      latitude: parsed.latitude ?? null,
      longitude: parsed.longitude ?? null,
      lastHeartbeatAt: parsed.lastHeartbeatAt ?? null,
      checksum: parsed.checksum,
    };
    if (!this.validateChecksum(snapshot)) {
      throw new Error('Snapshot checksum validation failed');
    }
    return snapshot;
  }

  static storeJson(snapshot: DriverPresenceSnapshot): string {
    return JSON.stringify(snapshot);
  }

  private static assertRequiredFields(data: Record<string, unknown>): void {
    const required = ['snapshotSchemaVersion', 'aggregateVersion', 'driverId', 'status', 'checksum'];
    for (const field of required) {
      if (data[field] === undefined || data[field] === null) {
        throw new Error(`Snapshot missing required field: ${field}`);
      }
    }
  }
}

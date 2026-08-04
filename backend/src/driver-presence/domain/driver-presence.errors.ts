export class DriverPresenceError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'DriverPresenceError';
  }
}

export class DriverPresenceNotFoundError extends DriverPresenceError {
  constructor(driverId: string) {
    super(`Driver presence not found: ${driverId}`, 'DRIVER_PRESENCE_NOT_FOUND');
  }
}

export class InvalidStatusTransitionError extends DriverPresenceError {
  constructor(driverId: string, from: string, to: string) {
    super(`Cannot transition driver ${driverId} from ${from} to ${to}`, 'INVALID_STATUS_TRANSITION');
  }
}

export class OptimisticConcurrencyError extends DriverPresenceError {
  constructor(driverId: string, expectedVersion: number, actualVersion: number) {
    super(
      `Optimistic concurrency conflict for DriverPresence ${driverId}: expected version ${expectedVersion}, actual version ${actualVersion}`,
      'OPTIMISTIC_CONCURRENCY_CONFLICT',
    );
  }
}

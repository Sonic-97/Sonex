export class PaymentIntentError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'PaymentIntentError';
  }
}

export class PaymentIntentNotFoundError extends PaymentIntentError {
  constructor(id: string) {
    super(`PaymentIntent not found: ${id}`, 'PAYMENT_INTENT_NOT_FOUND');
  }
}

export class OptimisticConcurrencyError extends PaymentIntentError {
  constructor(id: string, expectedVersion: number, actualVersion: number) {
    super(
      `Optimistic concurrency conflict for PaymentIntent ${id}: expected version ${expectedVersion}, actual version ${actualVersion}`,
      'OPTIMISTIC_CONCURRENCY_CONFLICT',
    );
  }
}

export class InvalidSnapshotError extends PaymentIntentError {
  constructor(reason: string) {
    super(`Invalid snapshot: ${reason}`, 'INVALID_SNAPSHOT');
  }
}

export class UnsupportedFutureSchemaError extends PaymentIntentError {
  constructor(schemaVersion: number) {
    super(`Unsupported future snapshot schema version: ${schemaVersion}`, 'UNSUPPORTED_FUTURE_SCHEMA');
  }
}

export class CorruptedSnapshotError extends PaymentIntentError {
  constructor(id: string) {
    super(`Corrupted snapshot for PaymentIntent ${id} — checksum mismatch`, 'CORRUPTED_SNAPSHOT');
  }
}

export class TenantIsolationError extends PaymentIntentError {
  constructor(id: string, expectedTenant: string, actualTenant: string) {
    super(
      `Tenant isolation violation for PaymentIntent ${id}: expected tenant ${expectedTenant}, found ${actualTenant}`,
      'TENANT_ISOLATION_VIOLATION',
    );
  }
}

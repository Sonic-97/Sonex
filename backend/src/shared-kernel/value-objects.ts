import { Decimal } from './decimal';
import { ValueObject } from './domain';
import { DomainError } from './errors';
import type { ActorId, CausationId, CorrelationId } from './identifiers';
import { deepFreeze } from './immutable';
import { Quantity } from './quantity';
import { instant, Instant } from './time';
import type { AggregateVersion } from './versions';

const UNIT_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const SHA_256_PATTERN = /^[a-fA-F0-9]{64}$/;

/** A validated percentage expressed on the inclusive range from 0 to 100. */
export class Percentage extends ValueObject<{ readonly value: string }> {
  private constructor(private readonly value: Decimal) {
    super({ value: value.toString() });
    this.freezeValueObject();
  }

  static from(value: string): Percentage {
    const decimal = Decimal.from(value);
    if (decimal.isNegative() || decimal.compare(Decimal.from('100')) > 0) {
      throw new DomainError('SHARED_PERCENTAGE_INVALID', 'Percentage must be between 0 and 100');
    }
    return new Percentage(decimal);
  }

  toString(): string {
    return this.value.toString();
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  serialize(): Readonly<{ readonly value: string }> {
    return Object.freeze({ value: this.toString() });
  }
}

/** A canonical unit code. Conversion and dimensions remain outside the Shared Kernel. */
export class Unit extends ValueObject<{ readonly code: string }> {
  private constructor(public readonly code: string) {
    super({ code });
    this.freezeValueObject();
  }

  static from(code: string): Unit {
    if (typeof code !== 'string' || !UNIT_PATTERN.test(code.trim())) {
      throw new DomainError('SHARED_UNIT_INVALID', 'Unit code is invalid');
    }
    return new Unit(code.trim().toLowerCase());
  }

  serialize(): Readonly<{ readonly code: string }> {
    return Object.freeze({ code: this.code });
  }
}

/** A quantity paired with its canonical Unit without performing conversion. */
export class Measurement extends ValueObject<{ readonly quantity: string; readonly unit: string }> {
  private constructor(public readonly quantity: Quantity, public readonly unit: Unit) {
    super({ quantity: quantity.serialize().value, unit: unit.code });
    this.freezeValueObject();
  }

  static from(quantity: Quantity, unit: Unit): Measurement {
    if (quantity.unit.toLowerCase() !== unit.code) {
      throw new DomainError('SHARED_MEASUREMENT_UNIT_MISMATCH', 'Quantity and Unit must match');
    }
    return new Measurement(quantity, unit);
  }

  format(): string {
    return `${this.quantity.serialize().value} ${this.unit.code}`;
  }

  serialize(): Readonly<{ readonly quantity: string; readonly unit: string }> {
    return Object.freeze({ quantity: this.quantity.serialize().value, unit: this.unit.code });
  }
}

/** A validated SHA-256 digest. Generation belongs to callers and infrastructure-safe utilities. */
export class Hash extends ValueObject<{ readonly algorithm: 'SHA-256'; readonly value: string }> {
  private constructor(public readonly value: string) {
    super({ algorithm: 'SHA-256', value });
    this.freezeValueObject();
  }

  static sha256(value: string): Hash {
    if (typeof value !== 'string' || !SHA_256_PATTERN.test(value)) {
      throw new DomainError('SHARED_HASH_INVALID', 'Hash must be a SHA-256 hexadecimal value');
    }
    return new Hash(value.toLowerCase());
  }

  serialize(): Readonly<{ readonly algorithm: 'SHA-256'; readonly value: string }> {
    return Object.freeze({ algorithm: 'SHA-256', value: this.value });
  }
}

/** An inclusive UTC range for temporal domain policies. */
export class DateRange extends ValueObject<{ readonly start: string; readonly end: string }> {
  private constructor(public readonly start: Instant, public readonly end: Instant) {
    super({ start, end });
    this.freezeValueObject();
  }

  static from(start: Instant | string | Date, end: Instant | string | Date): DateRange {
    const normalizedStart = instant(start);
    const normalizedEnd = instant(end);
    if (normalizedEnd < normalizedStart) {
      throw new DomainError('SHARED_DATE_RANGE_INVALID', 'Date range end must not precede start');
    }
    return new DateRange(normalizedStart, normalizedEnd);
  }

  contains(value: Instant | string | Date): boolean {
    const normalized = instant(value);
    return normalized >= this.start && normalized <= this.end;
  }

  overlaps(other: DateRange): boolean {
    return this.start <= other.end && other.start <= this.end;
  }

  duration(): bigint {
    return BigInt(Date.parse(this.end) - Date.parse(this.start));
  }

  serialize(): Readonly<{ readonly start: Instant; readonly end: Instant }> {
    return Object.freeze({ start: this.start, end: this.end });
  }
}

export interface AuditMetadataInput {
  readonly createdAt: Instant;
  readonly createdBy: ActorId;
  readonly lastModifiedAt: Instant;
  readonly lastModifiedBy: ActorId;
  readonly correlationId: CorrelationId;
  readonly causationId: CausationId;
  readonly version: AggregateVersion;
}

/** Immutable authoring and modification evidence attached to an aggregate snapshot. */
export class AuditMetadata extends ValueObject<{
  readonly createdAt: string;
  readonly createdBy: string;
  readonly lastModifiedAt: string;
  readonly lastModifiedBy: string;
  readonly correlationId: string;
  readonly causationId: string;
  readonly version: number;
}> {
  public readonly createdAt: Instant;
  public readonly createdBy: ActorId;
  public readonly lastModifiedAt: Instant;
  public readonly lastModifiedBy: ActorId;
  public readonly correlationId: CorrelationId;
  public readonly causationId: CausationId;
  public readonly version: AggregateVersion;

  private constructor(input: AuditMetadataInput) {
    super({
      createdAt: input.createdAt,
      createdBy: input.createdBy,
      lastModifiedAt: input.lastModifiedAt,
      lastModifiedBy: input.lastModifiedBy,
      correlationId: input.correlationId,
      causationId: input.causationId,
      version: input.version,
    });
    this.createdAt = input.createdAt;
    this.createdBy = input.createdBy;
    this.lastModifiedAt = input.lastModifiedAt;
    this.lastModifiedBy = input.lastModifiedBy;
    this.correlationId = input.correlationId;
    this.causationId = input.causationId;
    this.version = input.version;
    this.freezeValueObject();
  }

  static from(input: AuditMetadataInput): AuditMetadata {
    if (input.lastModifiedAt < input.createdAt) {
      throw new DomainError('SHARED_AUDIT_TIME_INVALID', 'Last modified time must not precede created time');
    }
    return new AuditMetadata(deepFreeze({ ...input }) as AuditMetadataInput);
  }

  serialize(): Readonly<AuditMetadataInput> {
    return Object.freeze({
      createdAt: this.createdAt,
      createdBy: this.createdBy,
      lastModifiedAt: this.lastModifiedAt,
      lastModifiedBy: this.lastModifiedBy,
      correlationId: this.correlationId,
      causationId: this.causationId,
      version: this.version,
    });
  }
}

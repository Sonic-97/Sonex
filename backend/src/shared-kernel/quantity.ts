import { Decimal } from './decimal'; import { DomainError } from './errors';
export class Quantity { private constructor(private readonly value: Decimal, public readonly unit: string) { Object.freeze(this); }
  static from(value: string, unit: string): Quantity { if (!unit || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(unit)) throw new DomainError('SHARED_QUANTITY_UNIT_INVALID', 'Quantity unit is invalid'); const decimal = Decimal.from(value); if (decimal.isNegative()) throw new DomainError('SHARED_QUANTITY_NEGATIVE', 'Quantity cannot be negative'); return new Quantity(decimal, unit); }
  assertPositive(): this { if (this.value.isZero()) throw new DomainError('SHARED_QUANTITY_ZERO', 'Quantity must be positive'); return this; }
  add(other: Quantity): Quantity { if (this.unit !== other.unit) throw new DomainError('SHARED_QUANTITY_UNIT_MISMATCH', 'Quantity units must match', { left: this.unit, right: other.unit }); return new Quantity(this.value.add(other.value), this.unit); }
  scale(multiplier: bigint): Quantity { if (multiplier < 0n) throw new DomainError('SHARED_QUANTITY_MULTIPLIER_INVALID', 'Quantity multiplier cannot be negative'); return new Quantity(this.value.multiplyInteger(multiplier), this.unit); }
  serialize(): Readonly<{ value: string; unit: string }> { return Object.freeze({ value: this.value.toString(), unit: this.unit }); }
}

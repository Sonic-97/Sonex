import { Decimal, RoundingStrategy } from './decimal'; import { ValueObject } from './domain'; import { DomainError } from './errors';
const SCALES = Object.freeze({ AED: 2, EGP: 2, EUR: 2, GBP: 2, JPY: 0, KWD: 3, SAR: 2, USD: 2 });
export type SupportedCurrencyCode = keyof typeof SCALES;
export class Currency { private constructor(public readonly code: SupportedCurrencyCode, public readonly scale: number) { Object.freeze(this); }
  static from(code: string): Currency { const value = code?.toUpperCase() as SupportedCurrencyCode, scale = SCALES[value]; if (scale === undefined) throw new DomainError('SHARED_CURRENCY_UNKNOWN', `Unsupported currency: ${code}`); return new Currency(value, scale); } }
export interface SerializedMoney { readonly amount: string; readonly currency: SupportedCurrencyCode; }
export class Money extends ValueObject<{ readonly amount: string; readonly currency: SupportedCurrencyCode }> { private constructor(private readonly value: Decimal, public readonly currency: Currency) { super({ amount: value.toFixed(currency.scale), currency: currency.code }); this.freezeValueObject(); }
  static from(amount: string, currency: string, strategy: RoundingStrategy = 'HALF_UP'): Money { const unit = Currency.from(currency); return new Money(Decimal.from(amount).round(unit.scale, strategy), unit); }
  static fromMinorUnits(amount: bigint, currency: string): Money { const unit = Currency.from(currency); const sign = amount < 0n ? '-' : ''; const absolute = amount < 0n ? -amount : amount; const divisor = 10n ** BigInt(unit.scale); const whole = absolute / divisor; const fraction = unit.scale === 0 ? '' : `.${(absolute % divisor).toString().padStart(unit.scale, '0')}`; return Money.from(`${sign}${whole}${fraction}`, unit.code); }
  static zero(currency: string): Money { return Money.from('0', currency); }
  add(other: Money): Money { this.assertCurrency(other); return new Money(this.value.add(other.value), this.currency); }
  subtract(other: Money): Money { this.assertCurrency(other); return new Money(this.value.subtract(other.value), this.currency); }
  multiply(quantity: bigint): Money { return new Money(this.value.multiplyInteger(quantity), this.currency); }
  negate(): Money { return new Money(this.value.multiplyInteger(-1n), this.currency); }
  compare(other: Money): number { this.assertCurrency(other); return this.value.compare(other.value); } isNegative(): boolean { return this.value.isNegative(); } isPositive(): boolean { return !this.value.isNegative() && !this.value.isZero(); }
  minorUnits(): bigint { const text = this.toString(); const negative = text.startsWith('-'); const unsigned = negative ? text.slice(1) : text; const [whole, fraction = ''] = unsigned.split('.'); const raw = BigInt(`${whole}${fraction.padEnd(this.currency.scale, '0')}`); return negative ? -raw : raw; }
  assertNonNegative(field = 'money'): this { if (this.isNegative()) throw new DomainError('SHARED_MONEY_NEGATIVE', `${field} cannot be negative`); return this; }
  serialize(): SerializedMoney { return Object.freeze({ amount: this.toString(), currency: this.currency.code }); } toString(): string { return this.value.toFixed(this.currency.scale); }
  private assertCurrency(other: Money): void { if (this.currency.code !== other.currency.code) throw new DomainError('SHARED_MONEY_CURRENCY_MISMATCH', 'Money currencies must match', { left: this.currency.code, right: other.currency.code }); }
}

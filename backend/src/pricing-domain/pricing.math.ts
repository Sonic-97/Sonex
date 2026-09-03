import { Currency, Decimal, Money, RoundingStrategy } from '../shared-kernel';
import { CurrencyMismatchError, PricingAmountOverflowError } from './pricing.errors';
import { PricingRate } from './pricing.value-objects';

const DECIMAL_SCALE = 1_000_000n;
const RATE_DENOMINATOR = 10_000n;
const MAX_RAW = 1_000_000_000_000n * DECIMAL_SCALE;

function gcd(left: bigint, right: bigint): bigint { let a = left < 0n ? -left : left; let b = right < 0n ? -right : right; while (b !== 0n) { const next = a % b; a = b; b = next; } return a; }
function checked(value: bigint): bigint { if (value > MAX_RAW * RATE_DENOMINATOR || value < -MAX_RAW * RATE_DENOMINATOR) throw new PricingAmountOverflowError(); return value; }
function parseRaw(value: string): bigint { Decimal.from(value); const negative = value.startsWith('-'); const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.'); const raw = BigInt(whole) * DECIMAL_SCALE + BigInt(fraction.padEnd(6, '0')); return negative ? -raw : raw; }
function rounded(numerator: bigint, denominator: bigint, strategy: RoundingStrategy): bigint {
  const sign = numerator < 0n ? -1n : 1n; const absolute = numerator < 0n ? -numerator : numerator; const quotient = absolute / denominator; const remainder = absolute % denominator;
  if (remainder === 0n || strategy === 'DOWN') return sign * quotient;
  if (strategy === 'UP') return sign * (quotient + 1n);
  if (strategy === 'HALF_UP') return sign * (quotient + (remainder * 2n >= denominator ? 1n : 0n));
  return sign * (quotient + (remainder * 2n > denominator || (remainder * 2n === denominator && quotient % 2n !== 0n) ? 1n : 0n));
}

/** Internal exact rational amount. It is never exposed as a public contract. */
export class PreciseMoney {
  private constructor(private readonly numerator: bigint, private readonly denominator: bigint, public readonly currency: Currency) { Object.freeze(this); }
  static fromDecimal(value: string, currency: Currency): PreciseMoney { return new PreciseMoney(parseRaw(value), DECIMAL_SCALE, currency); }
  static fromMoney(value: Money): PreciseMoney { return PreciseMoney.fromDecimal(value.serialize().amount, value.currency); }
  static zero(currency: Currency): PreciseMoney { return new PreciseMoney(0n, 1n, currency); }
  add(other: PreciseMoney): PreciseMoney { this.assertCurrency(other); return this.create(checked(this.numerator * other.denominator + other.numerator * this.denominator), this.denominator * other.denominator); }
  subtract(other: PreciseMoney): PreciseMoney { this.assertCurrency(other); return this.create(checked(this.numerator * other.denominator - other.numerator * this.denominator), this.denominator * other.denominator); }
  multiply(quantity: bigint): PreciseMoney { return this.create(checked(this.numerator * quantity), this.denominator); }
  apply(rate: PricingRate): PreciseMoney { return this.create(checked(this.numerator * rate.basisPoints), this.denominator * RATE_DENOMINATOR); }
  divideByRateDenominator(rate: PricingRate): PreciseMoney { return this.create(checked(this.numerator * RATE_DENOMINATOR), this.denominator * (RATE_DENOMINATOR + rate.basisPoints)); }
  compare(other: PreciseMoney): number { this.assertCurrency(other); const difference = this.numerator * other.denominator - other.numerator * this.denominator; return difference < 0n ? -1 : difference > 0n ? 1 : 0; }
  isNegative(): boolean { return this.numerator < 0n; }
  toMoney(strategy: RoundingStrategy): Money {
    const factor = 10n ** BigInt(this.currency.scale); const minor = rounded(this.numerator * factor, this.denominator, strategy); const sign = minor < 0n ? '-' : ''; const absolute = minor < 0n ? -minor : minor;
    const unit = 10n ** BigInt(this.currency.scale); const text = this.currency.scale === 0 ? absolute.toString() : `${absolute / unit}.${(absolute % unit).toString().padStart(this.currency.scale, '0')}`;
    return Money.from(`${sign}${text}`, this.currency.code, strategy);
  }
  private create(numerator: bigint, denominator: bigint): PreciseMoney { const divisor = gcd(numerator, denominator); return new PreciseMoney(numerator / divisor, denominator / divisor, this.currency); }
  private assertCurrency(other: PreciseMoney): void { if (this.currency.code !== other.currency.code) throw new CurrencyMismatchError(); }
}

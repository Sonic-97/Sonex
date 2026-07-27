import { DomainError } from './errors';
export type RoundingStrategy = 'HALF_UP' | 'HALF_EVEN' | 'DOWN' | 'UP';
const SCALE = 6, FACTOR = 1_000_000n, MAX_RAW = 1_000_000_000_000n * FACTOR;
const PATTERN = /^-?\d+(?:\.\d{1,6})?$/;
export class Decimal {
  static readonly scale = SCALE;
  private constructor(private readonly raw: bigint) {}
  static from(value: string): Decimal {
    if (typeof value !== 'string' || !PATTERN.test(value.trim())) throw new DomainError('SHARED_DECIMAL_INVALID', 'Decimal must be a string with at most 6 fractional digits');
    const text = value.trim(), negative = text.startsWith('-'), unsigned = negative ? text.slice(1) : text;
    const [whole, fraction = ''] = unsigned.split('.'); const raw = BigInt(whole) * FACTOR + BigInt(fraction.padEnd(SCALE, '0'));
    return Decimal.fromRaw(negative ? -raw : raw);
  }
  static zero(): Decimal { return new Decimal(0n); }
  static fromRaw(raw: bigint): Decimal { if (raw > MAX_RAW || raw < -MAX_RAW) throw new DomainError('SHARED_DECIMAL_OVERFLOW', 'Decimal exceeds the supported range'); return new Decimal(raw); }
  add(other: Decimal): Decimal { return Decimal.fromRaw(this.raw + other.raw); } subtract(other: Decimal): Decimal { return Decimal.fromRaw(this.raw - other.raw); }
  multiplyInteger(value: bigint): Decimal { return Decimal.fromRaw(this.raw * value); } compare(other: Decimal): number { return this.raw < other.raw ? -1 : this.raw > other.raw ? 1 : 0; }
  isNegative(): boolean { return this.raw < 0n; } isZero(): boolean { return this.raw === 0n; }
  round(scale: number, strategy: RoundingStrategy): Decimal {
    if (!Number.isSafeInteger(scale) || scale < 0 || scale > SCALE) throw new DomainError('SHARED_DECIMAL_SCALE_INVALID', `Scale must be between 0 and ${SCALE}`);
    const divisor = 10n ** BigInt(SCALE - scale); if (divisor === 1n) return this;
    const sign = this.raw < 0n ? -1n : 1n, absolute = this.raw < 0n ? -this.raw : this.raw, quotient = absolute / divisor, remainder = absolute % divisor;
    let increment = strategy === 'UP' && remainder !== 0n;
    if (strategy === 'HALF_UP') increment = remainder * 2n >= divisor;
    if (strategy === 'HALF_EVEN') increment = remainder * 2n > divisor || (remainder * 2n === divisor && quotient % 2n !== 0n);
    return Decimal.fromRaw(sign * (quotient + (increment ? 1n : 0n)) * divisor);
  }
  toFixed(scale: number, strategy: RoundingStrategy = 'HALF_UP'): string {
    const rounded = this.round(scale, strategy).raw, sign = rounded < 0n ? '-' : '', absolute = rounded < 0n ? -rounded : rounded;
    const scaled = absolute / (10n ** BigInt(SCALE - scale)); if (scale === 0) return `${sign}${scaled}`;
    const factor = 10n ** BigInt(scale); return `${sign}${scaled / factor}.${(scaled % factor).toString().padStart(scale, '0')}`;
  }
  toString(): string { const sign = this.raw < 0n ? '-' : '', a = this.raw < 0n ? -this.raw : this.raw; return `${sign}${a / FACTOR}.${(a % FACTOR).toString().padStart(SCALE, '0')}`.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'); }
}

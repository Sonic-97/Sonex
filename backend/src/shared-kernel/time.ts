import { ContractError } from './errors';
declare const instantBrand: unique symbol;
export type Instant = string & { readonly [instantBrand]: 'Instant' };
export function instant(value: string | Date): Instant {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new ContractError('SHARED_TIME_INVALID', 'Timestamp must be a valid instant');
  return date.toISOString() as Instant;
}
export interface Clock { now(): Instant; }
export class SystemClock implements Clock { now(): Instant { return instant(new Date()); } }
export class FixedClock implements Clock { constructor(private readonly value: Instant) {} now(): Instant { return this.value; } }

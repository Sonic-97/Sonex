import { DomainError } from '../shared-kernel';
export class PricingDomainError extends DomainError { constructor(code: string, message: string, details?: Readonly<Record<string, unknown>>) { super(code, message, details); } }
export class CurrencyMismatchError extends PricingDomainError { constructor() { super('PRICING_CURRENCY_MISMATCH', 'All pricing amounts must use the requested currency'); } }
export class InvalidQuantityError extends PricingDomainError { constructor() { super('PRICING_INVALID_QUANTITY', 'Pricing requires a positive whole-item quantity'); } }
export class InvalidRateError extends PricingDomainError { constructor() { super('PRICING_INVALID_RATE', 'Pricing rate is invalid'); } }
export class PricingAmountOverflowError extends PricingDomainError { constructor() { super('PRICING_AMOUNT_OVERFLOW', 'Pricing amount exceeds the supported range'); } }
export class PricingConflictError extends PricingDomainError { constructor(message: string) { super('PRICING_RULE_CONFLICT', message); } }
export class PricingStateError extends PricingDomainError { constructor(message: string) { super('PRICING_STATE_INVALID', message); } }
export class PriceNotFoundError extends PricingDomainError { constructor() { super('PRICING_PRICE_NOT_FOUND', 'No effective price rule exists for the product'); } }

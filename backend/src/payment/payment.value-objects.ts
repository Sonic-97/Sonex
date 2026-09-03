import { ContractError, Money, ValueObject } from '../shared-kernel';

const text = (value: string, code: string): string => {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 128) throw new ContractError(code, 'Value is invalid');
  return normalized;
};

export type TenderTypeValue = 'CASH' | 'CARD' | 'WALLET' | 'OFFLINE';
export class TenderType extends ValueObject<{ readonly value: TenderTypeValue }> {
  private constructor(public readonly value: TenderTypeValue) { super({ value }); this.freezeValueObject(); }
  static from(value: string): TenderType {
    if (!['CASH', 'CARD', 'WALLET', 'OFFLINE'].includes(value)) throw new ContractError('PAYMENT_TENDER_TYPE_INVALID', 'Tender type is invalid');
    return new TenderType(value as TenderTypeValue);
  }
}

export type PaymentStatusValue = 'CREATED' | 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'SETTLED' | 'FAILED' | 'VOIDED' | 'CANCELLED' | 'REFUND_PENDING' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'OFFLINE_PENDING_RECONCILIATION';
export class PaymentStatus extends ValueObject<{ readonly value: PaymentStatusValue }> {
  private constructor(public readonly value: PaymentStatusValue) { super({ value }); this.freezeValueObject(); }
  static from(value: string): PaymentStatus {
    const values: readonly PaymentStatusValue[] = ['CREATED', 'PENDING', 'AUTHORIZED', 'CAPTURED', 'SETTLED', 'FAILED', 'VOIDED', 'CANCELLED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'OFFLINE_PENDING_RECONCILIATION'];
    if (!values.includes(value as PaymentStatusValue)) throw new ContractError('PAYMENT_STATUS_INVALID', 'Payment status is invalid');
    return new PaymentStatus(value as PaymentStatusValue);
  }
}

export class AuthorizationCode extends ValueObject<{ readonly value: string }> { private constructor(public readonly value: string) { super({ value }); this.freezeValueObject(); } static from(value: string): AuthorizationCode { return new AuthorizationCode(text(value, 'PAYMENT_AUTHORIZATION_CODE_INVALID')); } }
export class GatewayReference extends ValueObject<{ readonly value: string }> { private constructor(public readonly value: string) { super({ value }); this.freezeValueObject(); } static from(value: string): GatewayReference { return new GatewayReference(text(value, 'PAYMENT_GATEWAY_REFERENCE_INVALID')); } }
export class SettlementBatchReference extends ValueObject<{ readonly value: string }> { private constructor(public readonly value: string) { super({ value }); this.freezeValueObject(); } static from(value: string): SettlementBatchReference { return new SettlementBatchReference(text(value, 'PAYMENT_SETTLEMENT_REFERENCE_INVALID')); } }
export class RefundReason extends ValueObject<{ readonly value: string }> { private constructor(public readonly value: string) { super({ value }); this.freezeValueObject(); } static from(value: string): RefundReason { return new RefundReason(text(value, 'PAYMENT_REFUND_REASON_INVALID')); } }
export class ReceiptNumber extends ValueObject<{ readonly value: string }> { private constructor(public readonly value: string) { super({ value }); this.freezeValueObject(); } static from(value: string): ReceiptNumber { return new ReceiptNumber(text(value, 'PAYMENT_RECEIPT_NUMBER_INVALID')); } }

export const paymentMoney = (amount: string, currency: string, field = 'amount'): Money => Money.from(amount, currency).assertNonNegative(field);

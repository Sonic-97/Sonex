import { domainId, type AggregateId } from '../shared-kernel';

export type PaymentIntentId = AggregateId<'PaymentIntentId'>;
export type PaymentTransactionId = AggregateId<'PaymentTransactionId'>;
export type PaymentAttemptId = AggregateId<'PaymentAttemptId'>;
export type RefundId = AggregateId<'RefundId'>;
export type SettlementId = AggregateId<'SettlementId'>;
export type ReceiptId = AggregateId<'ReceiptId'>;

export const paymentIntentId = (value: string): PaymentIntentId => domainId('PaymentIntentId', value);
export const paymentTransactionId = (value: string): PaymentTransactionId => domainId('PaymentTransactionId', value);
export const paymentAttemptId = (value: string): PaymentAttemptId => domainId('PaymentAttemptId', value);
export const refundId = (value: string): RefundId => domainId('RefundId', value);
export const settlementId = (value: string): SettlementId => domainId('SettlementId', value);
export const receiptId = (value: string): ReceiptId => domainId('ReceiptId', value);

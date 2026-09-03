import type { Command, DeepReadonly, DomainEvent, Instant, Money, Query, TenantId } from '../shared-kernel';
import type { ConfirmedPaymentRequest } from '../commerce';
import type { PaymentAttemptId, PaymentIntentId, PaymentTransactionId, ReceiptId, RefundId, SettlementId } from './payment.types';
import type { AuthorizationCode, GatewayReference, ReceiptNumber, RefundReason, SettlementBatchReference, TenderType } from './payment.value-objects';

export type PaymentEventName = 'PaymentIntentCreated' | 'PaymentAttemptCreated' | 'PaymentAuthorized' | 'PaymentCaptured' | 'PaymentFailed' | 'PaymentVoided' | 'CashPaymentRecorded' | 'OfflinePaymentRecorded' | 'RefundCreated' | 'RefundCompleted' | 'SettlementClosed' | 'ReceiptGenerated';
export type PaymentDomainEvent = DomainEvent<PaymentEventName, Readonly<Record<string, string>> & { readonly tenantId: string; readonly occurredAt: string; readonly paymentIntentId?: string; readonly settlementId?: string }>;

export type PaymentAttemptSnapshot = DeepReadonly<{ readonly attemptId: PaymentAttemptId; readonly tender: TenderType; readonly amount: Money; readonly createdAt: Instant }>;
export type PaymentTransactionSnapshot = DeepReadonly<{ readonly transactionId: PaymentTransactionId; readonly attemptId: PaymentAttemptId; readonly tender: TenderType; readonly amount: Money; readonly recordedAt: Instant; readonly authorizationCode?: AuthorizationCode; readonly gatewayReference?: GatewayReference }>;
export type PaymentReceiptSnapshot = DeepReadonly<{ readonly receiptId: ReceiptId; readonly receiptNumber: ReceiptNumber; readonly paymentIntentId: PaymentIntentId; readonly amount: Money; readonly issuedAt: Instant }>;

export type CreatePaymentIntent = Command<'PAYMENT_CREATE_INTENT', { readonly paymentIntentId: PaymentIntentId; readonly request: ConfirmedPaymentRequest }>;
export type CreatePaymentAttempt = Command<'PAYMENT_CREATE_ATTEMPT', { readonly paymentIntentId: PaymentIntentId; readonly attemptId: PaymentAttemptId; readonly tender: TenderType; readonly amount: Money }>;
export type AuthorizePayment = Command<'PAYMENT_AUTHORIZE', { readonly paymentIntentId: PaymentIntentId; readonly transactionId: PaymentTransactionId; readonly attemptId: PaymentAttemptId; readonly amount: Money; readonly authorizationCode: AuthorizationCode; readonly gatewayReference: GatewayReference }>;
export type CapturePayment = Command<'PAYMENT_CAPTURE', { readonly paymentIntentId: PaymentIntentId; readonly transactionId: PaymentTransactionId; readonly attemptId: PaymentAttemptId; readonly amount: Money; readonly gatewayReference?: GatewayReference }>;
export type RecordCashPayment = Command<'PAYMENT_RECORD_CASH', { readonly paymentIntentId: PaymentIntentId; readonly transactionId: PaymentTransactionId; readonly attemptId: PaymentAttemptId; readonly amount: Money }>;
export type RecordOfflinePayment = Command<'PAYMENT_RECORD_OFFLINE', { readonly paymentIntentId: PaymentIntentId; readonly transactionId: PaymentTransactionId; readonly attemptId: PaymentAttemptId; readonly amount: Money }>;
export type VoidPayment = Command<'PAYMENT_VOID', { readonly paymentIntentId: PaymentIntentId }>;
export type CreateRefund = Command<'PAYMENT_CREATE_REFUND', { readonly paymentIntentId: PaymentIntentId; readonly refundId: RefundId; readonly amount: Money; readonly reason: RefundReason }>;
export type CloseSettlement = Command<'PAYMENT_CLOSE_SETTLEMENT', { readonly settlementId: SettlementId; readonly batch: SettlementBatchReference }>; export type GenerateReceipt = Command<'PAYMENT_GENERATE_RECEIPT', { readonly paymentIntentId: PaymentIntentId; readonly receiptId: ReceiptId; readonly receiptNumber: ReceiptNumber }>;
export type PaymentStatusQuery = Query<'PAYMENT_STATUS', { readonly paymentIntentId: PaymentIntentId }>; export type PaymentHistoryQuery = Query<'PAYMENT_HISTORY', { readonly paymentIntentId: PaymentIntentId }>; export type SettlementStatusQuery = Query<'PAYMENT_SETTLEMENT_STATUS', { readonly settlementId: SettlementId }>; export type ReceiptLookupQuery = Query<'PAYMENT_RECEIPT_LOOKUP', { readonly receiptId: ReceiptId }>; export type RefundHistoryQuery = Query<'PAYMENT_REFUND_HISTORY', { readonly paymentIntentId: PaymentIntentId }>; export type TenderBreakdownQuery = Query<'PAYMENT_TENDER_BREAKDOWN', { readonly paymentIntentId: PaymentIntentId }>;

import { correlationId, instant, Money, schemaVersion, tenantId } from '../shared-kernel';
import type { ConfirmedPaymentRequest } from '../commerce';
import { PaymentAttempt, PaymentIntent, PaymentTransaction, Receipt, Refund, Settlement } from './payment.aggregates';
import { PaymentDomainError } from './payment.errors';
import { paymentAttemptId, paymentIntentId, paymentTransactionId, receiptId, refundId, settlementId } from './payment.types';
import { AuthorizationCode, GatewayReference, ReceiptNumber, RefundReason, SettlementBatchReference, TenderType } from './payment.value-objects';

const at = instant('2026-07-30T00:00:00.000Z');
const request = (): ConfirmedPaymentRequest => ({ contractVersion: schemaVersion(1), paymentRequestId: 'payment-request-1', orderId: 'order-1' as ConfirmedPaymentRequest['orderId'], tenantId: tenantId('tenant-1'), orderVersion: 0 as ConfirmedPaymentRequest['orderVersion'], createdAt: at, currency: 'EGP', finalPayableAmount: { amount: '100.00', currency: 'EGP' }, pricingSnapshotVersion: 1, taxes: [], serviceCharges: [], discounts: [], audit: { correlationId: correlationId('correlation-1') } });
const intent = () => PaymentIntent.create(paymentIntentId('intent-1'), request(), at);
const attempt = (id = 'attempt-1', tender = 'CARD', amount = '100.00') => new PaymentAttempt(paymentAttemptId(id), TenderType.from(tender), Money.from(amount, 'EGP'), at);
const transaction = (attemptId = 'attempt-1', id = 'transaction-1', tender = 'CARD', amount = '100.00') => new PaymentTransaction(paymentTransactionId(id), paymentAttemptId(attemptId), TenderType.from(tender), Money.from(amount, 'EGP'), at, AuthorizationCode.from('auth-1'), GatewayReference.from('gateway-1'));

describe('Payment domain', () => {
  it('creates an immutable intent from the Commerce financial fact', () => {
    const result = intent();
    expect(result.status.value).toBe('CREATED');
    expect(result.payable().toString()).toBe('100.00');
    expect(result.pullDomainEvents().map((event) => event.name)).toEqual(['PaymentIntentCreated']);
  });

  it('authorizes then captures a gateway transaction exactly once', () => {
    const result = intent(); result.createAttempt(attempt(), at); result.authorize(transaction());
    expect(result.status.value).toBe('AUTHORIZED');
    expect(() => result.capture(transaction())).toThrow(PaymentDomainError);
  });

  it('supports split cash and card capture without exceeding the intent', () => {
    const result = intent(); result.createAttempt(attempt('cash-attempt', 'CASH', '40.00'), at); result.recordCash(transaction('cash-attempt', 'cash-transaction', 'CASH', '40.00'));
    result.createAttempt(attempt('card-attempt', 'CARD', '60.00'), at); result.capture(transaction('card-attempt', 'card-transaction', 'CARD', '60.00'));
    expect(result.status.value).toBe('CAPTURED'); expect(result.captured().toString()).toBe('100.00');
  });

  it('records offline tender without treating it as captured money', () => {
    const result = intent(); result.createAttempt(attempt('offline-attempt', 'OFFLINE', '100.00'), at); result.recordOffline(transaction('offline-attempt', 'offline-transaction', 'OFFLINE', '100.00'));
    expect(result.status.value).toBe('OFFLINE_PENDING_RECONCILIATION'); expect(result.captured().toString()).toBe('0.00');
  });

  it('enforces refund remaining balance and supports partial then complete refunds', () => {
    const result = intent(); result.createAttempt(attempt(), at); result.capture(transaction());
    result.refund(new Refund(refundId('refund-1'), Money.from('25.00', 'EGP'), RefundReason.from('customer-request'), at), at);
    expect(result.status.value).toBe('PARTIALLY_REFUNDED');
    result.refund(new Refund(refundId('refund-2'), Money.from('75.00', 'EGP'), RefundReason.from('customer-request'), at), at);
    expect(result.status.value).toBe('REFUNDED');
    expect(() => result.refund(new Refund(refundId('refund-3'), Money.from('1.00', 'EGP'), RefundReason.from('customer-request'), at), at)).toThrow(PaymentDomainError);
  });

  it('rejects currency mismatch and a void after capture', () => {
    const result = intent(); result.createAttempt(attempt(), at); result.capture(transaction());
    expect(() => result.void(at)).toThrow(PaymentDomainError);
    const fresh = intent(); expect(() => fresh.createAttempt(new PaymentAttempt(paymentAttemptId('usd-attempt'), TenderType.from('CARD'), Money.from('1.00', 'USD'), at), at)).toThrow(PaymentDomainError);
  });

  it('makes receipts immutable payment evidence and settlements irreversible', () => {
    const result = intent(); result.createAttempt(attempt(), at); result.capture(transaction());
    const receipt = new Receipt(receiptId('receipt-1'), ReceiptNumber.from('R-1'), result.id, result.captured(), at); result.issueReceipt(receipt);
    expect(result.receipt?.snapshot().amount.toString()).toBe('100.00'); expect(() => result.issueReceipt(receipt)).toThrow(PaymentDomainError);
    const settlement = new Settlement(tenantId('tenant-1'), settlementId('settlement-1')); settlement.close(SettlementBatchReference.from('batch-1'), at);
    expect(() => settlement.close(SettlementBatchReference.from('batch-2'), at)).toThrow(PaymentDomainError);
  });
});

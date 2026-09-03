import { AggregateRoot, Entity, Money, aggregateVersion, deepFreeze, instant, tenantId, type AggregateVersion, type Instant, type TenantId } from '../shared-kernel';
import type { ConfirmedPaymentRequest } from '../commerce';
import type { PaymentDomainEvent, PaymentEventName, PaymentReceiptSnapshot } from './payment.contracts';
import { paymentInvariant } from './payment.errors';
import { paymentAttemptId, paymentIntentId, paymentTransactionId, receiptId, refundId, type PaymentAttemptId, type PaymentIntentId, type PaymentTransactionId, type ReceiptId, type RefundId, type SettlementId } from './payment.types';
import { AuthorizationCode, GatewayReference, PaymentStatus, ReceiptNumber, RefundReason, SettlementBatchReference, TenderType } from './payment.value-objects';
import { sealPaymentIntentSnapshot, type PaymentIntentSnapshot, validatePaymentIntentSnapshot } from './payment-intent.snapshot';

const intentEvent = (name: PaymentEventName, tenantId: TenantId, paymentIntentId: PaymentIntentId, occurredAt: Instant): PaymentDomainEvent => ({ name, payload: { tenantId: String(tenantId), paymentIntentId: String(paymentIntentId), occurredAt: String(occurredAt) } });
const settlementEvent = (tenantId: TenantId, settlementId: SettlementId, occurredAt: Instant): PaymentDomainEvent => ({ name: 'SettlementClosed', payload: { tenantId: String(tenantId), settlementId: String(settlementId), occurredAt: String(occurredAt) } });
type SerializedAmount = Readonly<{ amount: string; currency: string }>;
type PaymentIntentState = Readonly<{ request: ConfirmedPaymentRequest; status: string; attempts: readonly Readonly<{ id: string; tender: string; amount: SerializedAmount; createdAt: string }>[]; transactions: readonly Readonly<{ id: string; attemptId: string; tender: string; amount: SerializedAmount; recordedAt: string; authorizationCode?: string; gatewayReference?: string }>[]; refunds: readonly Readonly<{ id: string; amount: SerializedAmount; reason: string; createdAt: string }>[]; receipt?: Readonly<{ id: string; number: string; amount: SerializedAmount; issuedAt: string }> }>;

export class PaymentAttempt extends Entity<PaymentAttemptId> {
  constructor(id: PaymentAttemptId, public readonly tender: TenderType, public readonly amount: Money, public readonly createdAt: Instant) { super(id); amount.assertNonNegative('attempt amount'); Object.freeze(this); }
}

export class PaymentTransaction extends Entity<PaymentTransactionId> {
  constructor(id: PaymentTransactionId, public readonly attemptId: PaymentAttemptId, public readonly tender: TenderType, public readonly amount: Money, public readonly recordedAt: Instant, public readonly authorizationCode?: AuthorizationCode, public readonly gatewayReference?: GatewayReference) { super(id); amount.assertNonNegative('transaction amount'); Object.freeze(this); }
}

export class Refund extends Entity<RefundId> {
  constructor(id: RefundId, public readonly amount: Money, public readonly reason: RefundReason, public readonly createdAt: Instant) { super(id); amount.assertNonNegative('refund amount'); Object.freeze(this); }
}

export class Settlement extends AggregateRoot<SettlementId, PaymentDomainEvent> {
  private closedValue = false;
  private batchValue?: SettlementBatchReference;
  constructor(public readonly tenantId: TenantId, id: SettlementId) { super(id); }
  get closed(): boolean { return this.closedValue; } get batch(): SettlementBatchReference | undefined { return this.batchValue; }
  close(batch: SettlementBatchReference, at: Instant): void { if (this.closedValue) paymentInvariant('PAYMENT_SETTLEMENT_CLOSED', 'Settlement cannot reopen'); this.closedValue = true; this.batchValue = batch; this.incrementVersion(); this.record(settlementEvent(this.tenantId, this.id, at)); }
}

export class Receipt extends Entity<ReceiptId> {
  constructor(id: ReceiptId, public readonly number: ReceiptNumber, public readonly paymentIntentId: PaymentIntentId, public readonly amount: Money, public readonly issuedAt: Instant) { super(id); amount.assertNonNegative('receipt amount'); Object.freeze(this); }
  snapshot(): PaymentReceiptSnapshot { return deepFreeze({ receiptId: this.id, receiptNumber: this.number, paymentIntentId: this.paymentIntentId, amount: this.amount, issuedAt: this.issuedAt }); }
}

export class PaymentIntent extends AggregateRoot<PaymentIntentId, PaymentDomainEvent> {
  private statusValue = PaymentStatus.from('CREATED');
  private readonly attemptsValue: PaymentAttempt[] = [];
  private readonly transactionsValue: PaymentTransaction[] = [];
  private readonly refundsValue: Refund[] = [];
  private receiptValue?: Receipt;
  private constructor(public readonly tenantId: TenantId, id: PaymentIntentId, public readonly request: ConfirmedPaymentRequest, private readonly createdAtValue: Instant, private updatedAtValue: Instant, version: AggregateVersion = aggregateVersion(0)) { super(id, version); }
  static create(id: PaymentIntentId, request: ConfirmedPaymentRequest, at: Instant): PaymentIntent {
    const intent = new PaymentIntent(request.tenantId, id, deepFreeze({ ...request, taxes: request.taxes.map((line) => ({ ...line, amount: { ...line.amount } })), serviceCharges: request.serviceCharges.map((line) => ({ ...line, amount: { ...line.amount } })), discounts: request.discounts.map((line) => ({ ...line, amount: { ...line.amount } })), finalPayableAmount: { ...request.finalPayableAmount }, ...(request.tip ? { tip: { ...request.tip } } : {}), audit: { ...request.audit } }), at, at);
    intent.record(intentEvent('PaymentIntentCreated', request.tenantId, id, at));
    return intent;
  }
  get status(): PaymentStatus { return this.statusValue; }
  get attempts(): readonly PaymentAttempt[] { return Object.freeze([...this.attemptsValue]); }
  get transactions(): readonly PaymentTransaction[] { return Object.freeze([...this.transactionsValue]); }
  get refunds(): readonly Refund[] { return Object.freeze([...this.refundsValue]); }
  get receipt(): Receipt | undefined { return this.receiptValue; }
  get createdAt(): Instant { return this.createdAtValue; } get updatedAt(): Instant { return this.updatedAtValue; }
  toSnapshot(): PaymentIntentSnapshot { return sealPaymentIntentSnapshot({ snapshotSchemaVersion: 1, aggregateId: String(this.id), tenantId: String(this.tenantId), aggregateVersion: Number(this.version), createdAt: String(this.createdAtValue), updatedAt: String(this.updatedAtValue), state: { request: this.request, status: this.statusValue.value, attempts: this.attemptsValue.map((value) => ({ id: String(value.id), tender: value.tender.value, amount: value.amount.serialize(), createdAt: String(value.createdAt) })), transactions: this.transactionsValue.map((value) => ({ id: String(value.id), attemptId: String(value.attemptId), tender: value.tender.value, amount: value.amount.serialize(), recordedAt: String(value.recordedAt), ...(value.authorizationCode ? { authorizationCode: value.authorizationCode.value } : {}), ...(value.gatewayReference ? { gatewayReference: value.gatewayReference.value } : {}) })), refunds: this.refundsValue.map((value) => ({ id: String(value.id), amount: value.amount.serialize(), reason: value.reason.value, createdAt: String(value.createdAt) })), ...(this.receiptValue ? { receipt: { id: String(this.receiptValue.id), number: this.receiptValue.number.value, amount: this.receiptValue.amount.serialize(), issuedAt: String(this.receiptValue.issuedAt) } } : {}) }, metadata: { snapshotType: 'PaymentIntent', producer: 'payment' } }); }
  static rehydrate(snapshot: PaymentIntentSnapshot): PaymentIntent { validatePaymentIntentSnapshot(snapshot); const state = snapshot.state as PaymentIntentState; const intent = new PaymentIntent(tenantId(snapshot.tenantId), paymentIntentId(snapshot.aggregateId), deepFreeze(state.request), instant(snapshot.createdAt), instant(snapshot.updatedAt), aggregateVersion(snapshot.aggregateVersion)); intent.statusValue = PaymentStatus.from(state.status); for (const value of state.attempts) intent.attemptsValue.push(new PaymentAttempt(paymentAttemptId(value.id), TenderType.from(value.tender), Money.from(value.amount.amount, value.amount.currency), instant(value.createdAt))); for (const value of state.transactions) intent.transactionsValue.push(new PaymentTransaction(paymentTransactionId(value.id), paymentAttemptId(value.attemptId), TenderType.from(value.tender), Money.from(value.amount.amount, value.amount.currency), instant(value.recordedAt), value.authorizationCode ? AuthorizationCode.from(value.authorizationCode) : undefined, value.gatewayReference ? GatewayReference.from(value.gatewayReference) : undefined)); for (const value of state.refunds) intent.refundsValue.push(new Refund(refundId(value.id), Money.from(value.amount.amount, value.amount.currency), RefundReason.from(value.reason), instant(value.createdAt))); if (state.receipt) intent.receiptValue = new Receipt(receiptId(state.receipt.id), ReceiptNumber.from(state.receipt.number), intent.id, Money.from(state.receipt.amount.amount, state.receipt.amount.currency), instant(state.receipt.issuedAt)); return intent; }
  payable(): Money { return Money.from(this.request.finalPayableAmount.amount, this.request.currency); }
  captured(): Money { return this.transactionsValue.filter((entry) => entry.tender.value !== 'OFFLINE').reduce((total, entry) => total.add(entry.amount), Money.zero(this.request.currency)); }
  refunded(): Money { return this.refundsValue.reduce((total, refund) => total.add(refund.amount), Money.zero(this.request.currency)); }
  createAttempt(attempt: PaymentAttempt, at: Instant): void { this.assertNonTerminal(); this.assertCurrency(attempt.amount); if (this.attemptsValue.some((value) => value.id === attempt.id)) paymentInvariant('PAYMENT_ATTEMPT_DUPLICATE', 'Payment attempt already exists'); this.attemptsValue.push(attempt); this.statusValue = PaymentStatus.from('PENDING'); this.incrementVersion(); this.record(intentEvent('PaymentAttemptCreated', this.tenantId, this.id, at)); }
  authorize(transaction: PaymentTransaction): void { this.assertStatus('PENDING'); this.assertAttempt(transaction); this.assertCapacity(transaction.amount); if (!transaction.authorizationCode) paymentInvariant('PAYMENT_AUTHORIZATION_REQUIRED', 'Authorization requires an authorization code'); this.addTransaction(transaction); this.statusValue = PaymentStatus.from('AUTHORIZED'); this.incrementVersion(); this.record(intentEvent('PaymentAuthorized', this.tenantId, this.id, transaction.recordedAt)); }
  capture(transaction: PaymentTransaction): void { if (this.statusValue.value !== 'AUTHORIZED' && this.statusValue.value !== 'PENDING') paymentInvariant('PAYMENT_TRANSITION_ILLEGAL', 'Capture requires a pending or authorized payment'); this.assertAttempt(transaction); this.assertCapacity(transaction.amount); this.addTransaction(transaction); this.statusValue = this.captured().compare(this.payable()) === 0 ? PaymentStatus.from('CAPTURED') : PaymentStatus.from('PENDING'); this.incrementVersion(); this.record(intentEvent('PaymentCaptured', this.tenantId, this.id, transaction.recordedAt)); }
  recordCash(transaction: PaymentTransaction): void { if (transaction.tender.value !== 'CASH') paymentInvariant('PAYMENT_TENDER_INVALID', 'Cash recording requires a cash tender'); this.capture(transaction); this.record(intentEvent('CashPaymentRecorded', this.tenantId, this.id, transaction.recordedAt)); }
  recordOffline(transaction: PaymentTransaction): void { this.assertStatus('PENDING'); if (transaction.tender.value !== 'OFFLINE') paymentInvariant('PAYMENT_TENDER_INVALID', 'Offline recording requires an offline tender'); this.assertAttempt(transaction); this.assertCapacity(transaction.amount); this.addTransaction(transaction); this.statusValue = PaymentStatus.from('OFFLINE_PENDING_RECONCILIATION'); this.incrementVersion(); this.record(intentEvent('OfflinePaymentRecorded', this.tenantId, this.id, transaction.recordedAt)); }
  fail(at: Instant): void { this.assertNonTerminal(); this.statusValue = PaymentStatus.from('FAILED'); this.incrementVersion(); this.record(intentEvent('PaymentFailed', this.tenantId, this.id, at)); }
  void(at: Instant): void { if (this.captured().isPositive()) paymentInvariant('PAYMENT_VOID_AFTER_CAPTURE', 'Captured payment cannot be voided'); this.assertNonTerminal(); this.statusValue = PaymentStatus.from('VOIDED'); this.incrementVersion(); this.record(intentEvent('PaymentVoided', this.tenantId, this.id, at)); }
  refund(refund: Refund, at: Instant): void { if (this.statusValue.value !== 'CAPTURED' && this.statusValue.value !== 'PARTIALLY_REFUNDED') paymentInvariant('PAYMENT_REFUND_TRANSITION_ILLEGAL', 'Refund requires captured payment'); this.assertCurrency(refund.amount); const remaining = this.captured().subtract(this.refunded()); if (refund.amount.compare(remaining) > 0) paymentInvariant('PAYMENT_REFUND_EXCEEDS_CAPTURED', 'Refund exceeds remaining captured balance'); if (this.refundsValue.some((value) => value.id === refund.id)) paymentInvariant('PAYMENT_REFUND_DUPLICATE', 'Refund already exists'); this.statusValue = PaymentStatus.from('REFUND_PENDING'); this.refundsValue.push(refund); this.statusValue = refund.amount.compare(remaining) === 0 ? PaymentStatus.from('REFUNDED') : PaymentStatus.from('PARTIALLY_REFUNDED'); this.incrementVersion(); this.record(intentEvent('RefundCreated', this.tenantId, this.id, at)); this.record(intentEvent('RefundCompleted', this.tenantId, this.id, at)); }
  settle(at: Instant): void { this.assertStatus('CAPTURED'); if (this.captured().compare(this.payable()) !== 0) paymentInvariant('PAYMENT_SETTLEMENT_AMOUNT_INVALID', 'Only fully captured payment can settle'); this.statusValue = PaymentStatus.from('SETTLED'); this.incrementVersion(); }
  issueReceipt(receipt: Receipt): void { if (this.receiptValue) paymentInvariant('PAYMENT_RECEIPT_EXISTS', 'Payment receipt already exists'); if (receipt.amount.compare(this.captured()) !== 0) paymentInvariant('PAYMENT_RECEIPT_AMOUNT_INVALID', 'Receipt must evidence captured amount'); this.receiptValue = receipt; this.incrementVersion(); this.record(intentEvent('ReceiptGenerated', this.tenantId, this.id, receipt.issuedAt)); }
  private addTransaction(transaction: PaymentTransaction): void { if (this.transactionsValue.some((value) => value.id === transaction.id)) paymentInvariant('PAYMENT_TRANSACTION_DUPLICATE', 'Payment transaction already exists'); this.transactionsValue.push(transaction); }
  private assertAttempt(transaction: PaymentTransaction): void { if (!this.attemptsValue.some((value) => value.id === transaction.attemptId)) paymentInvariant('PAYMENT_ATTEMPT_MISSING', 'Transaction must reference a payment attempt'); }
  private assertCapacity(amount: Money): void { this.assertCurrency(amount); if (this.captured().add(amount).compare(this.payable()) > 0) paymentInvariant('PAYMENT_CAPTURE_EXCEEDS_INTENT', 'Captured amount exceeds payment intent'); }
  private assertCurrency(amount: Money): void { if (amount.currency.code !== this.request.currency) paymentInvariant('PAYMENT_CURRENCY_MISMATCH', 'Payment currency does not match intent currency'); }
  private assertStatus(status: PaymentStatus['value']): void { if (this.statusValue.value !== status) paymentInvariant('PAYMENT_TRANSITION_ILLEGAL', `Payment transition requires ${status}`); }
  private assertNonTerminal(): void { if (['FAILED', 'VOIDED', 'CANCELLED', 'SETTLED', 'REFUNDED'].includes(this.statusValue.value)) paymentInvariant('PAYMENT_STATE_TERMINAL', 'Terminal payment cannot be modified'); }
}

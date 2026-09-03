import { DomainService, Money, type Instant } from '../shared-kernel';
import { PaymentIntent, Receipt } from './payment.aggregates';
import { paymentInvariant } from './payment.errors';
import type { ReceiptId } from './payment.types';
import { ReceiptNumber } from './payment.value-objects';

export class PaymentValidator extends DomainService { validate(intent: PaymentIntent): void { if (intent.captured().compare(intent.payable()) > 0) paymentInvariant('PAYMENT_CAPTURE_EXCEEDS_INTENT', 'Captured amount exceeds payment intent'); } }
export class TenderAllocator extends DomainService { total(amounts: readonly Money[], currency: string): Money { return amounts.reduce((total, amount) => total.add(amount), Money.zero(currency)); } }
export class CaptureValidator extends DomainService { validate(intent: PaymentIntent, amount: Money): void { if (intent.captured().add(amount).compare(intent.payable()) > 0) paymentInvariant('PAYMENT_CAPTURE_EXCEEDS_INTENT', 'Captured amount exceeds payment intent'); } }
export class RefundValidator extends DomainService { validate(intent: PaymentIntent, amount: Money): void { if (amount.compare(intent.captured().subtract(intent.refunded())) > 0) paymentInvariant('PAYMENT_REFUND_EXCEEDS_CAPTURED', 'Refund exceeds remaining captured balance'); } }
export class SettlementValidator extends DomainService { validate(intent: PaymentIntent): void { if (intent.captured().compare(intent.payable()) !== 0) paymentInvariant('PAYMENT_SETTLEMENT_AMOUNT_INVALID', 'Payment must be fully captured before settlement'); } }
export class ReceiptGenerator extends DomainService { generate(id: ReceiptId, number: ReceiptNumber, intent: PaymentIntent, at: Instant): Receipt { return new Receipt(id, number, intent.id, intent.captured(), at); } }

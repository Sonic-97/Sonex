import type { ActorId, AggregateVersion, CausationId, Command, CorrelationId, DeepReadonly, DomainEvent, Instant, Query, SchemaVersion, SupportedCurrencyCode, TenantId } from '../shared-kernel';
import type { ProductId } from '../catalog-domain';
import type { ResolvedPrice } from '../pricing-domain';
import type { PromiseDecision } from '../availability';
import type { ReservationId } from '../reservation';
import type { CheckoutId, OrderId } from './commerce.types';
import type { CheckoutExpiry, CheckoutToken, CustomerIntent, OrderChannel, OrderReference, OrderSource, OrderSourceValue } from './commerce.value-objects';

export type CommerceEventName = 'OrderCreated' | 'OrderValidated' | 'AvailabilityRequested' | 'ReservationAuthorized' | 'OrderConfirmed' | 'OrderCancelled' | 'CheckoutExpired';
export type CommerceEventPayload = Readonly<Record<string, string>> & { readonly tenantId: string; readonly orderId: string; readonly occurredAt: string };
export type CommerceDomainEvent = DomainEvent<CommerceEventName, CommerceEventPayload>;
export type CreateOrder = Command<'COMMERCE_CREATE_ORDER', { readonly orderId: OrderId; readonly checkoutId: CheckoutId; readonly productId: ProductId; readonly intent: CustomerIntent; readonly reference: OrderReference; readonly source: OrderSource; readonly channel: OrderChannel; readonly token: CheckoutToken; readonly expiry: CheckoutExpiry }>;
export type ValidateOrder = Command<'COMMERCE_VALIDATE_ORDER', { readonly orderId: OrderId; readonly price: ResolvedPrice }>;
export type RequestAvailability = Command<'COMMERCE_REQUEST_AVAILABILITY', { readonly orderId: OrderId }>;
export type AuthorizeReservation = Command<'COMMERCE_AUTHORIZE_RESERVATION', { readonly orderId: OrderId; readonly reservationId: ReservationId; readonly decision: PromiseDecision }>;
export type FinalizeOrder = Command<'COMMERCE_FINALIZE_ORDER', { readonly orderId: OrderId }>;
export type CancelOrder = Command<'COMMERCE_CANCEL_ORDER', { readonly orderId: OrderId; readonly reason: string }>;
export type ExpireCheckout = Command<'COMMERCE_EXPIRE_CHECKOUT', { readonly checkoutId: CheckoutId }>;
export type OrderStatusQuery = Query<'COMMERCE_ORDER_STATUS', { readonly orderId: OrderId }>;
export type OrderHistoryQuery = Query<'COMMERCE_ORDER_HISTORY', { readonly orderId: OrderId }>;
export type CheckoutStatusQuery = Query<'COMMERCE_CHECKOUT_STATUS', { readonly checkoutId: CheckoutId }>;
export type OrderSummaryQuery = Query<'COMMERCE_ORDER_SUMMARY', { readonly orderId: OrderId }>;
export interface OrderSnapshot { readonly orderId: OrderId; readonly checkoutId: CheckoutId; readonly productId: ProductId; readonly price?: ResolvedPrice; readonly reservationId?: ReservationId; readonly status: string; readonly version: number; }
export interface CommerceScope { readonly tenantId: TenantId; readonly occurredAt: Instant; }

/** Immutable Kitchen handoff produced only from a confirmed Commerce order. */
export type ConfirmedOrderLine = DeepReadonly<{
  readonly lineId: string;
  readonly productId: ProductId;
  readonly requestedQuantity: string;
  readonly requestedUnit: string;
}>;

export type ConfirmedOrderAuditMetadata = DeepReadonly<{
  readonly correlationId: CorrelationId;
  readonly causationId?: CausationId;
  readonly confirmedBy?: ActorId;
}>;

/**
 * Versioned, serializable public Commerce fact. Pricing rules, reservation lifecycle,
 * availability decisions, inventory, and payment state are deliberately absent.
 */
export type ConfirmedOrderSnapshot = DeepReadonly<{
  readonly contractVersion: SchemaVersion;
  readonly orderId: OrderId;
  readonly checkoutId: CheckoutId;
  readonly tenantId: TenantId;
  readonly orderVersion: AggregateVersion;
  readonly confirmedAt: Instant;
  readonly lines: readonly ConfirmedOrderLine[];
  readonly reservationReference: ReservationId;
  readonly source: OrderSourceValue;
  readonly channel: string;
  readonly audit: ConfirmedOrderAuditMetadata;
}>;

/** Exact immutable monetary fact used by Payment; amount is never a JavaScript number. */
export type MoneyAmountSnapshot = DeepReadonly<{
  readonly amount: string;
  readonly currency: SupportedCurrencyCode;
}>;

export type FinancialBreakdownLine = DeepReadonly<{
  readonly lineId: string;
  readonly amount: MoneyAmountSnapshot;
  readonly sourceReference: string;
}>;

export type PaymentRequestAuditMetadata = DeepReadonly<{
  readonly correlationId: CorrelationId;
  readonly causationId?: CausationId;
  readonly createdBy?: ActorId;
}>;

/**
 * Immutable, versioned financial handoff owned by Commerce. It contains settled
 * pricing facts only; it deliberately excludes pricing rules and payment execution.
 */
export type ConfirmedPaymentRequest = DeepReadonly<{
  readonly contractVersion: SchemaVersion;
  readonly paymentRequestId: string;
  readonly orderId: OrderId;
  readonly tenantId: TenantId;
  readonly orderVersion: AggregateVersion;
  readonly createdAt: Instant;
  readonly currency: SupportedCurrencyCode;
  readonly finalPayableAmount: MoneyAmountSnapshot;
  readonly pricingSnapshotVersion: number;
  readonly taxes: readonly FinancialBreakdownLine[];
  readonly serviceCharges: readonly FinancialBreakdownLine[];
  readonly discounts: readonly FinancialBreakdownLine[];
  readonly tip?: MoneyAmountSnapshot;
  readonly audit: PaymentRequestAuditMetadata;
}>;

import { correlationId, instant, schemaVersion, tenantId } from '../shared-kernel';
import type { ConfirmedPaymentRequest } from '../commerce';
import { PaymentIntent } from './payment.aggregates';
import { InMemoryPaymentIntentRepository } from './payment-intent.repository.adapter';
import { PaymentIntentSnapshotMapper } from './payment-intent.snapshot';
import { paymentIntentId } from './payment.types';

const now = instant('2026-07-30T00:00:00.000Z'); const tenant = tenantId('tenant-1');
const request = (): ConfirmedPaymentRequest => ({ contractVersion: schemaVersion(1), paymentRequestId: 'request-1', orderId: 'order-1' as ConfirmedPaymentRequest['orderId'], tenantId: tenant, orderVersion: 0 as ConfirmedPaymentRequest['orderVersion'], createdAt: now, currency: 'EGP', finalPayableAmount: { amount: '12.50', currency: 'EGP' }, pricingSnapshotVersion: 1, taxes: [], serviceCharges: [], discounts: [], audit: { correlationId: correlationId('correlation-1') } });
describe('PaymentIntent persistence reference', () => {
  it('round-trips a sealed snapshot without events', () => { const original = PaymentIntent.create(paymentIntentId('intent-1'), request(), now); const restored = PaymentIntent.rehydrate(original.toSnapshot()); expect(restored.id).toBe(original.id); expect(restored.version).toBe(original.version); expect(restored.pullDomainEvents()).toEqual([]); expect(restored.toSnapshot()).toEqual(original.toSnapshot()); });
  it('serializes exact money canonically and rejects corruption/future schemas', () => { const snapshot = PaymentIntent.create(paymentIntentId('intent-1'), request(), now).toSnapshot(); const mapper = new PaymentIntentSnapshotMapper(); const record = mapper.toRecord(snapshot); expect(record.serializedSnapshot).toContain('12.50'); expect(() => mapper.toSnapshot({ ...record, serializedSnapshot: record.serializedSnapshot.replace('12.50', '99.99') })).toThrow('PAYMENT_SNAPSHOT_INTEGRITY_FAILED'); const future = JSON.parse(record.serializedSnapshot); future.snapshotSchemaVersion = 2; expect(() => mapper.toSnapshot({ ...record, serializedSnapshot: JSON.stringify(future) })).toThrow('PAYMENT_SNAPSHOT_FUTURE_VERSION'); });
  it('enforces tenant isolation and optimistic concurrency', async () => { const repository = new InMemoryPaymentIntentRepository(); const value = PaymentIntent.create(paymentIntentId('intent-1'), request(), now); expect((await repository.save(value)).ok).toBe(true); expect(await repository.load(value.id, tenantId('tenant-2'))).toBeUndefined(); const result = await repository.save(value, 1); expect(result.ok).toBe(false); });
});

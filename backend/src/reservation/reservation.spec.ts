import { instant, tenantId } from '../shared-kernel';
import { availabilitySnapshotId, AvailabilityReason, ReservableQuantity, type PromiseDecision } from '../availability';
import { inventoryItemId, storageLocationId } from '../inventory-core';
import { Reservation, ReservationRequest } from './reservation.aggregates';
import { ReservationDomainError } from './reservation.errors';
import { ReservationAuthorizer, ReservationConsistencyValidator, ReservationExpirationEvaluator } from './reservation.services';
import { reservationAllocationId, reservationId, reservationRequestId } from './reservation.types';
import { ReservationExpiry, ReservationQuantity, ReservationReason, ReservationReference, ReservationToken } from './reservation.value-objects';

const now = instant('2026-07-30T00:00:00.000Z');
const later = instant('2026-07-30T01:00:00.000Z');
const decision = (canPromise = true): PromiseDecision => Object.freeze({ canPromise, reason: AvailabilityReason.from(canPromise ? 'AVAILABLE' : 'INSUFFICIENT_CAPACITY'), capacity: ReservableQuantity.from('10', 'G') });
const create = (expiry = later) => {
  const request = new ReservationRequest(reservationRequestId('request-1'), inventoryItemId('beans'), storageLocationId('main-store'), ReservationQuantity.from('5', 'G'), ReservationReference.from('order-1'), ReservationToken.from('token-1'));
  return Reservation.create(tenantId('tenant-1'), reservationId('reservation-1'), request, ReservationExpiry.at(expiry), now);
};

describe('Reservation Domain', () => {
  test('moves through the authorized, confirmed, released lifecycle deterministically', () => {
    const reservation = create();
    const authorization = new ReservationAuthorizer().authorize(decision(), reservationAllocationId('allocation-1'), now);
    reservation.authorize(authorization, availabilitySnapshotId('availability-1'));
    reservation.confirm(now);
    reservation.release(ReservationReason.from('Fulfilled'), now);
    expect(reservation.status.value).toBe('RELEASED');
    expect(reservation.request.quantity.value).toBe('5');
    expect(reservation.pullDomainEvents().map((event) => event.name)).toEqual(['ReservationCreated', 'ReservationAuthorized', 'ReservationConfirmed', 'ReservationReleased']);
  });

  test('requires one approved availability decision that covers the immutable requested quantity', () => {
    const reservation = create();
    expect(() => reservation.authorize(new ReservationAuthorizer().authorize(decision(false), reservationAllocationId('allocation-1'), now), availabilitySnapshotId('availability-1'))).toThrow(ReservationDomainError);
    const insufficient: PromiseDecision = Object.freeze({ canPromise: true, reason: AvailabilityReason.from('AVAILABLE'), capacity: ReservableQuantity.from('4', 'G') });
    expect(() => reservation.authorize(new ReservationAuthorizer().authorize(insufficient, reservationAllocationId('allocation-1'), now), availabilitySnapshotId('availability-1'))).toThrow(ReservationDomainError);
  });

  test('expires an authorized reservation and forbids confirmation or reactivation', () => {
    const reservation = create(instant('2026-07-30T00:30:00.000Z'));
    reservation.authorize(new ReservationAuthorizer().authorize(decision(), reservationAllocationId('allocation-1'), now), availabilitySnapshotId('availability-1'));
    reservation.expire(instant('2026-07-30T00:30:00.000Z'));
    expect(reservation.status.value).toBe('EXPIRED');
    expect(new ReservationExpirationEvaluator().isExpired(reservation, later)).toBe(true);
    expect(() => reservation.confirm(later)).toThrow(ReservationDomainError);
    expect(() => reservation.cancel(ReservationReason.from('Late cancellation'), later)).toThrow(ReservationDomainError);
  });

  test('supports cancellation before completion and rejects illegal state transitions', () => {
    const reservation = create();
    reservation.cancel(ReservationReason.from('Customer cancelled'), now);
    expect(reservation.status.value).toBe('CANCELLED');
    expect(() => reservation.authorize(new ReservationAuthorizer().authorize(decision(), reservationAllocationId('allocation-1'), now), availabilitySnapshotId('availability-1'))).toThrow(ReservationDomainError);
    expect(() => reservation.release(ReservationReason.from('Invalid'), now)).toThrow(ReservationDomainError);
  });

  test('extends only an active authorized reservation and validates lifecycle consistency', () => {
    const reservation = create();
    reservation.authorize(new ReservationAuthorizer().authorize(decision(), reservationAllocationId('allocation-1'), now), availabilitySnapshotId('availability-1'));
    reservation.extend(ReservationExpiry.at(instant('2026-07-30T02:00:00.000Z')), now);
    expect(reservation.expiry.at).toBe('2026-07-30T02:00:00.000Z');
    expect(new ReservationConsistencyValidator().validate(reservation)).toBeUndefined();
    expect(() => reservation.extend(ReservationExpiry.at(later), now)).toThrow(ReservationDomainError);
  });
});

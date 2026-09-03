import { DomainService, type Instant } from '../shared-kernel';
import type { PromiseDecision } from '../availability';
import { Reservation } from './reservation.aggregates';
import type { ReservationAuthorization } from './reservation.contracts';
import { reservationInvariant } from './reservation.errors';
import type { ReservationAllocationId } from './reservation.types';
import type { ReservationReason } from './reservation.value-objects';

export class ReservationAuthorizer extends DomainService { authorize(decision: PromiseDecision, allocationId: ReservationAllocationId, at: Instant): ReservationAuthorization { if (!decision.canPromise) reservationInvariant('RESERVATION_NOT_AUTHORIZED', 'Availability decision cannot authorize this reservation'); return Object.freeze({ decision, allocationId, authorizedAt: at }); } }
export class ReservationLifecycleManager extends DomainService { confirm(reservation: Reservation, at: Instant): void { reservation.confirm(at); } cancel(reservation: Reservation, reason: ReservationReason, at: Instant): void { reservation.cancel(reason, at); } }
export class ReservationExpirationEvaluator extends DomainService { isExpired(reservation: Reservation, at: Instant): boolean { return reservation.expiry.isExpired(at); } }
export class ReservationConsistencyValidator extends DomainService { validate(reservation: Reservation): void { if (reservation.status.value === 'AUTHORIZED' || reservation.status.value === 'CONFIRMED' || reservation.status.value === 'RELEASED') { if (!reservation.allocation) reservationInvariant('RESERVATION_ALLOCATION_MISSING', 'Authorized reservation must contain one availability allocation'); } } }

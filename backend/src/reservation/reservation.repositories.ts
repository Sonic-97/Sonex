import type { AggregateRepository } from '../shared-kernel';
import type { Reservation } from './reservation.aggregates';
import type { ReservationId } from './reservation.types';
export interface ReservationRepository extends AggregateRepository<Reservation, ReservationId> {}

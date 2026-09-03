import { DomainError } from '../shared-kernel';
export class ReservationDomainError extends DomainError { constructor(code: string, message: string, details?: Readonly<Record<string, unknown>>) { super(code, message, details); } }
export const reservationInvariant = (code: string, message: string, details?: Readonly<Record<string, unknown>>): never => { throw new ReservationDomainError(code, message, details); };

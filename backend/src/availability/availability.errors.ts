import { DomainError } from '../shared-kernel';
export class AvailabilityDomainError extends DomainError { constructor(code: string, message: string, details?: Readonly<Record<string, unknown>>) { super(code, message, details); } }
export const availabilityInvariant = (code: string, message: string, details?: Readonly<Record<string, unknown>>): never => { throw new AvailabilityDomainError(code, message, details); };

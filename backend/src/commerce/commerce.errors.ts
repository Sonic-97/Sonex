import { DomainError } from '../shared-kernel';
export class CommerceDomainError extends DomainError { constructor(code: string, message: string, details?: Readonly<Record<string, unknown>>) { super(code, message, details); } }
export const commerceInvariant = (code: string, message: string, details?: Readonly<Record<string, unknown>>): never => { throw new CommerceDomainError(code, message, details); };

import { DomainError } from '../shared-kernel';
export class CatalogDomainError extends DomainError { constructor(code: string, message: string, details?: Readonly<Record<string, unknown>>) { super(code, message, details); } }
export const catalogInvariant = (code: string, message: string, details?: Readonly<Record<string, unknown>>): never => { throw new CatalogDomainError(code, message, details); };

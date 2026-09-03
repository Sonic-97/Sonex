import { DomainError } from '../shared-kernel';

export class InventoryLedgerDomainError extends DomainError {
  constructor(code: string, message: string, details?: Readonly<Record<string, unknown>>) { super(code, message, details); }
}
export const ledgerInvariant = (code: string, message: string, details?: Readonly<Record<string, unknown>>): never => { throw new InventoryLedgerDomainError(code, message, details); };

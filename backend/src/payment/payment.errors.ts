import { DomainError } from '../shared-kernel';

export class PaymentDomainError extends DomainError {
  constructor(code: string, message: string, details?: Readonly<Record<string, unknown>>) {
    super(code, message, details);
  }
}

export const paymentInvariant = (code: string, message: string, details?: Readonly<Record<string, unknown>>): never => {
  throw new PaymentDomainError(code, message, details);
};

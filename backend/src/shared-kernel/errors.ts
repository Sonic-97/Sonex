export type ErrorDetails = Readonly<Record<string, unknown>>;
const ERROR_CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}$/;
export abstract class SonexError extends Error {
  protected constructor(public readonly code: string, message: string, public readonly details?: ErrorDetails, public readonly retryable = false) {
    super(message);
    if (!ERROR_CODE.test(code)) throw new Error(`Invalid Sonex error code: ${code}`);
    this.name = new.target.name;
  }
}
export class DomainError extends SonexError { constructor(code: string, message: string, details?: ErrorDetails) { super(code, message, details); } }
export class ApplicationError extends SonexError { constructor(code: string, message: string, details?: ErrorDetails, retryable = false) { super(code, message, details, retryable); } }
export class AuthorizationError extends SonexError { constructor(code: string, message: string, details?: ErrorDetails) { super(code, message, details); } }
export class ConcurrencyError extends SonexError { constructor(code: string, message: string, details?: ErrorDetails) { super(code, message, details, true); } }
export class ContractError extends SonexError { constructor(code: string, message: string, details?: ErrorDetails) { super(code, message, details); } }
export class InfrastructureError extends SonexError { constructor(code: string, message: string, details?: ErrorDetails, retryable = true) { super(code, message, details, retryable); } }
export class UnknownOutcomeError extends SonexError { constructor(code: string, message: string, details?: ErrorDetails) { super(code, message, details, true); } }
export class RecoveryRequiredError extends SonexError { constructor(code: string, message: string, details?: ErrorDetails) { super(code, message, details); } }

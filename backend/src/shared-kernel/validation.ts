import type { DeepReadonly } from './immutable';
export interface ValidationIssue { readonly code: string; readonly path: string; readonly message: string; }
export class ValidationResult {
  private constructor(public readonly issues: readonly DeepReadonly<ValidationIssue>[]) { Object.freeze(this.issues); Object.freeze(this); }
  static valid(): ValidationResult { return new ValidationResult([]); }
  static invalid(issues: readonly ValidationIssue[]): ValidationResult { return new ValidationResult([...issues].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code))); }
  get valid(): boolean { return this.issues.length === 0; }
}

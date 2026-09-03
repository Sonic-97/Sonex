import { ApplicationError } from '../shared-kernel';

export class PricingApplicationError extends ApplicationError {
  constructor(code: string) { super(code, 'Pricing request could not be completed'); }
}

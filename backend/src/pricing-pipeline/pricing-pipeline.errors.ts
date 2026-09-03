import { ApplicationError } from '../shared-kernel';

export class PricingPipelineValidationError extends ApplicationError {
  constructor() { super('PRICING_PIPELINE_CONTEXT_INVALID', 'Pricing execution context is invalid'); }
}

export class PricingPipelineExecutionError extends ApplicationError {
  constructor() { super('PRICING_PIPELINE_EXECUTION_FAILED', 'Pricing execution could not be completed'); }
}

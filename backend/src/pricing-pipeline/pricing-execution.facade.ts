import { Injectable } from '@nestjs/common';
import { PricingApplicationService } from '../pricing-application';
import { SonexError, failure, success } from '../shared-kernel';
import { PricingPipelineExecutionError, PricingPipelineValidationError } from './pricing-pipeline.errors';
import { PricingExecutionResult, PricingPipelineRequest } from './pricing-pipeline.types';
/** Sole executable pricing path: validates scope, delegates once, returns a typed result. */
@Injectable()
export class PricingExecutionFacade {
  constructor(private readonly pricingApplicationService: PricingApplicationService) {}
  execute(request: PricingPipelineRequest): PricingExecutionResult { try { this.validate(request); return success({ response: this.pricingApplicationService.execute(request.pricing) }); } catch (error) { if (error instanceof SonexError) return failure({ code: error.code }); return failure({ code: new PricingPipelineExecutionError().code }); } }
  private validate(request: PricingPipelineRequest): void { if (request.context.operational.tenantId !== request.pricing.pricing.context.scope.tenantId) throw new PricingPipelineValidationError(); }
}

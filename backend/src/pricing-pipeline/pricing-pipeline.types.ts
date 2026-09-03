import type { PricingApplicationRequest, PricingApplicationResponse } from '../pricing-application';
import type { OperationalContext, Result } from '../shared-kernel';
export interface PricingExecutionContext { readonly operational: OperationalContext; }
export interface PricingPipelineRequest { readonly context: PricingExecutionContext; readonly pricing: PricingApplicationRequest; }
export interface PricingPipelineResponse { readonly response: PricingApplicationResponse; }
export interface PricingPipelineError { readonly code: string; }
export type PricingExecutionResult = Result<PricingPipelineResponse, PricingPipelineError>;

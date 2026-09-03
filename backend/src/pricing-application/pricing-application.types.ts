import type { PricingRequest, ResolvedPrice } from '../pricing-domain';
export interface PricingApplicationRequest { readonly pricing: PricingRequest; }
export interface PricingApplicationResponse { readonly result: ResolvedPrice; }

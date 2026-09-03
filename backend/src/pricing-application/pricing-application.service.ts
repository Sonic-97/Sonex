import { Injectable } from '@nestjs/common';
import { PricingService } from '../pricing-domain';
import { SonexError } from '../shared-kernel';
import { PricingApplicationError } from './pricing-application.errors';
import { PricingApplicationRequest, PricingApplicationResponse } from './pricing-application.types';
import { PricingRequestMapper } from './pricing-request.mapper';
import { PricingResponseMapper } from './pricing-response.mapper';
/** Application orchestration only; no price calculation lives here. */
@Injectable()
export class PricingApplicationService {
  constructor(private readonly requestMapper: PricingRequestMapper, private readonly pricingService: PricingService, private readonly responseMapper: PricingResponseMapper) {}
  execute(request: PricingApplicationRequest): PricingApplicationResponse { try { return this.responseMapper.fromDomain(this.pricingService.price(this.requestMapper.toDomain(request))); } catch (error) { if (error instanceof SonexError) throw new PricingApplicationError(error.code); throw error; } }
}

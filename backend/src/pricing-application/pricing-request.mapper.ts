import { Injectable } from '@nestjs/common';
import { PricingRequest } from '../pricing-domain';
import { PricingApplicationRequest } from './pricing-application.types';
/** Maps only the application boundary. Price selection and calculation remain in PricingEngine. */
@Injectable()
export class PricingRequestMapper { toDomain(request: PricingApplicationRequest): PricingRequest { return request.pricing; } }

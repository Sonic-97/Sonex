import { Injectable } from '@nestjs/common';
import type { ResolvedPrice } from '../pricing-domain';
import type { PricingApplicationResponse } from './pricing-application.types';
@Injectable()
export class PricingResponseMapper { fromDomain(result: ResolvedPrice): PricingApplicationResponse { return Object.freeze({ result }); } }

import { Module } from '@nestjs/common';
import { PricingApplicationModule } from '../pricing-application';
import { PricingExecutionFacade } from './pricing-execution.facade';

@Module({ imports: [PricingApplicationModule], providers: [PricingExecutionFacade], exports: [PricingExecutionFacade] })
export class PricingPipelineModule {}

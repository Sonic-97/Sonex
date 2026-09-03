import { Test } from '@nestjs/testing';
import { PricingExecutionFacade } from './pricing-execution.facade';
import { PricingPipelineModule } from './pricing-pipeline.module';

describe('PricingPipelineModule', () => {
  it('wires the execution facade through dependency injection', async () => {
    const module = await Test.createTestingModule({ imports: [PricingPipelineModule] }).compile();
    expect(module.get(PricingExecutionFacade)).toBeInstanceOf(PricingExecutionFacade);
  });
});

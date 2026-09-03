import { Test } from '@nestjs/testing';
import { PricingApplicationModule } from './pricing-application.module';
import { PricingApplicationService } from './pricing-application.service';

describe('PricingApplicationModule', () => {
  it('wires the application service through dependency injection', async () => {
    const module = await Test.createTestingModule({ imports: [PricingApplicationModule] }).compile();
    expect(module.get(PricingApplicationService)).toBeInstanceOf(PricingApplicationService);
  });
});

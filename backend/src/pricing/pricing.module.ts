import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingController } from './pricing.controller';
import { PricingRuleService } from './pricing-rule.service';
import { RuleEngine } from './rule-engine.service';

@Module({
  imports: [PrismaModule],
  controllers: [PricingController],
  providers: [PricingRuleService, RuleEngine],
  exports: [PricingRuleService, RuleEngine],
})
export class PricingModule {}

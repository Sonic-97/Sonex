import { Module } from '@nestjs/common';
import { CustomerUnderstandingController } from './customer-understanding.controller';
import { CustomerUnderstandingService } from './customer-understanding.service';
import { ClarificationPolicyService } from './clarification-policy.service';
import { EgyptianArabicUnderstandingService } from './egyptian-arabic-understanding.service';
import { NeedProductMapperService } from './need-product-mapper.service';
import { ProductUnderstandingTagService } from './product-understanding-tag.service';

@Module({
  controllers: [CustomerUnderstandingController],
  providers: [
    CustomerUnderstandingService,
    EgyptianArabicUnderstandingService,
    ClarificationPolicyService,
    NeedProductMapperService,
    ProductUnderstandingTagService,
  ],
  exports: [CustomerUnderstandingService, EgyptianArabicUnderstandingService, NeedProductMapperService],
})
export class CustomerUnderstandingModule {}

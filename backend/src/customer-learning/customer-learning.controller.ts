import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { CustomerLearningService } from './customer-learning.service';
import { cafeId } from '../auth/decorators/cafe-id.decorator';

@Controller('customer-learning')
export class CustomerLearningController {
  constructor(private readonly learningService: CustomerLearningService) {}

  @Get('patterns')
  async getActivePatterns(@cafeId() cafeId?: string) {
    return this.learningService.getActivePatterns(cafeId!);
  }

  @Get('patterns/:customerId')
  async getCustomerPattern(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @cafeId() cafeId?: string,
  ) {
    return this.learningService.getCustomerPattern(cafeId!, customerId);
  }
}

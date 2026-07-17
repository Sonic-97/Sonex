import { Test, TestingModule } from '@nestjs/testing';
import { OrderBuilderService } from './order-builder.service';

describe('OrderBuilderService', () => {
  let service: OrderBuilderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrderBuilderService],
    }).compile();

    service = module.get<OrderBuilderService>(OrderBuilderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});





import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ProductResolutionApplicationService } from './application/product-resolution.application.service';
import { ProductResolutionModule } from './product-resolution.module';

describe('ProductResolutionModule', () => {
  it('wires the application service with the Prisma adapter through dependency injection', async () => {
    const module = await Test.createTestingModule({ imports: [ProductResolutionModule] })
      .overrideProvider(PrismaService)
      .useValue({ product: { findFirst: async () => null } })
      .compile();
    expect(module.get(ProductResolutionApplicationService)).toBeInstanceOf(ProductResolutionApplicationService);
    await module.close();
  });
});

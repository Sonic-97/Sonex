import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductUnderstandingTagService } from './product-understanding-tag.service';

describe('ProductUnderstandingTagService', () => {
  const prisma: any = {
    product: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  };
  const audit: any = { log: jest.fn() };
  const service = new ProductUnderstandingTagService(prisma, audit);

  beforeEach(() => jest.clearAllMocks());

  it('accepts only the approved vocabulary', () => {
    expect(service.validate(['COLD', 'LOW_SUGAR', 'COLD'])).toEqual(['COLD', 'LOW_SUGAR']);
  });

  it('rejects unsupported claims', () => {
    expect(() => service.validate(['CURES_ANXIETY'])).toThrow(BadRequestException);
  });

  it('drops malformed stored values safely', () => {
    expect(service.parse(['HOT', 'NOT_REAL', 1])).toEqual(['HOT']);
  });

  it('updates only a product in the authenticated cafe and audits it', async () => {
    prisma.product.findFirst.mockResolvedValueOnce({ id: 'p1', name: 'قهوة', understandingTags: ['HOT'] });
    prisma.product.update.mockResolvedValueOnce({ id: 'p1', name: 'قهوة', understandingTags: ['HOT', 'CAFFEINATED'] });
    const result = await service.replace('cafe-a', 'p1', ['HOT', 'CAFFEINATED'], { id: 'owner-1', role: 'OWNER' });
    expect(prisma.product.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1', cafeId: 'cafe-a' } }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ cafeId: 'cafe-a', action: 'CONFIG_CHANGE', entityId: 'p1' }));
    expect(result.understandingTags).toEqual(['HOT', 'CAFFEINATED']);
  });

  it('rejects a product from another cafe', async () => {
    prisma.product.findFirst.mockResolvedValueOnce(null);
    await expect(service.replace('cafe-b', 'p1', ['HOT'], { id: 'owner-2' })).rejects.toThrow(NotFoundException);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});

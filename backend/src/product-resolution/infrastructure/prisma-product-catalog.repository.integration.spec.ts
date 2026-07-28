import { PrismaService } from '../../prisma/prisma.service';
import { domainId, tenantId } from '../../shared-kernel';
import { PrismaProductCatalogRepository } from './prisma-product-catalog.repository';

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration('PrismaProductCatalogRepository integration', () => {
  const prisma = new PrismaService();
  const repository = new PrismaProductCatalogRepository(prisma);
  const suffix = `product-resolution-${Date.now()}`;
  let cafeId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const cafe = await prisma.cafe.create({ data: { name: suffix, phone: `+201${Date.now()}`, ownerCode: suffix, ownerPassword: 'test' } });
    cafeId = cafe.id;
    const product = await prisma.product.create({ data: { cafeId, name: 'Latte', category: 'coffee', price: '50.00', cost: '20.00', code: 'LATTE-1' } });
    await prisma.productSize.create({ data: { cafeId, productId: product.id, name: 'Large', priceAdjust: '10.00' } });
    await prisma.productOption.create({ data: { cafeId, productId: product.id, name: 'Milk', choices: [{ id: 'oat', label: 'Oat', priceAdjust: 5 }] } });
  });

  afterAll(async () => {
    if (cafeId) await prisma.cafe.delete({ where: { id: cafeId } });
    await prisma.$disconnect();
  });

  it('loads a decimal-preserving, scoped catalog record', async () => {
    const product = await prisma.product.findFirstOrThrow({ where: { cafeId } });
    const result = await repository.findById({ tenantId: tenantId(cafeId), cafeId }, domainId('ProductId', product.id));
    expect(result).toMatchObject({ id: product.id, price: '50.00', sizes: [{ name: 'Large', priceAdjustment: '10.00' }] });
  });
});

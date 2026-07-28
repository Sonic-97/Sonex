import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = __dirname;
const files = [
  join(root, 'product-resolution.service.ts'),
  join(root, 'application', 'product-resolution.application.service.ts'),
  join(root, 'application', 'product-catalog.repository.ts'),
  join(root, 'application', 'product-catalog-snapshot.mapper.ts'),
];

describe('Product Resolution boundaries', () => {
  it('contains no forbidden domain dependencies', () => {
    const forbiddenImport = /^import .*?(?:@prisma\/client|pricing|inventory|recipe|orders|payment|kitchen|recommendations|runtime|controller|http).*?;$/im;
    for (const file of files) expect(readFileSync(file, 'utf8')).not.toMatch(forbiddenImport);
  });

  it('limits PrismaService access to the infrastructure adapter', () => {
    const adapter = readFileSync(join(root, 'infrastructure', 'prisma-product-catalog.repository.ts'), 'utf8');
    expect(adapter).toContain('PrismaService');
  });
});

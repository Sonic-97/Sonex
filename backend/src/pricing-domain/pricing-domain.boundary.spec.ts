import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Pricing Domain boundaries', () => {
  it('imports only Shared Kernel, Catalog ProductId contracts, and local Pricing Domain files', () => {
    const root = __dirname;
    const files = ['pricing.service.ts', 'pricing.types.ts', 'pricing.value-objects.ts', 'pricing.math.ts', 'pricing.errors.ts'];
    const forbidden = /^import .*?(?:product-resolution|@prisma\/client|@nestjs|http|controller|inventory|orders|payments|kitchen|recommendations|runtime|\.\.\/pricing\/).*?;$/im;
    for (const file of files) expect(readFileSync(join(root, file), 'utf8')).not.toMatch(forbidden);
  });
});

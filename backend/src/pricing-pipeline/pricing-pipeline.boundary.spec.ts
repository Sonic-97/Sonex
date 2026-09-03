import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Pricing Pipeline boundaries', () => {
  it('depends only on the pricing application/domain, product contracts, Shared Kernel, and NestJS', () => {
    const root = __dirname;
    const files = ['pricing-execution.facade.ts', 'pricing-pipeline.errors.ts', 'pricing-pipeline.module.ts', 'pricing-pipeline.types.ts'];
    const forbidden = /^import .*?(?:@prisma\/client|inventory|orders|payments|kitchen|recommendations|runtime|controller|http|repository).*?;$/im;
    for (const file of files) expect(readFileSync(join(root, file), 'utf8')).not.toMatch(forbidden);
  });
});

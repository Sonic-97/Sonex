import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Pricing Application boundaries', () => {
  it('uses only NestJS, Shared Kernel, Pricing Domain, Product Resolution contracts, and local files', () => {
    const root = __dirname;
    const files = ['pricing-application.service.ts', 'pricing-request.mapper.ts', 'pricing-response.mapper.ts', 'pricing-application.errors.ts', 'pricing-application.module.ts', 'pricing-application.types.ts'];
    const forbidden = /^import .*?(?:@prisma\/client|inventory|orders|payments|kitchen|recommendations|runtime|controller|http|repository).*?;$/im;
    for (const file of files) expect(readFileSync(join(root, file), 'utf8')).not.toMatch(forbidden);
  });
});

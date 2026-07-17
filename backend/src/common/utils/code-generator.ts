import { PrismaClient } from '@prisma/client';

type EntityModel = 'inventory' | 'product' | 'productCategory';

const PREFIX_MAP: Record<EntityModel, string> = {
  inventory: 'ING',
  product: 'PROD',
  productCategory: 'CAT',
};

export async function generateEntityCode(
  prisma: PrismaClient,
  cafeId: string,
  model: EntityModel,
): Promise<string> {
  const prefix = PREFIX_MAP[model];
  const codePattern = `${prefix}-%`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await (prisma as any)[model].findFirst({
    where: {
      cafeId,
      code: { startsWith: `${prefix}-` },
    },
    orderBy: { code: 'desc' },
    select: { code: true },
  });

  let nextNumber = 1;
  if (result?.code) {
    const parts = result.code.split('-');
    const num = parseInt(parts[1], 10);
    if (!isNaN(num)) {
      nextNumber = num + 1;
    }
  }

  const padded = String(nextNumber).padStart(3, '0');
  return `${prefix}-${padded}`;
}

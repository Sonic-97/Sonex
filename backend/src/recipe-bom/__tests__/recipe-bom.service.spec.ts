import { RecipeBOMService } from '../application/recipe-bom.service';
import { IRecipeBOMRepository } from '../domain/repositories/recipe-bom.repository.interface';
import { RecipeBOM } from '../domain/recipe-bom.entity';
import { PrismaService } from '../../prisma/prisma.service';

describe('RecipeBOMService', () => {
  let service: RecipeBOMService;
  let mockRepo: jest.Mocked<IRecipeBOMRepository>;
  let mockPrisma: any;

  const bomCoffee = new RecipeBOM({
    id: 'bom_1',
    productId: 'prod_latte',
    inventoryId: 'inv_coffee_beans',
    quantity: 0.02, // 20g
    unit: 'kg',
  });

  const bomMilk = new RecipeBOM({
    id: 'bom_2',
    productId: 'prod_latte',
    inventoryId: 'inv_fresh_milk',
    quantity: 0.2, // 200ml
    unit: 'l',
  });

  beforeEach(() => {
    mockRepo = {
      findByProductId: jest.fn().mockResolvedValue([bomCoffee, bomMilk]),
      save: jest.fn().mockImplementation((bom) => Promise.resolve(bom)),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      inventory: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === 'inv_coffee_beans') {
            return Promise.resolve({ id: 'inv_coffee_beans', itemName: 'Coffee Beans', costPerUnit: 15 });
          }
          if (where.id === 'inv_fresh_milk') {
            return Promise.resolve({ id: 'inv_fresh_milk', itemName: 'Fresh Milk', costPerUnit: 2 });
          }
          return Promise.resolve(null);
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      inventoryConsumption: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    service = new RecipeBOMService(mockRepo, mockPrisma as any);
  });

  it('should set product recipe BOM item', async () => {
    const res = await service.setProductRecipeBOM('prod_latte', 'inv_sugar', 0.01, 'kg');
    expect(res.isSuccess).toBe(true);
    expect(res.value.productId).toBe('prod_latte');
    expect(res.value.inventoryId).toBe('inv_sugar');
  });

  it('should process order recipe deductions for 2 Lattes', async () => {
    const orderItems = [{ productId: 'prod_latte', productName: 'Caffe Latte', quantity: 2 }];

    const res = await service.processOrderRecipeDeductions('cafe_1', 'branch_1', 'ord_100', orderItems);

    expect(res.isSuccess).toBe(true);
    expect(res.value.length).toBe(2);
    expect(res.value[0].deductedQuantity).toBe(0.04); // 0.02 * 2
    expect(res.value[1].deductedQuantity).toBe(0.4); // 0.2 * 2
    expect(mockPrisma.inventoryConsumption.create).toHaveBeenCalledTimes(2);
  });
});

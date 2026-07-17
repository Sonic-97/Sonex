import { Test, TestingModule } from '@nestjs/testing';
import { ContextBuilderService } from './context-builder.service';
import { PrismaService } from '../prisma/prisma.service';

const mockCafe = {
  id: 'cafe-1',
  name: 'Test Cafe',
  category: 'cafe',
  timezone: 'Africa/Cairo',
  active: true,
  configuration: {
    personality: 'cheerful',
    language: 'ar-EG',
    greetingStyle: 'casual',
    deliveryAvailable: true,
    pickupAvailable: true,
    promotionEnabled: true,
  },
};

const mockCustomer = {
  id: 'cust-1',
  name: 'Ahmed',
  preferredLanguage: 'ar-EG',
  preferredProducts: ['Cappuccino', 'Latte'],
  savedAddresses: ['12 شارع النيل'],
  totalOrders: 15,
  totalSpent: 450.00,
};

const mockProducts = [
  { id: 'prod-1', name: 'Cappuccino' },
  { id: 'prod-2', name: 'Latte' },
  { id: 'prod-3', name: 'Croissant' },
  { id: 'prod-4', name: 'Muffin' },
];

const mockFullProducts = [
  {
    id: 'prod-1', name: 'Cappuccino', category: 'coffee', active: true,
    variants: [{ name: 'Small', type: 'size', priceAdjust: 0 }, { name: 'Large', type: 'size', priceAdjust: 1500 }],
    options: [
      { id: 'opt-1', name: 'Sugar Level', required: true, choices: [{ label: 'No Sugar' }, { label: 'Medium' }, { label: 'Extra' }], sortOrder: 0 },
      { id: 'opt-2', name: 'Add Shot', required: false, choices: [{ label: 'Extra Shot' }], sortOrder: 1 },
    ],
  },
  {
    id: 'prod-2', name: 'Latte', category: 'coffee', active: true,
    variants: [{ name: 'Small', type: 'size', priceAdjust: 0 }],
    options: [],
  },
];

const mockRecentOrders = [
  {
    createdAt: new Date('2026-07-15'),
    total: 45.00,
    items: [{ product: { name: 'Cappuccino' }, quantity: 2 }],
  },
];

const mockActiveOrder = {
  orderType: 'DELIVERY',
  items: [
    {
      quantity: 1,
      selectedOptions: [{ optionId: 'opt-1', choiceLabel: 'Medium' }],
      unitPrice: 35.00,
      product: { name: 'Cappuccino' },
    },
  ],
};

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  const mockPrisma: any = {
    cafe: { findUnique: jest.fn() },
    customer: { findUnique: jest.fn() },
    order: { findMany: jest.fn() },
    product: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    inCafeOrder: { findFirst: jest.fn() },
  };

  Object.assign(mockPrisma, overrides);
  return mockPrisma;
}

describe('ContextBuilderService', () => {
  let service: ContextBuilderService;
  let prisma: ReturnType<typeof createMockPrisma>;

  async function buildService(mockPrisma: any) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextBuilderService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    return module.get<ContextBuilderService>(ContextBuilderService);
  }

  describe('Known customer with matched products', () => {
    beforeEach(async () => {
      prisma = createMockPrisma();
      prisma.cafe.findUnique.mockResolvedValue(mockCafe);
      prisma.customer.findUnique.mockResolvedValue(mockCustomer);
      prisma.order.findMany.mockResolvedValue(mockRecentOrders);
      prisma.product.findMany
        .mockResolvedValueOnce(mockProducts)   // first call: names lookup
        .mockResolvedValueOnce(mockFullProducts); // second call: full details
      prisma.inCafeOrder.findFirst.mockResolvedValue(mockActiveOrder);
      service = await buildService(prisma);
    });

    it('builds complete CommerceContext with all sections', async () => {
      const result = await service.build({
        cafeId: 'cafe-1',
        customerId: 'cust-1',
        message: 'I want a Cappuccino and a Latte',
      });

      expect(result.business.id).toBe('cafe-1');
      expect(result.business.businessType).toBe('cafe');
      expect(result.business.workingNow).toBe(true);
      expect(result.business.deliveryAvailable).toBe(true);
      expect(result.business.pickupAvailable).toBe(true);
      expect(result.business.promotionEnabled).toBe(true);
      expect(result.business.personality).toBe('cheerful');

      expect(result.customer).toBeDefined();
      expect(result.customer!.firstName).toBe('Ahmed');
      expect(result.customer!.favoriteProducts).toEqual(['Cappuccino', 'Latte']);
      expect(result.customer!.recentOrders).toHaveLength(1);
      expect(result.customer!.loyaltySummary.totalOrders).toBe(15);
      expect(result.customer!.savedAddresses).toEqual(['12 شارع النيل']);

      expect(result.catalog.products).toHaveLength(2);
      expect(result.catalog.products[0].name).toBe('Cappuccino');
      expect(result.catalog.products[0].variants).toHaveLength(2);
      expect(result.catalog.products[0].requiredOptions).toHaveLength(1);
      expect(result.catalog.products[0].optionalOptions).toHaveLength(1);

      expect(result.activeOrder).toBeDefined();
      expect(result.activeOrder!.items).toHaveLength(1);
      expect(result.activeOrder!.deliveryMethod).toBe('DELIVERY');
      expect(result.activeOrder!.runningTotal).toBe('35.00');

      expect(result.conversation.currentStep).toBe('NEW');
    });

    it('does not include recipe, inventory, cost, or profit', async () => {
      const result = await service.build({
        cafeId: 'cafe-1',
        customerId: 'cust-1',
        message: 'Cappuccino',
      });

      const json = JSON.stringify(result);
      expect(json).not.toContain('recipe');
      expect(json).not.toContain('inventory');
      expect(json).not.toContain('cost');
      expect(json).not.toContain('profit');
      expect(json).not.toContain('supplier');
      expect(json).not.toContain('currentQty');
      expect(json).not.toContain('costPerUnit');
    });
  });

  describe('Unknown customer', () => {
    beforeEach(async () => {
      prisma = createMockPrisma();
      prisma.cafe.findUnique.mockResolvedValue(mockCafe);
      prisma.customer.findUnique.mockResolvedValue(null);
      prisma.product.findMany
        .mockResolvedValueOnce(mockProducts)
        .mockResolvedValueOnce(mockFullProducts.slice(0, 1));
      service = await buildService(prisma);
    });

    it('returns no customer context when customerId is provided but not found', async () => {
      const result = await service.build({
        cafeId: 'cafe-1',
        customerId: 'nonexistent',
        message: 'Cappuccino',
      });

      expect(result.customer).toBeUndefined();
      expect(result.business).toBeDefined();
      expect(result.catalog.products).toHaveLength(1);
    });

    it('returns no customer context when customerId is not provided', async () => {
      const result = await service.build({
        cafeId: 'cafe-1',
        message: 'Cappuccino',
      });

      expect(result.customer).toBeUndefined();
      expect(result.activeOrder).toBeUndefined();
      expect(result.business).toBeDefined();
    });
  });

  describe('No product match', () => {
    beforeEach(async () => {
      prisma = createMockPrisma();
      prisma.cafe.findUnique.mockResolvedValue(mockCafe);
      prisma.product.findMany.mockResolvedValueOnce(mockProducts);
      service = await buildService(prisma);
    });

    it('returns empty catalog when no products match the message', async () => {
      const result = await service.build({
        cafeId: 'cafe-1',
        message: 'hello how are you?',
      });

      expect(result.catalog.products).toHaveLength(0);
      expect(result.catalog.totalCount).toBe(0);
      expect(result.business).toBeDefined();
    });
  });

  describe('Business closed', () => {
    beforeEach(async () => {
      const fullProduct = mockFullProducts[0];
      prisma = createMockPrisma();
      prisma.cafe.findUnique.mockResolvedValue({ ...mockCafe, active: false });
      prisma.product.findMany
        .mockResolvedValueOnce(mockProducts)
        .mockResolvedValueOnce([fullProduct]);
      service = await buildService(prisma);
    });

    it('returns workingNow as false when business is inactive', async () => {
      const result = await service.build({
        cafeId: 'cafe-1',
        message: 'Cappuccino',
      });

      expect(result.business.workingNow).toBe(false);
      expect(result.catalog.products).toHaveLength(1);
    });
  });

  describe('Empty message', () => {
    beforeEach(async () => {
      prisma = createMockPrisma();
      service = await buildService(prisma);
    });

    it('throws when message is empty', async () => {
      await expect(service.build({ cafeId: 'cafe-1', message: '' }))
        .rejects.toThrow('Message is required');
    });

    it('throws when message is whitespace only', async () => {
      await expect(service.build({ cafeId: 'cafe-1', message: '   ' }))
        .rejects.toThrow('Message is required');
    });
  });

  describe('Business not found', () => {
    beforeEach(async () => {
      prisma = createMockPrisma();
      prisma.cafe.findUnique.mockResolvedValue(null);
      service = await buildService(prisma);
    });

    it('throws when cafe ID does not exist', async () => {
      await expect(service.build({ cafeId: 'nonexistent', message: 'Cappuccino' }))
        .rejects.toThrow('Business not found');
    });
  });

  describe('Multiple products matched', () => {
    beforeEach(async () => {
      const manyProductNames = Array.from({ length: 50 }, (_, i) => ({
        id: `prod-${i}`,
        name: `Product ${i}`,
      }));
      // Insert Cappuccino and Latte among them
      manyProductNames.push({ id: 'prod-cap', name: 'Cappuccino' });
      manyProductNames.push({ id: 'prod-lat', name: 'Latte' });

      prisma = createMockPrisma();
      prisma.cafe.findUnique.mockResolvedValue(mockCafe);
      prisma.product.findMany
        .mockResolvedValueOnce(manyProductNames)
        .mockResolvedValueOnce(mockFullProducts);
      service = await buildService(prisma);
    });

    it('matches only relevant products from a large catalog', async () => {
      const result = await service.build({
        cafeId: 'cafe-1',
        message: 'I want Cappuccino and Latte',
      });

      expect(result.catalog.products).toHaveLength(2);
      expect(result.catalog.products.map(p => p.name)).toContain('Cappuccino');
      expect(result.catalog.products.map(p => p.name)).toContain('Latte');
    });
  });

  describe('Large catalog performance (10,000+ products)', () => {
    beforeEach(async () => {
      const tenThousandProducts = Array.from({ length: 10000 }, (_, i) => ({
        id: `prod-${i}`,
        name: `Product ${i}`,
      }));
      // Add matching product at the end
      tenThousandProducts.push({ id: 'prod-cap', name: 'Cappuccino' });

      prisma = createMockPrisma();
      prisma.cafe.findUnique.mockResolvedValue(mockCafe);
      prisma.product.findMany
        .mockResolvedValueOnce(tenThousandProducts)
        .mockResolvedValueOnce(mockFullProducts.slice(0, 1));
      service = await buildService(prisma);
    });

    it('completes within acceptable time for 10,000 products', async () => {
      const start = Date.now();
      const result = await service.build({
        cafeId: 'cafe-1',
        message: 'I want a Cappuccino please',
      });
      const elapsed = Date.now() - start;

      expect(result.catalog.products).toHaveLength(1);
      expect(result.catalog.products[0].name).toBe('Cappuccino');
      // Should complete well under 500ms even for 10k products
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('Conversation context passthrough', () => {
    beforeEach(async () => {
      prisma = createMockPrisma();
      prisma.cafe.findUnique.mockResolvedValue(mockCafe);
      prisma.product.findMany.mockResolvedValueOnce([]);
      service = await buildService(prisma);
    });

    it('passes through conversation state from input', async () => {
      const result = await service.build({
        cafeId: 'cafe-1',
        message: 'yes',
        currentIntent: 'CONFIRM_ORDER',
        currentStep: 'AWAITING_CONFIRMATION',
        collectedInformation: { productName: 'Cappuccino' },
        missingInformation: ['quantity'],
      });

      expect(result.conversation.currentIntent).toBe('CONFIRM_ORDER');
      expect(result.conversation.currentStep).toBe('AWAITING_CONFIRMATION');
      expect(result.conversation.collectedInformation).toEqual({ productName: 'Cappuccino' });
      expect(result.conversation.missingInformation).toEqual(['quantity']);
    });
  });

  describe('Default configuration', () => {
    beforeEach(async () => {
      prisma = createMockPrisma();
      prisma.cafe.findUnique.mockResolvedValue({
        id: 'cafe-1',
        name: 'Minimal Cafe',
        category: 'restaurant',
        timezone: 'Africa/Cairo',
        active: true,
        configuration: {},
      });
      prisma.product.findMany.mockResolvedValueOnce([]);
      service = await buildService(prisma);
    });

    it('uses defaults when configuration is empty', async () => {
      const result = await service.build({
        cafeId: 'cafe-1',
        message: 'hello',
      });

      expect(result.business.personality).toBe('friendly');
      expect(result.business.greetingStyle).toBe('casual');
      expect(result.business.language).toBe('ar-EG');
      expect(result.business.deliveryAvailable).toBe(false);
      expect(result.business.pickupAvailable).toBe(false);
      expect(result.business.promotionEnabled).toBe(false);
      expect(result.business.workingNow).toBe(true);
    });
  });
});

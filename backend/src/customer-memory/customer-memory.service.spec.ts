import { CustomerMemoryService } from './customer-memory.service';
import { CUSTOMER_MEMORY_KEY, CustomerMemoryScope } from './customer-memory.types';

describe('CustomerMemoryService', () => {
  let service: CustomerMemoryService;
  let customers: any[];
  let orders: any[];
  let products: any[];
  let prisma: any;

  const scope: CustomerMemoryScope = {
    cafeId: 'cafe-a',
    customerId: 'customer-a',
    channel: 'TELEGRAM',
    channelIdentity: 'tg_100',
    botIdentity: 'bot-a',
  };

  beforeEach(() => {
    customers = [
      { id: 'customer-a', cafeId: 'cafe-a', phone: 'tg_100', name: 'أحمد', preferredProducts: { legacyProduct: 2 } },
      { id: 'customer-b', cafeId: 'cafe-a', phone: 'tg_200', name: 'سارة', preferredProducts: {} },
      { id: 'customer-c', cafeId: 'cafe-b', phone: 'tg_100', name: 'محمود', preferredProducts: {} },
    ];
    products = [
      { id: 'latte', cafeId: 'cafe-a', name: 'لاتيه', price: 70, active: true },
      { id: 'croissant', cafeId: 'cafe-a', name: 'كرواسون', price: 50, active: true },
    ];
    orders = [
      {
        id: 'order-a',
        cafeId: 'cafe-a',
        branchId: 'branch-a',
        customerId: 'customer-a',
        status: 'DELIVERED',
        sourceType: 'TELEGRAM_ORDER',
        createdAt: new Date('2026-07-10T10:00:00Z'),
        items: [
          { productId: 'latte', quantity: 2, unitPrice: 60, notes: 'الحجم: وسط', product: { name: 'لاتيه' } },
          { productId: 'croissant', quantity: 1, unitPrice: 50, notes: null, product: { name: 'كرواسون' } },
        ],
      },
      {
        id: 'order-b',
        cafeId: 'cafe-a',
        branchId: 'branch-a',
        customerId: 'customer-b',
        status: 'DELIVERED',
        sourceType: 'TELEGRAM_ORDER',
        createdAt: new Date('2026-07-11T10:00:00Z'),
        items: [{ productId: 'latte', quantity: 1, unitPrice: 60, notes: null, product: { name: 'لاتيه' } }],
      },
    ];

    prisma = {
      customer: {
        findFirst: jest.fn(async ({ where }: any) => customers.find((customer) =>
          (!where.id || customer.id === where.id) &&
          (!where.cafeId || customer.cafeId === where.cafeId) &&
          (!where.phone || customer.phone === where.phone),
        ) || null),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const customer = customers.find((item) =>
            item.id === where.id && item.cafeId === where.cafeId && item.phone === where.phone,
          );
          if (!customer) return { count: 0 };
          Object.assign(customer, data);
          return { count: 1 };
        }),
      },
      order: {
        findFirst: jest.fn(async ({ where }: any) => orders
          .filter((order) =>
            (!where.id || order.id === where.id) &&
            order.cafeId === where.cafeId &&
            order.customerId === where.customerId &&
            where.status.in.includes(order.status) &&
            !where.sourceType.notIn.includes(order.sourceType),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] || null),
      },
      product: {
        findMany: jest.fn(async ({ where }: any) => products.filter((product) =>
          product.cafeId === where.cafeId && where.id.in.includes(product.id),
        )),
      },
    };
    service = new CustomerMemoryService(prisma);
  });

  describe('identity and explicit memory', () => {
    it('saves a validated preferred name without treating it as an order', async () => {
      expect(service.isLikelyName('يوسف')).toBe(true);
      expect(service.parseExplicitCommand('يوسف')).toBeNull();
      await service.savePreferredName(scope, 'يوسف');
      expect(customers[0].name).toBe('يوسف');
      expect((await service.getMemory(scope))?.preferredName).toBe('يوسف');
    });

    it('changes a preferred name explicitly', async () => {
      const result = await service.applyExplicitCommand(scope, 'ناديني محمود بدل أحمد');
      expect(result.preferredName).toBe('محمود');
      expect(customers[0].name).toBe('محمود');
    });

    it('rejects order text, tokens, and passwords as names', () => {
      expect(service.isLikelyName('عايز قهوة')).toBe(false);
      expect(service.isLikelyName('password')).toBe(false);
      expect(service.parseExplicitCommand('token abc password 123')).toBeNull();
    });

    it('isolates the same channel identity across cafes', async () => {
      await service.applyExplicitCommand(scope, 'أنا دايما بشرب القهوة من غير سكر');
      const otherCafe = { ...scope, cafeId: 'cafe-b', customerId: 'customer-c' };
      expect((await service.getMemory(otherCafe))?.explicitPreferences.sugarPreference).toBeUndefined();
    });

    it('rejects a foreign cafe/customer scope in one scoped query', async () => {
      const foreign = await service.getMemory({ ...scope, cafeId: 'cafe-b' });
      expect(foreign).toBeNull();
      expect(prisma.customer.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: 'customer-a', cafeId: 'cafe-b', phone: 'tg_100' }),
      }));
    });

    it('stores an explicit sugar preference at full priority', async () => {
      await service.applyExplicitCommand(scope, 'أنا دايما بشرب القهوة من غير سكر');
      expect((await service.getMemory(scope))?.explicitPreferences.sugarPreference).toBe('NO_SUGAR');
    });

    it('stores a dislike without turning it into an allergy', async () => {
      await service.applyExplicitCommand(scope, 'مش بحب القرفة');
      const memory = await service.getMemory(scope);
      expect(memory?.explicitPreferences.dislikedIngredients).toEqual(['cinnamon']);
      expect(JSON.stringify(memory)).not.toMatch(/allergy|حساسية/i);
    });

    it('stores an explicit conversation style', async () => {
      await service.applyExplicitCommand(scope, 'عايز أطلب بسرعة');
      expect((await service.getMemory(scope))?.conversationStyle).toBe('FAST');
    });

    it('disables suggestions explicitly', async () => {
      await service.applyExplicitCommand(scope, 'متقترحليش إضافات');
      expect((await service.getMemory(scope))?.explicitPreferences.disableUpselling).toBe(true);
    });

    it('removes only the requested preference', async () => {
      await service.applyExplicitCommand(scope, 'أنا دايما بشرب القهوة من غير سكر');
      await service.applyExplicitCommand(scope, 'مش بحب القرفة');
      await service.applyExplicitCommand(scope, 'امسح تفضيل السكر');
      const memory = await service.getMemory(scope);
      expect(memory?.explicitPreferences.sugarPreference).toBeUndefined();
      expect(memory?.explicitPreferences.dislikedIngredients).toEqual(['cinnamon']);
    });
  });

  describe('inferred memory and decay', () => {
    const observation = (orderId: string, sugarPreference = 'NO_SUGAR') => ({
      orderId,
      status: 'COMPLETED',
      sugarPreference,
      coffeeRoast: 'LIGHT',
      products: ['latte'],
      occurredAt: new Date('2026-07-01T19:00:00Z'),
    });

    it('keeps one order as a weak observation', async () => {
      await service.observeOrder(scope, observation('one'));
      const signal = (await service.getMemory(scope))?.inferredPreferences.sugarPreference;
      expect(signal?.evidenceCount).toBe(1);
      expect(signal?.confidence).toBeLessThan(0.5);
    });

    it('raises confidence only after repeated consistent orders', async () => {
      for (let i = 1; i <= 5; i++) await service.observeOrder(scope, observation(`same-${i}`));
      const signal = (await service.getMemory(scope, new Date('2026-07-01T19:00:00Z')))?.inferredPreferences.sugarPreference;
      expect(signal?.evidenceCount).toBe(5);
      expect(signal?.confidence).toBeGreaterThanOrEqual(0.79);
    });

    it('lowers confidence when behavior conflicts', async () => {
      for (let i = 1; i <= 5; i++) await service.observeOrder(scope, observation(`same-${i}`));
      const before = (await service.getMemory(scope))!.inferredPreferences.sugarPreference!.confidence;
      await service.observeOrder(scope, observation('conflict', 'EXTRA_SUGAR'));
      const after = (await service.getMemory(scope))!.inferredPreferences.sugarPreference!.confidence;
      expect(after).toBeLessThan(before);
    });

    it('decays old inferred preferences while explicit memory remains', async () => {
      for (let i = 1; i <= 5; i++) await service.observeOrder(scope, observation(`old-${i}`));
      await service.applyExplicitCommand(scope, 'أنا دايما بشرب القهوة من غير سكر');
      const later = new Date('2026-10-29T19:00:00Z');
      const memory = await service.getMemory(scope, later);
      expect(memory?.inferredPreferences.sugarPreference!.confidence).toBeLessThan(0.9);
      expect(memory?.explicitPreferences.sugarPreference).toBe('NO_SUGAR');
    });

    it('does not learn from cancelled, test, or duplicate orders', async () => {
      expect(await service.observeOrder(scope, { ...observation('cancel'), status: 'CANCELLED' })).toBe(false);
      expect(await service.observeOrder(scope, { ...observation('test'), isTest: true })).toBe(false);
      expect(await service.observeOrder(scope, { ...observation('duplicate'), isDuplicate: true })).toBe(false);
      expect((await service.getMemory(scope))?.inferredPreferences.sugarPreference).toBeUndefined();
    });

    it('protects against duplicate observation updates', async () => {
      await service.observeOrder(scope, observation('same-id'));
      expect(await service.observeOrder(scope, observation('same-id'))).toBe(false);
      expect((await service.getMemory(scope))?.inferredPreferences.sugarPreference?.evidenceCount).toBe(1);
    });
  });

  describe('quick ordering and current choice', () => {
    it('prefills strong memory and still requires confirmation', async () => {
      for (let i = 1; i <= 5; i++) {
        await service.observeOrder(scope, {
          orderId: `coffee-${i}`,
          status: 'DELIVERED',
          coffeeRoast: 'LIGHT',
          coffeeBlend: 'PLAIN',
          sugarPreference: 'NO_SUGAR',
        });
      }
      const assisted = await service.resolveCoffeePreferences(scope, {});
      expect(assisted.draft).toEqual({ roast: 'LIGHT', blend: 'PLAIN', sugar: 'NO_SUGAR' });
      expect(assisted.memoryFields).toHaveLength(3);
      expect(assisted.requiresConfirmation).toBe(true);
    });

    it('lets current customer words override stored memory', async () => {
      await service.applyExplicitCommand(scope, 'أنا دايما بشرب القهوة من غير سكر');
      const assisted = await service.resolveCoffeePreferences(scope, { sugar: 'EXTRA_SUGAR' });
      expect(assisted.draft.sugar).toBe('EXTRA_SUGAR');
      expect(assisted.sources.sugar).toBe('CURRENT');
    });

    it('builds a compact coffee-only context without conversations', async () => {
      await service.applyExplicitCommand(scope, 'أنا دايما بشرب القهوة من غير سكر');
      const summary = await service.buildSummary(scope, 'COFFEE');
      expect(summary?.strongPreferences.sugar).toBe('NO_SUGAR');
      expect(JSON.stringify(summary)).not.toMatch(/message|conversation|token|password/i);
    });
  });

  describe('repeat previous order', () => {
    it('retrieves only the scoped customer latest eligible order', async () => {
      const preview = await service.buildRepeatOrderPreview(scope);
      expect(preview?.sourceOrderId).toBe('order-a');
      expect(prisma.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ cafeId: 'cafe-a', customerId: 'customer-a' }),
      }));
    });

    it('rejects a foreign customer order', async () => {
      expect(await service.buildRepeatOrderPreview(scope, 'order-b')).toBeNull();
    });

    it('rejects a foreign cafe order', async () => {
      const otherCafe = { ...scope, cafeId: 'cafe-b', customerId: 'customer-c' };
      expect(await service.buildRepeatOrderPreview(otherCafe, 'order-a')).toBeNull();
    });

    it('uses current prices and reports price changes', async () => {
      const preview = await service.buildRepeatOrderPreview(scope);
      expect(preview?.items.find((item) => item.productId === 'latte')?.currentUnitPrice).toBe(70);
      expect(preview?.priceChanged).toBe(true);
      expect(preview?.currentTotal).toBe(190);
    });

    it('does not silently add unavailable products', async () => {
      products.find((product) => product.id === 'croissant').active = false;
      const preview = await service.buildRepeatOrderPreview(scope);
      expect(preview?.unavailableItems.map((item) => item.productId)).toEqual(['croissant']);
      expect(preview?.currentTotal).toBe(140);
      expect(preview?.canConfirmAll).toBe(false);
    });

    it('always marks a repeat preview as requiring confirmation', async () => {
      expect((await service.buildRepeatOrderPreview(scope))?.requiresConfirmation).toBe(true);
      expect(prisma.order.create).toBeUndefined();
    });
  });

  describe('privacy, reset, and metrics', () => {
    it('stores a hashed channel key instead of a raw chat id', async () => {
      await service.applyExplicitCommand(scope, 'متقترحليش إضافات');
      const stored = customers[0].preferredProducts[CUSTOMER_MEMORY_KEY];
      expect(JSON.stringify(stored)).not.toContain('tg_100');
      expect(Object.keys(stored.channels)[0]).toMatch(/^TELEGRAM:[a-f0-9]{24}$/);
    });

    it('never stores the full preference command or secrets', async () => {
      const message = 'أنا دايما بشرب القهوة من غير سكر';
      await service.applyExplicitCommand(scope, message);
      const stored = JSON.stringify(customers[0].preferredProducts);
      expect(stored).not.toContain(message);
      expect(stored).not.toMatch(/password|token/i);
    });

    it('resets preferences without touching legacy counters or orders', async () => {
      await service.applyExplicitCommand(scope, 'أنا دايما بشرب القهوة من غير سكر');
      await service.applyExplicitCommand(scope, 'امسح تفضيلاتي');
      const memory = await service.getMemory(scope);
      expect(memory?.explicitPreferences.sugarPreference).toBeUndefined();
      expect(customers[0].preferredProducts.legacyProduct).toBe(2);
      expect(orders).toHaveLength(2);
    });

    it('publishes privacy-safe aggregate metrics only', async () => {
      await service.getMemory(scope);
      service.recordMemoryRejection();
      service.recordOrderCompleted(2, 4000, true);
      const metrics = service.getMetricsSnapshot();
      expect(metrics.knownCustomerPercentage).toBeGreaterThan(0);
      expect(metrics.averageQuestionsPerCompletedOrder).toBe(2);
      expect(JSON.stringify(metrics)).not.toContain('customer-a');
    });
  });
});

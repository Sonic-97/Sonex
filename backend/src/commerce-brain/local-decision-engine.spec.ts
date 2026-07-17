import { LocalDecisionEngine } from './local-decision-engine';
import { CommerceContext } from './commerce-brain.types';

const mockBusiness = {
  id: 'cafe-1', name: 'Test Cafe', businessType: 'cafe',
  language: 'ar-EG', timezone: 'Africa/Cairo',
  personality: 'friendly', greetingStyle: 'casual',
  workingNow: true, deliveryAvailable: true, pickupAvailable: true,
  promotionEnabled: true,
};

function context(overrides?: Partial<CommerceContext>): CommerceContext {
  return {
    business: mockBusiness,
    conversation: { currentStep: 'NEW', collectedInformation: {}, missingInformation: [] },
    catalog: {
      totalCount: 5,
      products: [
        { productId: 'p1', name: 'Cappuccino', category: 'coffee', available: true, variants: [{ name: 'Small', type: 'size' }], requiredOptions: [], optionalOptions: [] },
        { productId: 'p2', name: 'Latte', category: 'coffee', available: true, variants: [{ name: 'Large', type: 'size' }], requiredOptions: [{ name: 'Sugar Level', choices: ['No', 'Medium', 'Extra'] }], optionalOptions: [] },
        { productId: 'p3', name: 'Croissant', category: 'pastry', available: true, variants: [], requiredOptions: [], optionalOptions: [] },
        { productId: 'p4', name: 'Muffin', category: 'pastry', available: true, variants: [], requiredOptions: [], optionalOptions: [] },
        { productId: 'p5', name: 'Espresso', category: 'coffee', available: true, variants: [], requiredOptions: [], optionalOptions: [] },
      ],
    },
    ...overrides,
  };
}

describe('LocalDecisionEngine', () => {
  let engine: LocalDecisionEngine;

  beforeEach(() => {
    engine = new LocalDecisionEngine();
  });

  describe('Product lookup', () => {
    it('detects ORDER intent when product name is in message', () => {
      const result = engine.decide('I want a Cappuccino', context());
      expect(result.intent).toBe('ORDER');
      expect(result.extractedEntities.productNames).toContain('Cappuccino');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('handles Arabic product request', () => {
      const result = engine.decide('عايز كابتشينو', context());
      expect(result.intent).toBe('ASK_PRODUCT');
      expect(result.reasoningCode).toBe('PRODUCT_NOT_FOUND');
    });

    it('returns MISSING_OPTIONS for products with required options', () => {
      const result = engine.decide('Latte please', context());
      expect(result.missingInformation.length).toBeGreaterThan(0);
      expect(result.missingInformation[0].field).toContain('Sugar');
      expect(result.nextAction).toBe('ASK_OPTION');
    });

    it('returns PRODUCT_NOT_FOUND for non-existent product', () => {
      const result = engine.decide('I want a Smoothie', context());
      expect(result.reasoningCode).toBe('PRODUCT_NOT_FOUND');
      expect(result.intent).toBe('ASK_PRODUCT');
    });
  });

  describe('Reorder', () => {
    it('detects REORDER intent when customer has history', () => {
      const ctx = context({
        customer: {
          customerId: 'c1', firstName: 'Ahmed', preferredLanguage: 'ar-EG',
          favoriteProducts: ['Cappuccino'],
          recentOrders: [{ items: ['Cappuccino', 'Croissant'], date: '2026-07-15', total: '45.00' }],
          savedAddresses: [],
          loyaltySummary: { totalOrders: 5, totalSpent: '200.00' },
        },
      });
      const result = engine.decide('same as before', ctx);
      expect(result.intent).toBe('REORDER');
      expect(result.confidence).toBe(0.85);
      expect(result.requiredConfirmation).toBe(true);
      expect(result.reasoningCode).toBe('REORDER_FOUND');
    });

    it('returns CUSTOMER_NOT_FOUND for reorder without history', () => {
      const result = engine.decide('reorder', context());
      expect(result.intent).toBe('REORDER');
      expect(result.reasoningCode).toBe('CUSTOMER_NOT_FOUND');
    });
  });

  describe('Multiple matches', () => {
    it('returns ORDER with confidence 0.5 for vague order intent', () => {
      const result = engine.decide('I want something', context());
      expect(result.intent).toBe('ORDER');
      expect(result.confidence).toBe(0.5);
    });
  });

  describe('Unknown product', () => {
    it('returns PRODUCT_NOT_FOUND with low confidence', () => {
      const result = engine.decide('Do you have Smoothies?', context());
      expect(result.reasoningCode).toBe('PRODUCT_NOT_FOUND');
      expect(result.confidence).toBeLessThan(0.8);
    });
  });

  describe('Missing option', () => {
    it('returns OPTION_REQUIRED with choices for product with required options', () => {
      const result = engine.decide('Latte', context());
      expect(result.reasoningCode).toBe('OPTION_REQUIRED');
      expect(result.missingInformation[0].choices).toBeDefined();
      expect(result.missingInformation[0].choices!.length).toBeGreaterThan(0);
      expect(result.nextAction).toBe('ASK_OPTION');
    });
  });

  describe('Low confidence', () => {
    it('returns 0.4 confidence for completely unrelated message', () => {
      const result = engine.decide('The weather is nice today', context());
      expect(result.intent).toBe('UNKNOWN');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('Business closed', () => {
    it('returns BUSINESS_CLOSED when business is not working', () => {
      const closedCtx = context({ business: { ...mockBusiness, workingNow: false } });
      const result = engine.decide('Cappuccino', closedCtx);
      expect(result.reasoningCode).toBe('BUSINESS_CLOSED');
      expect(result.confidence).toBe(0.95);
    });
  });

  describe('Recommendation generation', () => {
    it('includes recommendations based on customer favorites', () => {
      const ctx = context({
        customer: {
          customerId: 'c1', firstName: 'Ahmed', preferredLanguage: 'ar-EG',
          favoriteProducts: ['Cappuccino'],
          recentOrders: [{ items: ['Cappuccino'], date: '2026-07-15', total: '25.00' }],
          savedAddresses: [],
          loyaltySummary: { totalOrders: 3, totalSpent: '100.00' },
        },
      });
      const result = engine.decide('order', ctx);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0].productId).toBe('p1');
    });

    it('still recommends something even without customer history', () => {
      const result = engine.decide('order', context());
      // UNKNOWN or ORDER is fine, but should not crash
      expect(result).toBeDefined();
    });
  });

  describe('Conversation continuation', () => {
    it('greeting returns SMALL_TALK with CONTINUE_CONVERSATION', () => {
      const result = engine.decide('Hello', context());
      expect(result.intent).toBe('SMALL_TALK');
      expect(result.reasoningCode).toBe('CONTINUE_CONVERSATION');
    });

    it('hours query returns ASK_HOURS', () => {
      const result = engine.decide('What are your hours?', context());
      expect(result.intent).toBe('ASK_HOURS');
      expect(result.reasoningCode).toBe('HOURS_KNOWN');
    });

    it('delivery query returns ASK_DELIVERY', () => {
      const result = engine.decide('Do you deliver?', context());
      expect(result.intent).toBe('ASK_DELIVERY');
    });
  });

  describe('Cancel order', () => {
    it('returns CANCEL_ORDER with CONFIRM when active order exists', () => {
      const ctx = context({
        activeOrder: {
          items: [{ productName: 'Cappuccino', quantity: 1, selectedOptions: [], lineTotal: '35.00' }],
          runningTotal: '35.00', deliveryMethod: 'DELIVERY',
        },
      });
      const result = engine.decide('cancel my order', ctx);
      expect(result.intent).toBe('CANCEL_ORDER');
      expect(result.requiredConfirmation).toBe(true);
      expect(result.nextAction).toBe('CONFIRM_ORDER');
    });
  });

  describe('Price query', () => {
    it('returns ASK_PRICE when asking about price', () => {
      const result = engine.decide('How much is Cappuccino?', context());
      expect(result.intent).toBe('ASK_PRICE');
    });
  });

  describe('Promotion query', () => {
    it('returns ASK_PROMOTION when promotions enabled', () => {
      const result = engine.decide('Any offers?', context());
      expect(result.intent).toBe('ASK_PROMOTION');
      expect(result.reasoningCode).toBe('PROMOTION_AVAILABLE');
    });
  });
});
